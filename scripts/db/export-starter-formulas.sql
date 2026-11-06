-- Supabase dashboard > SQL Editor > New query > paste > Run, then copy the single result cell and paste it in the chat.
-- Read-only. It shows what creates the starter formulas, what triggers it, and which formulas look like starters. No personal data.

select jsonb_pretty(jsonb_build_object(
  'function', (
    select pg_get_functiondef(p.oid) from pg_proc p where p.proname = 'populate_starter_formulas' and p.pronamespace = 'public'::regnamespace limit 1),
  'triggers_on_the_login_table', (
    select jsonb_agg(pg_get_triggerdef(t.oid)) from pg_trigger t where t.tgrelid = 'auth.users'::regclass and not t.tgisinternal),
  'triggers_that_call_it', (
    select jsonb_agg(c.relnamespace::regnamespace::text || '.' || c.relname || ': ' || pg_get_triggerdef(t.oid))
      from pg_trigger t join pg_class c on c.oid = t.tgrelid
     where not t.tgisinternal and t.tgfoid = (select p.oid from pg_proc p where p.proname = 'populate_starter_formulas' and p.pronamespace = 'public'::regnamespace limit 1)),
  'formula_names_that_repeat_across_people', (
    select jsonb_agg(jsonb_build_object('name', name, 'people', people) order by people desc)
      from (select name, count(distinct user_id) as people from public.formulations group by name having count(distinct user_id) > 1 limit 30) x),
  'formulation_count', (select count(*) from public.formulations),
  'people_with_formulas', (select count(distinct user_id) from public.formulations)
)) as starter_formulas;
