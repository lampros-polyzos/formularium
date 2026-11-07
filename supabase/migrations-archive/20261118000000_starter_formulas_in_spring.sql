-- The starter formulas are now created by the Spring backend, in the same transaction that creates the account
-- (backend/src/main/java/com/demiurgio/formularium/starter/). The database no longer does it.
--
-- This removes the trigger on Supabase's login table that ran populate_starter_formulas() for every new login, and then the function itself.
-- Formulas that were already created stay exactly as they are.
--
-- Apply this together with the Spring backend that creates them. Between the two, a new account would start without the three starter formulas.
--
-- Safe to run more than once.

do $$
begin
  if to_regclass('auth.users') is not null then
    drop trigger if exists on_auth_user_created on auth.users;
  end if;
exception when insufficient_privilege then
  raise exception 'Could not remove the trigger on auth.users. Remove it in the dashboard (Database > Triggers > on_auth_user_created > Delete), then run this again.';
end $$;

drop function if exists public.populate_starter_formulas();
