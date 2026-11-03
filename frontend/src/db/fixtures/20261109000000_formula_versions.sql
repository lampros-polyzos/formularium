-- Formula history: save versions of your own formulas, each with a note on what changed and why.
--
--   formulation_versions  one row per saved version: the whole formula as it was (name, profile, target weight and pH,
--                         and every ingredient with its phase and percentage) plus your note
--
-- A version is a frozen copy, so later edits, and even deleting an ingredient from the library, never change it.
-- The version number counts up per formula and is assigned here, so two saves at once cannot clash.
-- Only the note can be edited afterwards. Deleting a formula deletes its versions.
-- Safe to run more than once.

create table if not exists public.formulation_versions (
  id uuid primary key default gen_random_uuid(),
  formulation_id uuid not null references public.formulations(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  version_number integer not null,
  note text,
  name text not null,
  profile_id text,
  target_weight_g numeric,
  target_ph numeric,
  -- [{ ingredient_id, inci_name, trade_name, phase, percentage, is_qs }]
  lines jsonb not null default '[]'::jsonb check (jsonb_typeof(lines) = 'array'),
  created_at timestamptz not null default now(),
  unique (formulation_id, version_number)
);
create index if not exists formulation_versions_formulation_idx on public.formulation_versions (formulation_id, version_number desc);

-- ---------- Numbering, and nothing but the note may change ----------

create or replace function public.formulation_versions_before_write()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    -- One save at a time per formula, so the numbers never repeat
    perform pg_advisory_xact_lock(hashtext(new.formulation_id::text));
    select coalesce(max(version_number), 0) + 1 into new.version_number
      from public.formulation_versions where formulation_id = new.formulation_id;
    new.created_at := now();
    return new;
  end if;

  if (new.formulation_id, new.user_id, new.version_number, new.name, new.profile_id, new.target_weight_g, new.target_ph, new.lines, new.created_at)
     is distinct from
     (old.formulation_id, old.user_id, old.version_number, old.name, old.profile_id, old.target_weight_g, old.target_ph, old.lines, old.created_at) then
    raise exception 'A saved version cannot be changed, only its note' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists formulation_versions_before_write on public.formulation_versions;
create trigger formulation_versions_before_write
  before insert or update on public.formulation_versions
  for each row execute function public.formulation_versions_before_write();

-- ---------- Row-level security: versions belong to the owner of the formula ----------

alter table public.formulation_versions enable row level security;

drop policy if exists "Users read their own versions" on public.formulation_versions;
create policy "Users read their own versions" on public.formulation_versions
  for select to authenticated
  using (user_id = auth.uid());

-- A version can only be added to a formula you own
drop policy if exists "Users add versions to their own formulas" on public.formulation_versions;
create policy "Users add versions to their own formulas" on public.formulation_versions
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.formulations f where f.id = formulation_id and f.user_id = auth.uid())
  );

drop policy if exists "Users edit the note on their own versions" on public.formulation_versions;
create policy "Users edit the note on their own versions" on public.formulation_versions
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Users delete their own versions" on public.formulation_versions;
create policy "Users delete their own versions" on public.formulation_versions
  for delete to authenticated
  using (user_id = auth.uid());
