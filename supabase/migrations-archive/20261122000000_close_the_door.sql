-- The Spring backend now does everything: sign-in, every read and write, the data export and account deletion.
-- Supabase is only the PostgreSQL database, reached by the backend with its own connection.
--
-- This closes the door that the browser used to have:
--   * the account-data functions (export_my_data, delete_my_account, account_owned_tables) are removed: the backend does both jobs
--   * the roles Supabase gives to browsers (anon, authenticated) lose all access to everything in the public schema, now and for anything created later
--
-- Nothing is deleted from any table. Run it together with the backend that replaces what it removes.
-- Safe to run more than once.

drop function if exists public.export_my_data();
drop function if exists public.delete_my_account();
drop function if exists public.account_owned_tables();

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on all tables in schema public from %I', r);
      execute format('revoke all on all sequences in schema public from %I', r);
      execute format('revoke all on all functions in schema public from %I', r);
      execute format('alter default privileges in schema public revoke all on tables from %I', r);
      execute format('alter default privileges in schema public revoke all on sequences from %I', r);
      execute format('alter default privileges in schema public revoke all on functions from %I', r);
    end if;
  end loop;
end
$$;

-- Tables from the Supabase days that the app no longer uses are removed by 20261124000000_drop_unused_tables.sql (nothing above touches them).
