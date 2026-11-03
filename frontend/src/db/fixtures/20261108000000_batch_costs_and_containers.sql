-- Batch costs and containers.
--
-- A batch now remembers what it really cost and what it was filled into:
--
--   batch_stash_usage.price_per_g        the price of the stash lot at the moment grams were taken from it
--   batch_ingredients.cost               what that ingredient cost in this batch (null = no price known)
--   batch_ingredients.cost_estimated     true when some of the cost is a guess rather than a recorded price
--   batches.ingredient_cost              the total (null when nothing could be priced)
--   batches.unpriced_count               how many ingredients had no price at all
--   batches.container_*, density_g_ml    the container picked, how many it fills, and the density used to size it
--
-- Costs are worked out here, inside create_batch, from the prices stored on the stash lots that were used, in
-- the same transaction as the deduction. Grams that did not come out of the stash are priced with an
-- estimate the app sends (the average price of that ingredient across your lots), and flagged as estimated.
-- A price of 0 means "not entered" and is treated as unknown.
-- Safe to run more than once. Requires 20261105000000_batch_log.sql.

alter table public.batches
  add column if not exists container_id uuid references public.user_containers (id) on delete set null,
  add column if not exists container_name text,
  add column if not exists container_volume_ml numeric check (container_volume_ml is null or container_volume_ml > 0),
  add column if not exists container_count numeric check (container_count is null or container_count > 0),
  add column if not exists container_unit_price numeric check (container_unit_price is null or container_unit_price >= 0),
  add column if not exists density_g_ml numeric check (density_g_ml is null or density_g_ml > 0),
  add column if not exists ingredient_cost numeric check (ingredient_cost is null or ingredient_cost >= 0),
  add column if not exists unpriced_count integer not null default 0;

alter table public.batch_ingredients
  add column if not exists cost numeric check (cost is null or cost >= 0),
  add column if not exists cost_estimated boolean not null default false;

alter table public.batch_stash_usage
  add column if not exists price_per_g numeric check (price_per_g is null or price_per_g >= 0);

create index if not exists batches_container_idx on public.batches (container_id) where container_id is not null;

-- ---------- Starting a batch ----------
--
-- p_lines is an array of
--   { ingredient_id, name, inci_name, phase, percentage, planned_g, actual_g, est_price_per_g,
--     allocations: [ { stash_id, grams, label } ] }
-- p_container is optional: { id, name, volume_ml, count, unit_price, density_g_ml }
--
-- The function's arguments changed, so the old version is dropped first; calls that don't pass p_container
-- keep working because it has a default.

drop function if exists public.create_batch(uuid, text, text, numeric, numeric, text, jsonb, date);

create or replace function public.create_batch(
  p_formulation_id uuid,
  p_name text,
  p_lot_number text,
  p_batch_size_g numeric,
  p_target_ph numeric,
  p_notes text,
  p_lines jsonb,
  p_made_on date default current_date,
  p_container jsonb default null
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
  v_actual numeric;
  v_price numeric;
  v_real numeric;
  v_allocated numeric;
  v_unknown numeric;
  v_has_price boolean;
  v_est numeric;
  v_rest numeric;
  v_cost numeric;
  v_estimated boolean;
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'A batch needs at least one ingredient.';
  end if;

  insert into public.batches (
    formulation_id, name, lot_number, batch_size_g, target_ph, notes, made_on,
    container_id, container_name, container_volume_ml, container_count, container_unit_price, density_g_ml
  )
  values (
    p_formulation_id, p_name, p_lot_number, p_batch_size_g, p_target_ph, nullif(trim(p_notes), ''), p_made_on,
    nullif(p_container->>'id', '')::uuid,
    nullif(trim(p_container->>'name'), ''),
    nullif(p_container->>'volume_ml', '')::numeric,
    nullif(p_container->>'count', '')::numeric,
    nullif(p_container->>'unit_price', '')::numeric,
    nullif(p_container->>'density_g_ml', '')::numeric
  )
  returning id into v_batch;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_actual := coalesce((v_line->>'actual_g')::numeric, (v_line->>'planned_g')::numeric);

    insert into public.batch_ingredients (batch_id, ingredient_id, name, inci_name, phase, percentage, planned_g, actual_g)
    values (
      v_batch,
      nullif(v_line->>'ingredient_id', '')::uuid,
      v_line->>'name',
      v_line->>'inci_name',
      v_line->>'phase',
      (v_line->>'percentage')::numeric,
      (v_line->>'planned_g')::numeric,
      v_actual
    )
    returning id into v_line_id;

    v_real := 0; v_allocated := 0; v_unknown := 0; v_has_price := false;

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

      -- The price the lot carries right now is what these grams cost
      select nullif(price_per_g, 0) into v_price
        from public.user_stash where id = (v_alloc->>'stash_id')::uuid and user_id = auth.uid();

      insert into public.batch_stash_usage (batch_id, batch_ingredient_id, stash_id, grams, label, price_per_g)
      values (v_batch, v_line_id, (v_alloc->>'stash_id')::uuid, v_grams, v_alloc->>'label', v_price);

      v_allocated := v_allocated + v_grams;
      if v_price is not null then
        v_real := v_real + v_grams * v_price;
        v_has_price := true;
      else
        v_unknown := v_unknown + v_grams;
      end if;
      v_deducted := true;
    end loop;

    -- Grams that did not come from a priced lot are costed with the app's estimate, if there is one
    v_est := nullif(nullif(v_line->>'est_price_per_g', '')::numeric, 0);
    v_rest := greatest(v_actual - v_allocated, 0) + v_unknown;
    if v_rest > 0.0001 and v_est is not null then
      v_cost := v_real + v_rest * v_est;
      v_estimated := true;
    elsif v_has_price then
      v_cost := v_real;
      v_estimated := v_rest > 0.0001;  -- part of it has no price, so the total is understated
    else
      v_cost := null;
      v_estimated := false;
    end if;

    update public.batch_ingredients
       set cost = round(v_cost, 4), cost_estimated = v_estimated
     where id = v_line_id;
  end loop;

  update public.batches b
     set stash_deducted = v_deducted,
         ingredient_cost = (select round(sum(i.cost), 4) from public.batch_ingredients i where i.batch_id = v_batch),
         unpriced_count = (select count(*) from public.batch_ingredients i where i.batch_id = v_batch and i.cost is null)
   where b.id = v_batch;

  insert into public.batch_checks (batch_id, label, due_on)
  select v_batch, c.label, p_made_on + c.days
    from (values ('24 hours', 1), ('1 week', 7), ('4 weeks', 28), ('12 weeks', 84)) as c(label, days);

  return v_batch;
end;
$$;

revoke execute on function public.create_batch(uuid, text, text, numeric, numeric, text, jsonb, date, jsonb) from public;
grant execute on function public.create_batch(uuid, text, text, numeric, numeric, text, jsonb, date, jsonb) to authenticated;
