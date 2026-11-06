-- Removes the tables the app no longer uses. Run docs/review-unused-tables.sql first and look at what it lists.
--
-- Kept (the app reads and writes these): app_users, refresh_tokens, email_tokens, ingredients, user_starred_ingredients, favorite_ingredients, user_stash,
-- user_containers, formulation_profiles, formulations, formulation_phases, formulation_ingredients, formulation_versions, batches, batch_ingredients,
-- batch_stash_usage, batch_checks, community_posts, post_snapshots, post_comments, recipe_ratings, notifications, community_moderators, community_mutes,
-- content_reports.
--
-- Dropped: every other table in the public schema. At the time of writing that is profiles (display names, now in app_users), users, reviews and
-- ingredient_safety_updates, none of which anything in the app reads or writes. THIS DELETES THEIR ROWS FOR GOOD: if you may want any of it, export it first.
--
-- It is careful: a table is dropped without CASCADE, so if a view, foreign key or anything else still needs it, the whole migration stops with an error and
-- nothing is dropped. Each table's row count is printed as a notice before it goes.
--
-- Safe to run more than once.

do $$
declare
  keep constant text[] := array[
    'app_users', 'refresh_tokens', 'email_tokens', 'ingredients', 'user_starred_ingredients', 'favorite_ingredients', 'user_stash',
    'user_containers', 'formulation_profiles', 'formulations', 'formulation_phases', 'formulation_ingredients', 'formulation_versions',
    'batches', 'batch_ingredients', 'batch_stash_usage', 'batch_checks', 'community_posts', 'post_snapshots', 'post_comments',
    'recipe_ratings', 'notifications', 'community_moderators', 'community_mutes', 'content_reports'];
  t record;
  n bigint;
begin
  for t in
    select c.relname from pg_class c
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and not c.relispartition and c.relname <> all (keep)
     order by c.relname
  loop
    execute format('select count(*) from public.%I', t.relname) into n;
    raise notice 'dropping table public.% (% rows)', t.relname, n;
    execute format('drop table public.%I', t.relname);
  end loop;
end
$$;
