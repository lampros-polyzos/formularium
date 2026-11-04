-- Community safety: who can see and change what, reports and moderation, limits, and notifications done by the database.
--
-- Until now the community tables' rules lived only in the dashboard and the app trusted the browser. This puts them in one
-- place, replaces whatever policies those four tables had, and adds what was missing:
--
--  1. Signed-in members only. Posts, comments and recipe versions can no longer be read with just the public key. The home
--     page gets a narrow preview (title, a short excerpt, tags) from public_recipe_previews() instead.
--  2. Authors cannot be faked. The author of a post, comment or rating is set from the signed-in user, and the display name
--     is copied from their profile by the database, whatever the browser sends. It follows a later name change.
--     Authors cannot change a post's author, kind or creation date.
--  3. Own content only. You can edit and delete your own posts and comments. A moderator can also delete others'.
--  4. Notifications come from the database (on a new comment or a first rating), so nobody can send one to someone else.
--  5. Reports and moderation: members report a post or comment; moderators (listed in community_moderators) see the reports,
--     resolve them and remove content.
--  6. Muting a member (community_mutes).
--  7. Limits: title 150, post text 10000, comment 2000, sources 2000, report details 1000 characters; and no more than 10
--     posts, 30 comments or 20 reports an hour/day per member.
--  8. New post columns: edited_at, answered_at (advice posts the author marks as answered) and sources.
--
-- To make someone a moderator, add their user id to community_moderators in the Supabase dashboard:
--     insert into public.community_moderators (user_id) values ('<their user id>');
--
-- Safe to run more than once. Requires 20261113000000_community_post_types.sql for the new post kinds (advice, information).

-- ---------- Moderators ----------

create table if not exists public.community_moderators (
  user_id uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table public.community_moderators enable row level security;   -- no policies: only the dashboard can change who moderates
revoke all on public.community_moderators from anon, authenticated;

create or replace function public.is_moderator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select exists (select 1 from public.community_moderators m where m.user_id = auth.uid()) $$;

revoke execute on function public.is_moderator() from public, anon;
grant execute on function public.is_moderator() to authenticated;

-- ---------- New columns and limits on posts and comments ----------

alter table public.community_posts
  add column if not exists edited_at timestamptz,
  add column if not exists answered_at timestamptz,
  add column if not exists sources text;

-- "not valid" checks every new and changed row without failing on anything already there
alter table public.community_posts drop constraint if exists community_posts_title_length;
alter table public.community_posts add constraint community_posts_title_length
  check (char_length(title) between 1 and 150) not valid;
alter table public.community_posts drop constraint if exists community_posts_write_up_length;
alter table public.community_posts add constraint community_posts_write_up_length
  check (write_up is null or char_length(write_up) <= 10000) not valid;
alter table public.community_posts drop constraint if exists community_posts_sources_length;
alter table public.community_posts add constraint community_posts_sources_length
  check (sources is null or char_length(sources) <= 2000) not valid;
alter table public.post_comments drop constraint if exists post_comments_body_length;
alter table public.post_comments add constraint post_comments_body_length
  check (char_length(body) between 1 and 2000) not valid;

-- ---------- Names come from profiles, not from the browser ----------

create or replace function public.community_author_name(uid uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$ select coalesce(nullif((select p.username from public.profiles p where p.id = uid), ''), 'Anonymous Formulary') $$;

create or replace function public.community_posts_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.author_id := coalesce(new.author_id, auth.uid());
  new.author_name := public.community_author_name(new.author_id);
  new.edited_at := null;
  new.answered_at := null;
  if (select count(*) from public.community_posts p where p.author_id = new.author_id and p.created_at > now() - interval '1 hour') >= 10 then
    raise exception 'You are posting too quickly. Please wait a little and try again.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists community_posts_before_insert on public.community_posts;
create trigger community_posts_before_insert before insert on public.community_posts
  for each row execute function public.community_posts_before_insert();

create or replace function public.community_posts_before_update()
returns trigger
language plpgsql
as $$
begin
  -- Who wrote it, what kind it is and when it was written never change
  new.author_id := old.author_id;
  new.post_type := old.post_type;
  new.created_at := old.created_at;
  new.remixed_from_post_id := old.remixed_from_post_id;
  -- The name changes only when the author renames themselves in their profile (see below)
  if current_setting('formularium.renaming', true) is distinct from 'on' then
    new.author_name := old.author_name;
  end if;
  -- Only advice posts can be marked as answered
  if old.post_type not in ('advice', 'request') then
    new.answered_at := old.answered_at;
  end if;
  if (new.title, new.write_up, new.tags, new.sources) is distinct from (old.title, old.write_up, old.tags, old.sources) then
    new.edited_at := now();
  else
    new.edited_at := old.edited_at;
  end if;
  return new;
end;
$$;

drop trigger if exists community_posts_before_update on public.community_posts;
create trigger community_posts_before_update before update on public.community_posts
  for each row execute function public.community_posts_before_update();

create or replace function public.post_comments_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.author_id := coalesce(new.author_id, auth.uid());
  new.author_name := public.community_author_name(new.author_id);
  if (select count(*) from public.post_comments c where c.author_id = new.author_id and c.created_at > now() - interval '1 hour') >= 30 then
    raise exception 'You are commenting too quickly. Please wait a little and try again.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists post_comments_before_insert on public.post_comments;
create trigger post_comments_before_insert before insert on public.post_comments
  for each row execute function public.post_comments_before_insert();

create or replace function public.recipe_ratings_set_author_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.author_name := public.community_author_name(new.user_id);
  return new;
end;
$$;

drop trigger if exists recipe_ratings_set_author_name on public.recipe_ratings;
create trigger recipe_ratings_set_author_name before insert or update on public.recipe_ratings
  for each row execute function public.recipe_ratings_set_author_name();

-- A new display name shows on everything the member has written
create or replace function public.community_follow_rename()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.username is distinct from old.username then
    perform set_config('formularium.renaming', 'on', true);
    update public.community_posts set author_name = public.community_author_name(new.id) where author_id = new.id;
    update public.post_comments set author_name = public.community_author_name(new.id) where author_id = new.id;
    update public.recipe_ratings set author_name = public.community_author_name(new.id) where user_id = new.id;
    perform set_config('formularium.renaming', 'off', true);
  end if;
  return new;
end;
$$;

drop trigger if exists community_follow_rename on public.profiles;
create trigger community_follow_rename after update of username on public.profiles
  for each row execute function public.community_follow_rename();

-- ---------- Notifications are made here, not by the browser ----------

create or replace function public.notify_post_author()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  post_author uuid;
  actor uuid;
  kind text;
begin
  if tg_table_name = 'post_comments' then
    actor := new.author_id;
    kind := 'comment';
  else
    actor := new.user_id;
    kind := 'rating';
  end if;
  select p.author_id into post_author from public.community_posts p where p.id = new.post_id;
  if post_author is not null and post_author is distinct from actor then
    insert into public.notifications (recipient_id, actor_name, post_id, type)
    values (post_author, public.community_author_name(actor), new.post_id, kind);
  end if;
  return new;
end;
$$;

drop trigger if exists post_comments_notify on public.post_comments;
create trigger post_comments_notify after insert on public.post_comments
  for each row execute function public.notify_post_author();
-- A first rating tells the author; changing a rating does not (the trigger only runs on insert)
drop trigger if exists recipe_ratings_notify on public.recipe_ratings;
create trigger recipe_ratings_notify after insert on public.recipe_ratings
  for each row execute function public.notify_post_author();

-- ---------- Reports ----------

create table if not exists public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  target_type text not null check (target_type in ('post', 'comment')),
  target_id uuid not null,
  -- What it was about, kept even after the content is removed
  post_id uuid,
  target_author_id uuid,
  snapshot text,
  reason text not null check (reason in ('dangerous', 'medical', 'spam', 'harassment', 'copied', 'personal', 'other')),
  details text check (details is null or char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  resolved_by uuid references auth.users (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (reporter_id, target_type, target_id)
);
create index if not exists content_reports_status_idx on public.content_reports (status, created_at desc);

create or replace function public.content_reports_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  found_post public.community_posts%rowtype;
  found_comment public.post_comments%rowtype;
begin
  new.reporter_id := coalesce(new.reporter_id, auth.uid());
  new.status := 'open';
  new.resolved_by := null;
  new.resolved_at := null;

  if new.target_type = 'post' then
    select * into found_post from public.community_posts where id = new.target_id;
    if not found then raise exception 'That post no longer exists.'; end if;
    new.post_id := found_post.id;
    new.target_author_id := found_post.author_id;
    new.snapshot := left(found_post.title, 200);
  else
    select * into found_comment from public.post_comments where id = new.target_id;
    if not found then raise exception 'That comment no longer exists.'; end if;
    new.post_id := found_comment.post_id;
    new.target_author_id := found_comment.author_id;
    new.snapshot := left(found_comment.body, 300);
  end if;

  if new.target_author_id = new.reporter_id then
    raise exception 'You cannot report your own content.';
  end if;
  if (select count(*) from public.content_reports r where r.reporter_id = new.reporter_id and r.created_at > now() - interval '1 day') >= 20 then
    raise exception 'You have sent a lot of reports today. Please try again tomorrow.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists content_reports_before_insert on public.content_reports;
create trigger content_reports_before_insert before insert on public.content_reports
  for each row execute function public.content_reports_before_insert();

-- ---------- Muting ----------

create table if not exists public.community_mutes (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  muted_user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, muted_user_id),
  check (user_id <> muted_user_id)
);

-- ---------- Row-level security: replace whatever was there ----------

do $$
declare p record;
begin
  for p in
    select schemaname, tablename, policyname from pg_policies
     where schemaname = 'public' and tablename in ('community_posts', 'post_snapshots', 'post_comments', 'notifications', 'content_reports', 'community_mutes')
  loop
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end
$$;

alter table public.community_posts enable row level security;
alter table public.post_snapshots enable row level security;
alter table public.post_comments enable row level security;
alter table public.notifications enable row level security;
alter table public.content_reports enable row level security;
alter table public.community_mutes enable row level security;

-- Nothing is readable without signing in
revoke all on public.community_posts, public.post_snapshots, public.post_comments, public.notifications,
              public.content_reports, public.community_mutes from anon;
revoke all on public.notifications, public.content_reports, public.post_snapshots from authenticated;
grant select, insert, update, delete on public.community_posts, public.post_comments to authenticated;
grant select, insert on public.post_snapshots to authenticated;
grant select on public.notifications to authenticated;
grant update (is_read) on public.notifications to authenticated;          -- members can mark theirs as read, nothing else
grant select, insert on public.content_reports to authenticated;
grant update (status, resolved_by, resolved_at) on public.content_reports to authenticated;   -- only moderators pass the policy
grant select, insert, delete on public.community_mutes to authenticated;

-- Posts
create policy "Members read posts" on public.community_posts for select to authenticated using (true);
create policy "Members write their own posts" on public.community_posts for insert to authenticated
  with check (author_id = auth.uid());
create policy "Authors edit their own posts" on public.community_posts for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy "Authors and moderators remove posts" on public.community_posts for delete to authenticated
  using (author_id = auth.uid() or public.is_moderator());

-- Recipe versions
create policy "Members read recipe versions" on public.post_snapshots for select to authenticated using (true);
create policy "Authors add versions to their own recipes" on public.post_snapshots for insert to authenticated
  with check (exists (select 1 from public.community_posts p where p.id = post_id and p.author_id = auth.uid()));

-- Comments
create policy "Members read comments" on public.post_comments for select to authenticated using (true);
create policy "Members write their own comments" on public.post_comments for insert to authenticated
  with check (author_id = auth.uid());
create policy "Authors and moderators remove comments" on public.post_comments for delete to authenticated
  using (author_id = auth.uid() or public.is_moderator());

-- Notifications: yours only
create policy "Members read their own notifications" on public.notifications for select to authenticated
  using (recipient_id = auth.uid());
create policy "Members mark their own notifications read" on public.notifications for update to authenticated
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

-- Reports
create policy "Members send reports" on public.content_reports for insert to authenticated
  with check (reporter_id = auth.uid());
create policy "Reporters and moderators read reports" on public.content_reports for select to authenticated
  using (reporter_id = auth.uid() or public.is_moderator());
create policy "Moderators resolve reports" on public.content_reports for update to authenticated
  using (public.is_moderator()) with check (public.is_moderator());

-- Muting: your own list only
create policy "Members manage their own mutes" on public.community_mutes for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- What the home page may show to anyone ----------

create or replace function public.public_recipe_previews(p_limit integer default 3)
returns table (id uuid, title text, excerpt text, tags jsonb, development_status text, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.title,
         left(regexp_replace(coalesce(p.write_up, ''), '\s+', ' ', 'g'), 160),
         to_jsonb(p.tags), p.development_status, p.created_at
    from public.community_posts p
   where p.post_type = 'formulation'
   order by p.created_at desc
   limit least(greatest(coalesce(p_limit, 3), 1), 12)
$$;

revoke execute on function public.public_recipe_previews(integer) from public;
grant execute on function public.public_recipe_previews(integer) to anon, authenticated;
