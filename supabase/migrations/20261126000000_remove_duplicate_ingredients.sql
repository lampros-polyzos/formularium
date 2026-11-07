-- Removes two duplicate rows from the shared ingredient library and makes sure the library cannot get duplicates again.
-- Safe to run twice. A database built from the baseline and the reference data already has none of this to do.
--
-- BTMS-50 and Euxyl PE 9010 each existed twice: same trade name, the INCI name written once with "(and)" and once with commas.
-- The first spelling is kept in both cases (richer data for BTMS-50, used by existing formulas for Euxyl, and the spelling the
-- starter formulas and the preservation checks look for). Only the unused copy is deleted, and only if nothing refers to it: if
-- someone has meanwhile put it in a formula, stash, favourites, stars or a batch, it is left alone and a notice says so.

do $$
declare
  dup uuid;
begin
  foreach dup in array array[
    'ba799c2e-b6b5-4277-bec5-10664437e5a3',   -- BTMS-50 "Behentrimonium Methosulfate, Cetyl Alcohol, Butylene Glycol"
    'c6849374-903a-415f-b0b6-032380ece9a9'    -- Euxyl PE 9010 "Phenoxyethanol, Ethylhexylglycerin"
  ]::uuid[]
  loop
    if exists (select from public.formulation_ingredients where ingredient_id = dup)
       or exists (select from public.user_stash where ingredient_id = dup)
       or exists (select from public.favorite_ingredients where ingredient_id = dup)
       or exists (select from public.user_starred_ingredients where ingredient_id = dup)
       or exists (select from public.batch_ingredients where ingredient_id = dup) then
      raise notice 'ingredient % is in use and was NOT deleted; move what uses it to the other copy first', dup;
    else
      delete from public.ingredients where id = dup and user_id is null;
    end if;
  end loop;
end $$;

-- Stop with a clear message, instead of a cryptic index error, if a duplicate is still there (one was in use above).
do $$
declare names text;
begin
  select string_agg(distinct trade_name, ', ') into names
  from public.ingredients
  where user_id is null
    and lower(regexp_replace(trade_name, '[^a-zA-Z0-9]', '', 'g')) in (
      select lower(regexp_replace(trade_name, '[^a-zA-Z0-9]', '', 'g')) from public.ingredients where user_id is null
      group by 1 having count(*) > 1);
  if names is not null then
    raise exception 'duplicate shared ingredients remain (%): move what uses the unwanted copy to the other one, delete it, and run this again', names;
  end if;
end $$;

-- One shared ingredient per trade name, ignoring case, spaces and punctuation. The existing unique index on the INCI name alone
-- missed these, because the two copies spelled the INCI name differently. Members' own custom ingredients (user_id set) are not affected.
create unique index if not exists ingredients_shared_trade_name_key
  on public.ingredients (lower(regexp_replace(trade_name, '[^a-zA-Z0-9]', '', 'g')))
  where user_id is null;
