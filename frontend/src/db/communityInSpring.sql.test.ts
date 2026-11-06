// @vitest-environment node
//
// Runs the "community moves to Spring" migration on a real Postgres engine (PGlite): the triggers, access policies and functions that used to enforce the
// community rules are gone, every row in the community tables is untouched, row-level security stays on, and running it again changes nothing.

import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const migrations = import.meta.glob('./fixtures/20261121000000_community_in_spring.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const MIGRATION_SQL = Object.values(migrations)[0];

const trigger = (_name: string, fn: string) => `create function public.${fn}() returns trigger language plpgsql as $$ begin return new; end $$;`;

describe.skipIf(!MIGRATION_SQL)('community moves to Spring (real Postgres)', () => {
    let db: PGlite;
    const count = async (sql: string) => Number((await db.query<{ n: number }>(sql)).rows[0].n);
    const names = async (sql: string) => (await db.query<{ n: string }>(sql)).rows.map(r => r.n);

    beforeAll(async () => {
        db = new PGlite();
        await db.exec(`
          create table public.profiles (id uuid primary key, username text);
          create table public.community_posts (id uuid primary key default gen_random_uuid(), author_id uuid, author_name text, title text);
          create table public.post_comments (id uuid primary key default gen_random_uuid(), post_id uuid, author_id uuid, author_name text, body text);
          create table public.recipe_ratings (id uuid primary key default gen_random_uuid(), post_id uuid, user_id uuid, author_name text, updated_at timestamptz);
          create table public.notifications (id uuid primary key default gen_random_uuid(), recipient_id uuid);
          create table public.content_reports (id uuid primary key default gen_random_uuid(), reporter_id uuid);
          create table public.community_mutes (user_id uuid, muted_user_id uuid);
          create table public.post_snapshots (id uuid primary key default gen_random_uuid(), post_id uuid);
          create table public.community_moderators (user_id uuid primary key);
          create table public.somewhere_else (id int primary key);

          ${['noop', 'community_follow_rename', 'community_posts_before_insert', 'community_posts_before_update', 'post_comments_before_insert', 'recipe_ratings_set_author_name',
              'set_recipe_ratings_updated_at', 'notify_post_author', 'content_reports_before_insert'].map(fn => trigger(fn, fn)).join('\n')}
          create function public.community_author_name(uid uuid) returns text language sql as 'select 1::text';
          create function public.is_moderator() returns boolean language sql as 'select true';
          create function public.public_recipe_previews(p_limit integer default 3) returns setof public.community_posts language sql as 'select * from public.community_posts';

          create trigger community_posts_before_insert before insert on public.community_posts for each row execute function public.community_posts_before_insert();
          create trigger community_posts_before_update before update on public.community_posts for each row execute function public.community_posts_before_update();
          create trigger post_comments_before_insert before insert on public.post_comments for each row execute function public.post_comments_before_insert();
          create trigger post_comments_notify after insert on public.post_comments for each row execute function public.notify_post_author();
          create trigger recipe_ratings_set_author_name before insert on public.recipe_ratings for each row execute function public.recipe_ratings_set_author_name();
          create trigger recipe_ratings_set_updated_at before update on public.recipe_ratings for each row execute function public.set_recipe_ratings_updated_at();
          create trigger recipe_ratings_notify after insert on public.recipe_ratings for each row execute function public.notify_post_author();
          create trigger content_reports_before_insert before insert on public.content_reports for each row execute function public.content_reports_before_insert();
          create trigger community_follow_rename after update of username on public.profiles for each row execute function public.community_follow_rename();
          create trigger somebody_elses before insert on public.somewhere_else for each row execute function public.noop();

          alter table public.community_posts enable row level security;
          alter table public.post_comments enable row level security;
          alter table public.notifications enable row level security;
          alter table public.somewhere_else enable row level security;
          create policy "Authors and moderators remove posts" on public.community_posts for delete using (public.is_moderator());
          create policy "Members read posts" on public.community_posts for select using (true);
          create policy "Members read comments" on public.post_comments for select using (true);
          create policy "Members read their own notifications" on public.notifications for select using (recipient_id = gen_random_uuid());
          create policy "Unrelated policy" on public.somewhere_else for select using (true);

          insert into public.community_posts (author_id, author_name, title) values (gen_random_uuid(), 'Sam', 'Day cream'), (gen_random_uuid(), 'Kim', 'Toner');
          insert into public.post_comments (author_name, body) values ('Sam', 'Nice');
        `);
    }, 60_000);

    afterAll(async () => { await db?.close(); });

    it('removes the community triggers, and leaves a trigger on an unrelated table alone', async () => {
        expect(await count(`select count(*)::int as n from pg_trigger where not tgisinternal`)).toBe(10);
        await db.exec(MIGRATION_SQL);
        expect(await names(`select tgname as n from pg_trigger where not tgisinternal order by 1`)).toEqual(['somebody_elses']);
    });

    it('removes every access policy on the community tables, but not on others', async () => {
        expect(await names(`select policyname as n from pg_policies order by 1`)).toEqual(['Unrelated policy']);
    });

    it('removes the community functions, and keeps the others', async () => {
        expect(await names(`select proname as n from pg_proc where pronamespace = 'public'::regnamespace order by 1`)).toEqual(['noop']);
    });

    it('keeps every row, and keeps row-level security on so only the backend can reach the tables', async () => {
        expect(await count(`select count(*)::int as n from public.community_posts`)).toBe(2);
        expect(await count(`select count(*)::int as n from public.post_comments`)).toBe(1);
        expect(await names(`select relname as n from pg_class where relname in ('community_posts', 'post_comments', 'notifications') and relrowsecurity order by 1`)).toEqual(['community_posts', 'notifications', 'post_comments']);
    });

    it('lets a post be written without any of the old rules getting in the way', async () => {
        await db.exec(`insert into public.community_posts (author_name, title) values ('Anyone', 'No trigger sets the author or checks the speed')`);
        expect(await count(`select count(*)::int as n from public.community_posts where author_id is null`)).toBe(1);
    });

    it('changes nothing when run again, or on a database that never had any of it', async () => {
        await db.exec(MIGRATION_SQL);
        expect(await count(`select count(*)::int as n from public.community_posts`)).toBe(3);
        const fresh = new PGlite();
        await fresh.exec(`create table public.profiles (id uuid primary key, username text); create table public.community_posts (id uuid primary key); create table public.post_comments (id uuid primary key); create table public.recipe_ratings (id uuid primary key); create table public.content_reports (id uuid primary key);`);
        await fresh.exec(MIGRATION_SQL);
        await fresh.close();
    });
});
