-- Run this in the Supabase dashboard: SQL Editor > New query > paste > Run.
-- It returns ONE cell with the structure of the public schema as JSON: tables and columns, keys, indexes, row-level security policies,
-- database functions and triggers. It contains no row data and no secrets.
-- Copy the cell (or download the result) and keep it out of git (it describes your database).

select jsonb_pretty(jsonb_build_object(
  'tables', (
    select jsonb_agg(jsonb_build_object(
      'table', t.table_name,
      'columns', (
        select jsonb_agg(jsonb_build_object('name', k.column_name, 'type', k.data_type, 'nullable', k.is_nullable, 'default', k.column_default) order by k.ordinal_position)
          from information_schema.columns k where k.table_schema = 'public' and k.table_name = t.table_name)
    ) order by t.table_name)
      from information_schema.tables t where t.table_schema = 'public' and t.table_type = 'BASE TABLE'),
  'row_level_security', (
    select jsonb_object_agg(c.relname, c.relrowsecurity) from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'),
  'constraints', (
    select jsonb_agg(jsonb_build_object('table', conrelid::regclass::text, 'name', conname, 'definition', pg_get_constraintdef(oid)) order by conrelid::regclass::text, conname)
      from pg_constraint where connamespace = 'public'::regnamespace),
  'indexes', (
    select jsonb_agg(indexdef order by indexdef) from pg_indexes where schemaname = 'public'),
  'policies', (
    select jsonb_agg(jsonb_build_object('table', tablename, 'name', policyname, 'command', cmd, 'roles', roles, 'using', qual, 'with_check', with_check) order by tablename, policyname)
      from pg_policies where schemaname = 'public'),
  'functions', (
    select jsonb_agg(jsonb_build_object('name', p.proname, 'definition', pg_get_functiondef(p.oid)) order by p.proname)
      from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind in ('f', 'p')),
  'triggers', (
    select jsonb_agg(pg_get_triggerdef(t.oid) order by pg_get_triggerdef(t.oid))
      from pg_trigger t join pg_class c on c.oid = t.tgrelid where c.relnamespace = 'public'::regnamespace and not t.tgisinternal)
)) as schema;
