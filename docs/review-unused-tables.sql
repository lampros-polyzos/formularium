-- READ-ONLY. Run this in the Supabase dashboard (SQL Editor) BEFORE the "drop unused tables" migration. It changes nothing.
-- It lists every table in the public schema, whether the app uses it, how many rows it holds, and what else depends on the ones it does not use.

with app_tables(name) as (
  values ('app_users'), ('refresh_tokens'), ('email_tokens'), ('ingredients'), ('user_starred_ingredients'), ('favorite_ingredients'), ('user_stash'),
         ('user_containers'), ('formulation_profiles'), ('formulations'), ('formulation_phases'), ('formulation_ingredients'), ('formulation_versions'),
         ('batches'), ('batch_ingredients'), ('batch_stash_usage'), ('batch_checks'), ('community_posts'), ('post_snapshots'), ('post_comments'),
         ('recipe_ratings'), ('notifications'), ('community_moderators'), ('community_mutes'), ('content_reports')
)
select c.relname as table_name,
       case when a.name is null then 'NOT USED by the app' else 'used' end as status,
       (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from public.%I', c.relname), false, true, '')))[1]::text::int as row_count
  from pg_class c
  left join app_tables a on a.name = c.relname
 where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
 order by (a.name is null) desc, c.relname;

-- What else points at the tables the app does not use: foreign keys from other tables, views, and functions that mention them by name.
-- (An empty result here means nothing else depends on them.)
with unused as (
  select c.oid, c.relname from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
     and c.relname not in ('app_users', 'refresh_tokens', 'email_tokens', 'ingredients', 'user_starred_ingredients', 'favorite_ingredients', 'user_stash',
         'user_containers', 'formulation_profiles', 'formulations', 'formulation_phases', 'formulation_ingredients', 'formulation_versions', 'batches',
         'batch_ingredients', 'batch_stash_usage', 'batch_checks', 'community_posts', 'post_snapshots', 'post_comments', 'recipe_ratings', 'notifications',
         'community_moderators', 'community_mutes', 'content_reports')
)
select 'foreign key' as kind, conrelid::regclass::text || ' -> ' || u.relname as detail
  from pg_constraint k join unused u on u.oid = k.confrelid where k.contype = 'f' and k.conrelid <> u.oid
union all
select 'view', v.schemaname || '.' || v.viewname from pg_views v, unused u where v.schemaname = 'public' and v.definition ~* ('\m' || u.relname || '\M')
union all
select 'function', p.proname || ' mentions ' || u.relname from pg_proc p, unused u
 where p.pronamespace = 'public'::regnamespace and p.prokind in ('f', 'p') and pg_get_functiondef(p.oid) ~* ('\m' || u.relname || '\M')
union all
select 'trigger on auth.users', t.tgname from pg_trigger t join pg_class c on c.oid = t.tgrelid
 where c.relnamespace = 'auth'::regnamespace and c.relname = 'users' and not t.tgisinternal;
