-- Part 2 of the schema export: what the first run cut off. The output is small, so it can be pasted straight into the chat.
-- Supabase dashboard > SQL Editor > New query > paste > Run, then copy the single result cell.

select jsonb_pretty(jsonb_build_object(
  'function_names', (
    select jsonb_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' order by p.proname)
      from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind in ('f', 'p')),
  'tables_with_row_level_security', (
    select jsonb_agg(c.relname order by c.relname) from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relrowsecurity),
  'tables_without_row_level_security', (
    select jsonb_agg(c.relname order by c.relname) from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and not c.relrowsecurity),
  'foreign_keys', (
    select jsonb_agg(conrelid::regclass::text || ': ' || pg_get_constraintdef(oid) order by conrelid::regclass::text, conname)
      from pg_constraint where connamespace = 'public'::regnamespace and contype = 'f'),
  'check_constraints', (
    select jsonb_agg(conrelid::regclass::text || ': ' || pg_get_constraintdef(oid) order by conrelid::regclass::text, conname)
      from pg_constraint where connamespace = 'public'::regnamespace and contype = 'c'),
  'enums', (
    select jsonb_object_agg(t.typname, (select jsonb_agg(e.enumlabel order by e.enumsortorder) from pg_enum e where e.enumtypid = t.oid))
      from pg_type t where t.typnamespace = 'public'::regnamespace and t.typtype = 'e'),
  'views', (
    select jsonb_agg(viewname) from pg_views where schemaname = 'public'),
  'realtime_tables', (
    select jsonb_agg(tablename) from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public')
)) as part2;
