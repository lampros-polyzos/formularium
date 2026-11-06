-- The community rules now live in the Spring backend (backend/src/main/java/com/demiurgio/formularium/community/), in Java, with tests:
--
--   who wrote a post, comment or rating and the name it carries (from the account, not from the browser)
--   what an author may and may not change on a post
--   notifications for a new comment or a first rating
--   limits on length and speed (10 posts and 30 comments an hour, 20 reports a day)
--   reports, moderators, muting, and the short preview of shared recipes for visitors
--
-- This removes the database triggers, access policies and functions that did it. The tables and everything in them stay exactly as they are.
-- Row-level security stays on with no policies, so nothing can reach these tables through Supabase any more: only the backend can.
-- Apply this together with the backend that replaces them.
--
-- Safe to run more than once.

-- Triggers first (they use the functions below)
drop trigger if exists community_posts_before_insert on public.community_posts;
drop trigger if exists community_posts_before_update on public.community_posts;
drop trigger if exists post_comments_before_insert on public.post_comments;
drop trigger if exists post_comments_notify on public.post_comments;
drop trigger if exists recipe_ratings_set_author_name on public.recipe_ratings;
drop trigger if exists recipe_ratings_set_updated_at on public.recipe_ratings;
drop trigger if exists recipe_ratings_notify on public.recipe_ratings;
drop trigger if exists content_reports_before_insert on public.content_reports;
drop trigger if exists community_follow_rename on public.profiles;

-- Every access policy on these tables (some of them call is_moderator())
do $$
declare p record;
begin
  for p in
    select schemaname, tablename, policyname from pg_policies
     where schemaname = 'public'
       and tablename in ('community_posts', 'post_snapshots', 'post_comments', 'recipe_ratings', 'notifications', 'content_reports', 'community_mutes', 'community_moderators')
  loop
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end
$$;

drop function if exists public.community_follow_rename();
drop function if exists public.community_posts_before_insert();
drop function if exists public.community_posts_before_update();
drop function if exists public.post_comments_before_insert();
drop function if exists public.recipe_ratings_set_author_name();
drop function if exists public.set_recipe_ratings_updated_at();
drop function if exists public.notify_post_author();
drop function if exists public.content_reports_before_insert();
drop function if exists public.community_author_name(uuid);
drop function if exists public.is_moderator();
drop function if exists public.public_recipe_previews(integer);
