-- Batch log: record the batches you actually make, optionally use up stash, and follow their stability.
--
--   batches            one row per batch (lot number, size, status, measurements, notes)
--   batch_ingredients  what went in: a snapshot of the formula's ingredients and the grams weighed
--   batch_stash_usage  which stash lots were used and how many grams, so a batch can be undone
--   batch_checks       stability check-ins (24 hours, 1 week, 4 weeks, 12 weeks, plus your own)
--
-- Nothing here touches your stash unless create_batch is called with stash allocations,
-- and then the whole batch and every deduction succeed or fail together.
-- Safe to run more than once.

-- ---------- Tables ----------

create table if not exists public.batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  formulation_id uuid references public.formulations(id) on delete set null,
  name text not null,
  lot_number text not null,
  batch_size_g numeric not null check (batch_size_g > 0),
  made_on date not null default current_date,
  status text not null default 'active' check (status in ('active', 'archived', 'discarded', 'voided')),
  target_ph numeric,
  measured_ph numeric,
  final_weight_g numeric check (final_weight_g is null or final_weight_g > 0),
  notes text,
  stash_deducted boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, lot_number)
);
create index if not exists batches_user_made_idx on public.batches (user_id, made_on desc);
create index if not exists batches_formulation_idx on public.batches (formulation_id);

create table if not exists public.batch_ingredients (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.batches(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ingredient_id uuid references public.ingredients(id) on delete set null,
  name text not null,
  inci_name text,
  phase text not null,
  percentage numeric not null,
  planned_g numeric not null,
  actual_g numeric not null
);
create index if not exists batch_ingredients_batch_idx on public.batch_ingredients (batch_id);

create table if not exists public.batch_stash_usage (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.batches(id) on delete cascade,
  batch_ingredient_id uuid references public.batch_ingredients(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  stash_id uuid references public.user_stash(id) on delete set null,  -- the lot may be deleted later
  grams numeric not null check (grams > 0),
  label text
);
create index if not exists batch_stash_usage_batch_idx on public.batch_stash_usage (batch_id);

create table if not exists public.batch_checks (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.batches(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  label text not null,
  due_on date not null,
  checked_at timestamptz,
  result text check (result is null or result in ('good', 'minor', 'failed')),
  observations text[] not null default '{}',
  measured_ph numeric,
  notes text
);
create index if not exists batch_checks_batch_idx on public.batch_checks (batch_id);
create index if not exists batch_checks_due_idx on public.batch_checks (user_id, due_on) where checked_at is null;

-- ---------- Row-level security: everything belongs to its owner ----------

alter table public.batches enable row level security;
alter table public.batch_ingredients enable row level security;
alter table public.batch_stash_usage enable row level security;
alter table public.batch_checks enable row level security;

drop policy if exists "Users manage their own batches" on public.batches;
create policy "Users manage their own batches" on public.batches
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Child rows must also belong to one of the user's own batches
drop policy if exists "Users manage their own batch ingredients" on public.batch_ingredients;
create policy "Users manage their own batch ingredients" on public.batch_ingredients
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (select 1 from public.batches b where b.id = batch_id and b.user_id = auth.uid()));

drop policy if exists "Users manage their own batch stash usage" on public.batch_stash_usage;
create policy "Users manage their own batch stash usage" on public.batch_stash_usage
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (select 1 from public.batches b where b.id = batch_id and b.user_id = auth.uid()));

drop policy if exists "Users manage their own batch checks" on public.batch_checks;
create policy "Users manage their own batch checks" on public.batch_checks
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (select 1 from public.batches b where b.id = batch_id and b.user_id = auth.uid()));

-- ---------- Starting a batch ----------
--
-- p_lines is an array of
--   { ingredient_id, name, inci_name, phase, percentage, planned_g, actual_g,
--     allocations: [ { stash_id, grams, label } ] }
-- Each allocation takes grams out of that stash lot. A line with no allocations is only recorded.
-- Everything runs in one transaction: if any lot no longer holds enough, nothing is saved at all.

create or replace function public.create_batch(
  p_formulation_id uuid,
  p_name text,
  p_lot_number text,
  p_batch_size_g numeric,
  p_target_ph numeric,
  p_notes text,
  p_lines jsonb,
  p_made_on date default current_date
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_batch uuid;
  v_line jsonb;
  v_line_id uuid;
  v_alloc jsonb;
  v_grams numeric;
  v_updated integer;
  v_deducted boolean := false;
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'A batch needs at least one ingredient.';
  end if;

  insert into public.batches (formulation_id, name, lot_number, batch_size_g, target_ph, notes, made_on)
  values (p_formulation_id, p_name, p_lot_number, p_batch_size_g, p_target_ph, nullif(trim(p_notes), ''), p_made_on)
  returning id into v_batch;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    insert into public.batch_ingredients (batch_id, ingredient_id, name, inci_name, phase, percentage, planned_g, actual_g)
    values (
      v_batch,
      nullif(v_line->>'ingredient_id', '')::uuid,
      v_line->>'name',
      v_line->>'inci_name',
      v_line->>'phase',
      (v_line->>'percentage')::numeric,
      (v_line->>'planned_g')::numeric,
      coalesce((v_line->>'actual_g')::numeric, (v_line->>'planned_g')::numeric)
    )
    returning id into v_line_id;

    for v_alloc in select value from jsonb_array_elements(coalesce(v_line->'allocations', '[]'::jsonb)) loop
      v_grams := (v_alloc->>'grams')::numeric;
      if v_grams is null or v_grams <= 0 then
        raise exception 'Invalid amount to take from the stash for %.', v_line->>'name';
      end if;

      -- Only succeeds while the lot still holds enough: this is what keeps the stash from going negative
      update public.user_stash
         set amount_left_g = amount_left_g - v_grams
       where id = (v_alloc->>'stash_id')::uuid
         and user_id = auth.uid()
         and amount_left_g >= v_grams;
      get diagnostics v_updated = row_count;
      if v_updated = 0 then
        raise exception 'Not enough % left in your stash. It may have changed since you opened this window: review the batch and try again.', v_line->>'name'
          using errcode = 'P0001';
      end if;

      insert into public.batch_stash_usage (batch_id, batch_ingredient_id, stash_id, grams, label)
      values (v_batch, v_line_id, (v_alloc->>'stash_id')::uuid, v_grams, v_alloc->>'label');
      v_deducted := true;
    end loop;
  end loop;

  update public.batches set stash_deducted = v_deducted where id = v_batch;

  insert into public.batch_checks (batch_id, label, due_on)
  select v_batch, c.label, p_made_on + c.days
    from (values ('24 hours', 1), ('1 week', 7), ('4 weeks', 28), ('12 weeks', 84)) as c(label, days);

  return v_batch;
end;
$$;

-- ---------- Undoing a batch ----------
-- Marks the batch voided and puts the grams it took back into the stash lots that still exist.

create or replace function public.void_batch(p_batch_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.batches
     set status = 'voided'
   where id = p_batch_id and user_id = auth.uid() and status <> 'voided';
  if not found then
    raise exception 'Batch not found, or it was already undone.';
  end if;

  update public.user_stash s
     set amount_left_g = coalesce(s.amount_left_g, 0) + u.total
    from (select stash_id, sum(grams) as total
            from public.batch_stash_usage
           where batch_id = p_batch_id and stash_id is not null
           group by stash_id) u
   where s.id = u.stash_id and s.user_id = auth.uid();
end;
$$;

revoke execute on function public.create_batch(uuid, text, text, numeric, numeric, text, jsonb, date) from public;
revoke execute on function public.void_batch(uuid) from public;
grant execute on function public.create_batch(uuid, text, text, numeric, numeric, text, jsonb, date) to authenticated;
grant execute on function public.void_batch(uuid) to authenticated;
