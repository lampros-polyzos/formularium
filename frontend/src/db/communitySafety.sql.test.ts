// @vitest-environment node
//
// Runs the community-safety migration on a real Postgres engine (PGlite, in-process), starting from a stand-in for the
// current setup (including a deliberately careless "anyone can do anything" policy that must be replaced), and checks
// every promise it makes: who can read and change what, that names cannot be faked, notifications, reports and
// moderation, muting, limits, and what the home page may see.

import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// A glob (rather than an import) so the test skips, instead of breaking the whole run, if the fixture is missing
const migrations = import.meta.glob('./fixtures/20261114000000_community_safety.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const MIGRATION_SQL = Object.values(migrations)[0];

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const C = '33333333-3333-3333-3333-333333333333';
const MOD = '44444444-4444-4444-4444-444444444444';

describe.skipIf(!MIGRATION_SQL)('community safety migration (real Postgres)', () => {
    let db: PGlite;

    const as = (uid: string) => db.exec(`reset role; select set_config('app.uid', '${uid}', false); set role authenticated;`);
    const asAnon = () => db.exec(`reset role; select set_config('app.uid', '', false); set role anon;`);
    const root = () => db.exec('reset role');
    const rows = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
    const post = async (author: string, over: Partial<{ type: string; title: string; text: string; name: string; keepRecent: boolean }> = {}) => {
        // Each test starts fresh as far as the hourly limits go, unless it is testing them
        if (!over.keepRecent) await raw(`update public.community_posts set created_at = now() - interval '3 hours' where created_at > now() - interval '3 hours'`);
        await as(author);
        const { rows: r } = await db.query<{ id: string }>(
            `insert into public.community_posts (author_id, author_name, post_type, title, write_up, tags)
             values ($1, $2, $3, $4, $5, array['a']) returning id`,
            [author, over.name ?? 'Whatever the browser said', over.type ?? 'discussion', over.title ?? 'A title', over.text ?? 'Some text']);
        return r[0].id;
    };
    const comment = async (author: string, postId: string, body = 'A comment', keepRecent = false) => {
        if (!keepRecent) await raw(`update public.post_comments set created_at = now() - interval '3 hours' where created_at > now() - interval '3 hours'`);
        await as(author);
        return (await db.query<{ id: string }>(`insert into public.post_comments (post_id, author_id, author_name, body) values ($1, $2, 'x', $3) returning id`, [postId, author, body])).rows[0].id;
    };
    /** Runs an update with triggers switched off, as the database owner (the triggers would rightly refuse to change a date) */
    const raw = async (sql: string) => { await root(); await db.exec(`set session_replication_role = replica; ${sql}; set session_replication_role = origin;`); };
    /** Makes old rows look as if they were written an hour or a day ago, for the rate limits */
    const age = async (table: string, interval: string) => { await raw(`update public.${table} set created_at = now() - interval '${interval}'`); };

    beforeAll(async () => {
        db = new PGlite();
        await db.exec(`
          create schema auth;
          create table auth.users (id uuid primary key);
          create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.uid', true), '')::uuid $$;
          create role anon;
          create role authenticated;
          grant usage on schema public, auth to anon, authenticated;
          insert into auth.users values ('${A}'), ('${B}'), ('${C}'), ('${MOD}');

          create table public.profiles (id uuid primary key, username text);
          insert into public.profiles values ('${A}', 'Ana'), ('${B}', 'Bo'), ('${C}', ''), ('${MOD}', 'Mod');
          grant select on public.profiles to anon, authenticated;

          create table public.community_posts (
            id uuid primary key default gen_random_uuid(), author_id uuid, author_name text, post_type text not null, title text not null,
            write_up text, tags text[], development_status text, profile_name text, remixed_from_post_id uuid, created_at timestamptz not null default now());
          create table public.post_snapshots (
            id uuid primary key default gen_random_uuid(), post_id uuid references public.community_posts (id) on delete cascade, version integer,
            formulation_data jsonb, release_notes text, created_at timestamptz default now());
          create table public.post_comments (
            id uuid primary key default gen_random_uuid(), post_id uuid references public.community_posts (id) on delete cascade, author_id uuid,
            author_name text, body text not null, created_at timestamptz not null default now());
          create table public.recipe_ratings (
            id uuid primary key default gen_random_uuid(), post_id uuid references public.community_posts (id) on delete cascade, user_id uuid,
            author_name text, overall integer, updated_at timestamptz default now(), unique (post_id, user_id));
          create table public.notifications (
            id uuid primary key default gen_random_uuid(), recipient_id uuid, actor_name text, post_id uuid, type text,
            is_read boolean not null default false, created_at timestamptz not null default now());
          grant select, insert, update, delete on public.recipe_ratings to authenticated;

          -- How things might have been: wide open to everyone
          alter table public.community_posts enable row level security;
          create policy careless on public.community_posts for all to public using (true) with check (true);
          grant all on public.community_posts, public.post_comments, public.notifications, public.post_snapshots to anon, authenticated;
        `);
        await db.exec(MIGRATION_SQL);
        await db.exec(`insert into public.community_moderators (user_id) values ('${MOD}')`);
    }, 60_000);

    afterAll(async () => { await db?.close(); });

    describe('who can read', () => {
        it('replaces the careless old policy: nobody without an account can read posts, comments or recipe versions', async () => {
            const id = await post(A, { type: 'formulation' });
            await comment(B, id);
            await as(A);
            await db.query(`insert into public.post_snapshots (post_id, version, formulation_data) values ($1, 1, '[]')`, [id]);
            await asAnon();
            for (const table of ['community_posts', 'post_comments', 'post_snapshots', 'notifications', 'content_reports', 'community_mutes']) {
                await expect(db.query(`select * from public.${table}`), table).rejects.toThrow(/permission denied/);
            }
        });

        it('lets any signed-in member read posts, comments and recipe versions', async () => {
            await as(C);
            expect((await rows('select * from public.community_posts')).length).toBeGreaterThan(0);
            expect((await rows('select * from public.post_comments')).length).toBeGreaterThan(0);
            expect((await rows('select * from public.post_snapshots')).length).toBeGreaterThan(0);
        });

        it('keeps the list of moderators to itself', async () => {
            await as(A);
            await expect(db.query('select * from public.community_moderators')).rejects.toThrow(/permission denied/);
            await expect(db.query(`insert into public.community_moderators values ('${A}')`)).rejects.toThrow(/permission denied/);
        });
    });

    describe('what the home page may show to anyone', () => {
        it('is a title, a short excerpt, tags and a status of the newest shared recipes, and nothing else', async () => {
            await root();
            await db.exec(`delete from public.community_posts`);
            const long = 'word '.repeat(200);
            const recipe = await post(A, { type: 'formulation', title: 'Day cream', text: long });
            await post(A, { type: 'discussion', title: 'Not a recipe' });
            await asAnon();
            const previews = await rows<{ id: string; title: string; excerpt: string; tags: string[] }>('select * from public.public_recipe_previews(3)');
            expect(previews).toHaveLength(1);
            expect(previews[0]).toMatchObject({ id: recipe, title: 'Day cream', tags: ['a'] });
            expect(previews[0].excerpt.length).toBeLessThanOrEqual(160);
            expect(Object.keys(previews[0]).sort()).toEqual(['created_at', 'development_status', 'excerpt', 'id', 'tags', 'title']);
        });

        it('collapses white space in the excerpt, never returns more than 12, and never fewer than 1', async () => {
            await root();
            await db.exec(`delete from public.community_posts`);
            await post(A, { type: 'formulation', text: 'one\n\n   two\tthree' });
            for (let i = 0; i < 6; i++) await age('community_posts', '2 hours').then(() => post(B, { type: 'formulation', title: `R${i}` }));
            await asAnon();
            const limited = await rows<{ excerpt: string }>('select * from public.public_recipe_previews(1000)');
            expect(limited.length).toBeLessThanOrEqual(12);
            expect((await rows('select * from public.public_recipe_previews(0)')).length).toBe(1);
            expect((await rows<{ excerpt: string }>('select * from public.public_recipe_previews(100) where excerpt like $1', ['one two three']))).toHaveLength(1);
        });
    });

    describe('who a post is by', () => {
        it('takes the name from the profile, whatever the browser sent', async () => {
            await root();
            await db.exec(`delete from public.community_posts`);
            const id = await post(A, { name: 'Somebody Else' });
            await as(A);
            expect((await rows<{ author_name: string }>('select author_name from public.community_posts where id = $1', [id]))[0].author_name).toBe('Ana');
        });

        it('uses a neutral name for a member with none', async () => {
            const id = await post(C, { name: 'Ana' });
            await as(C);
            expect((await rows<{ author_name: string }>('select author_name from public.community_posts where id = $1', [id]))[0].author_name).toBe('Anonymous Formulary');
        });

        it('refuses a post written in someone else\'s name', async () => {
            await as(A);
            await expect(db.query(`insert into public.community_posts (author_id, post_type, title) values ($1, 'discussion', 'Fake')`, [B])).rejects.toThrow(/row-level security/);
        });

        it('fills in the author when the browser sends none', async () => {
            await as(A);
            const { rows: r } = await db.query<{ author_id: string }>(`insert into public.community_posts (post_type, title) values ('discussion', 'No author given') returning author_id`);
            expect(r[0].author_id).toBe(A);
        });

        it('does the same for comments and ratings', async () => {
            const id = await post(A, { type: 'formulation' });
            await as(B);
            const c = await db.query<{ author_name: string }>(`insert into public.post_comments (post_id, author_id, author_name, body) values ($1, $2, 'Spoof', 'hi') returning author_name`, [id, B]);
            expect(c.rows[0].author_name).toBe('Bo');
            const r = await db.query<{ author_name: string }>(`insert into public.recipe_ratings (post_id, user_id, author_name, overall) values ($1, $2, 'Spoof', 5) returning author_name`, [id, B]);
            expect(r.rows[0].author_name).toBe('Bo');
            await expect(db.query(`insert into public.post_comments (post_id, author_id, body) values ($1, $2, 'as Ana')`, [id, A])).rejects.toThrow(/row-level security/);
        });

        it('follows a rename of the profile, on posts, comments and ratings', async () => {
            await root();
            await db.exec(`delete from public.community_posts`);
            const id = await post(A, { type: 'formulation' });
            await comment(A, id);
            await as(A);
            await db.query(`insert into public.recipe_ratings (post_id, user_id, overall) values ($1, $2, 4)`, [id, A]);
            await root();
            await db.exec(`update public.profiles set username = 'Ana Maria' where id = '${A}'`);
            expect((await rows<{ author_name: string }>('select author_name from public.community_posts'))[0].author_name).toBe('Ana Maria');
            expect((await rows<{ author_name: string }>('select author_name from public.post_comments'))[0].author_name).toBe('Ana Maria');
            expect((await rows<{ author_name: string }>('select author_name from public.recipe_ratings'))[0].author_name).toBe('Ana Maria');
            await db.exec(`update public.profiles set username = 'Ana' where id = '${A}'`);
        });
    });

    describe('changing a post', () => {
        it('lets the author edit it, and records that it was edited', async () => {
            const id = await post(A);
            await as(A);
            const { rows: before } = await db.query<{ edited_at: string | null }>('select edited_at from public.community_posts where id = $1', [id]);
            expect(before[0].edited_at).toBeNull();
            await db.query(`update public.community_posts set title = 'Better title', write_up = 'Better text', sources = 'A book' where id = $1`, [id]);
            const { rows: after } = await db.query<{ title: string; sources: string; edited_at: string }>('select title, sources, edited_at from public.community_posts where id = $1', [id]);
            expect(after[0]).toMatchObject({ title: 'Better title', sources: 'A book' });
            expect(after[0].edited_at).not.toBeNull();
        });

        it('does not call it edited when only the status changes', async () => {
            const id = await post(A, { type: 'formulation' });
            await as(A);
            await db.query(`update public.community_posts set development_status = 'stable' where id = $1`, [id]);
            expect((await rows<{ edited_at: string | null }>('select edited_at from public.community_posts where id = $1', [id]))[0].edited_at).toBeNull();
        });

        it('keeps the author, the kind, the date and the name as they were, whatever is sent', async () => {
            const id = await post(A);
            await as(A);
            const before = (await rows<{ created_at: string }>('select created_at from public.community_posts where id = $1', [id]))[0].created_at;
            await db.query(`update public.community_posts set author_id = $2, post_type = 'formulation', author_name = 'Bo', created_at = '2020-01-01' where id = $1`, [id, B]);
            const after = (await rows<{ author_id: string; post_type: string; author_name: string; created_at: string }>('select * from public.community_posts where id = $1', [id]))[0];
            expect(after).toMatchObject({ author_id: A, post_type: 'discussion', author_name: 'Ana' });
            expect(String(after.created_at)).toBe(String(before));
        });

        it('does not let anyone else change or remove it', async () => {
            const id = await post(A);
            await as(B);
            expect((await db.query(`update public.community_posts set title = 'Hijacked' where id = $1 returning id`, [id])).rows).toHaveLength(0);
            expect((await db.query(`delete from public.community_posts where id = $1 returning id`, [id])).rows).toHaveLength(0);
            expect((await rows<{ title: string }>('select title from public.community_posts where id = $1', [id]))[0].title).not.toBe('Hijacked');
        });

        it('lets the author delete it', async () => {
            const id = await post(A);
            await as(A);
            expect((await db.query(`delete from public.community_posts where id = $1 returning id`, [id])).rows).toHaveLength(1);
        });

        it('lets a moderator delete anyone\'s post, but not edit it', async () => {
            const id = await post(A);
            await as(MOD);
            expect((await db.query(`update public.community_posts set title = 'Edited by mod' where id = $1 returning id`, [id])).rows).toHaveLength(0);
            expect((await db.query(`delete from public.community_posts where id = $1 returning id`, [id])).rows).toHaveLength(1);
        });

        it('lets only the author mark an advice post as answered, and only advice posts', async () => {
            const advice = await post(A, { type: 'advice' });
            const legacy = await post(A, { type: 'request' });
            const talk = await post(A, { type: 'discussion' });
            await as(B);
            expect((await db.query(`update public.community_posts set answered_at = now() where id = $1 returning id`, [advice])).rows).toHaveLength(0);
            await as(A);
            await db.query(`update public.community_posts set answered_at = now() where id = any($1::uuid[])`, [[advice, legacy, talk]]);
            const answered = await rows<{ id: string; answered_at: string | null }>('select id, answered_at from public.community_posts where id = any($1::uuid[])', [[advice, legacy, talk]]);
            const by = Object.fromEntries(answered.map(r => [r.id, r.answered_at !== null]));
            expect(by).toEqual({ [advice]: true, [legacy]: true, [talk]: false });
            await db.query(`update public.community_posts set answered_at = null where id = $1`, [advice]);
            expect((await rows<{ answered_at: string | null }>('select answered_at from public.community_posts where id = $1', [advice]))[0].answered_at).toBeNull();
        });

        it('cannot start a post as already edited or answered', async () => {
            await as(A);
            const { rows: r } = await db.query<{ edited_at: string | null; answered_at: string | null }>(
                `insert into public.community_posts (post_type, title, edited_at, answered_at) values ('advice', 'Sneaky', now(), now()) returning edited_at, answered_at`);
            expect(r[0]).toEqual({ edited_at: null, answered_at: null });
        });
    });

    describe('comments', () => {
        it('can be deleted by their author or a moderator, but not by anyone else', async () => {
            const id = await post(A);
            const mine = await comment(B, id);
            await as(C);
            expect((await db.query(`delete from public.post_comments where id = $1 returning id`, [mine])).rows).toHaveLength(0);
            await as(B);
            expect((await db.query(`delete from public.post_comments where id = $1 returning id`, [mine])).rows).toHaveLength(1);
            const another = await comment(B, id);
            await as(MOD);
            expect((await db.query(`delete from public.post_comments where id = $1 returning id`, [another])).rows).toHaveLength(1);
        });

        it('cannot be edited', async () => {
            const id = await post(A);
            const c = await comment(B, id);
            await as(B);
            expect((await db.query(`update public.post_comments set body = 'changed' where id = $1 returning id`, [c])).rows).toHaveLength(0);
        });
    });

    describe('notifications', () => {
        it('tells the author about a comment from someone else, and not about their own', async () => {
            await root();
            await db.exec('delete from public.notifications');
            const id = await post(A);
            await comment(B, id);
            await comment(A, id);
            await as(A);
            const mine = await rows<{ actor_name: string; type: string; post_id: string; is_read: boolean }>('select * from public.notifications');
            expect(mine).toHaveLength(1);
            expect(mine[0]).toMatchObject({ actor_name: 'Bo', type: 'comment', post_id: id, is_read: false });
        });

        it('tells the author about a first rating, and not about a changed one', async () => {
            await root();
            await db.exec('delete from public.notifications');
            const id = await post(A, { type: 'formulation' });
            await as(B);
            await db.query(`insert into public.recipe_ratings (post_id, user_id, overall) values ($1, $2, 5)`, [id, B]);
            await db.query(`insert into public.recipe_ratings (post_id, user_id, overall) values ($1, $2, 3) on conflict (post_id, user_id) do update set overall = excluded.overall`, [id, B]);
            await as(A);
            const mine = await rows<{ type: string; actor_name: string }>('select type, actor_name from public.notifications');
            expect(mine).toEqual([{ type: 'rating', actor_name: 'Bo' }]);
        });

        it('cannot be sent by a member to anyone', async () => {
            const id = await post(A);
            await as(B);
            await expect(db.query(`insert into public.notifications (recipient_id, actor_name, post_id, type) values ($1, 'Spam', $2, 'comment')`, [A, id])).rejects.toThrow(/permission denied/);
        });

        it('can be read only by the member they are for', async () => {
            const id = await post(A);
            await comment(B, id);
            await as(B);
            expect(await rows('select * from public.notifications where recipient_id = $1', [A])).toHaveLength(0);
            await as(A);
            expect((await rows('select * from public.notifications where recipient_id = $1', [A])).length).toBeGreaterThan(0);
        });

        it('can be marked as read by their member only, and nothing else about them can change', async () => {
            const id = await post(A);
            await comment(B, id);
            await as(B);
            expect((await db.query(`update public.notifications set is_read = true returning id`)).rows).toHaveLength(0);
            await as(A);
            expect((await db.query(`update public.notifications set is_read = true where recipient_id = $1 returning id`, [A])).rows.length).toBeGreaterThan(0);
            await expect(db.query(`update public.notifications set actor_name = 'Changed'`)).rejects.toThrow(/permission denied/);
            await expect(db.query(`update public.notifications set recipient_id = $1`, [B])).rejects.toThrow(/permission denied/);
        });
    });

    describe('limits', () => {
        it('refuses a title that is empty or longer than 150 characters, and text longer than 10,000', async () => {
            await as(A);
            const insert = (title: string, text: string) => db.query(`insert into public.community_posts (post_type, title, write_up) values ('discussion', $1, $2)`, [title, text]);
            await insert('x'.repeat(150), 'ok');
            await expect(insert('x'.repeat(151), 'ok')).rejects.toThrow(/community_posts_title_length/);
            await expect(insert('', 'ok')).rejects.toThrow(/community_posts_title_length/);
            await insert('ok', 'x'.repeat(10000));
            await expect(insert('ok', 'x'.repeat(10001))).rejects.toThrow(/community_posts_write_up_length/);
        });

        it('applies to an edit too, and to sources', async () => {
            const id = await post(A);
            await as(A);
            await expect(db.query(`update public.community_posts set title = $2 where id = $1`, [id, 'x'.repeat(151)])).rejects.toThrow(/community_posts_title_length/);
            await expect(db.query(`update public.community_posts set sources = $2 where id = $1`, [id, 'x'.repeat(2001)])).rejects.toThrow(/community_posts_sources_length/);
        });

        it('refuses an empty comment or one longer than 2,000 characters', async () => {
            const id = await post(A);
            await as(B);
            const insert = (body: string) => db.query(`insert into public.post_comments (post_id, author_id, body) values ($1, $2, $3)`, [id, B, body]);
            await insert('x'.repeat(2000));
            await expect(insert('x'.repeat(2001))).rejects.toThrow(/post_comments_body_length/);
            await expect(insert('')).rejects.toThrow(/post_comments_body_length/);
        });

        it('allows 10 posts an hour and stops the 11th, then allows more once the hour has passed', async () => {
            await root();
            await db.exec('delete from public.community_posts');
            for (let i = 0; i < 10; i++) await post(C, { title: `P${i}`, keepRecent: true });
            await expect(post(C, { title: 'One too many', keepRecent: true })).rejects.toThrow(/posting too quickly/);
            await post(B, { title: 'Someone else is not held up' });
            await age('community_posts', '2 hours');
            await post(C, { title: 'A new hour' });
        });

        it('allows 30 comments an hour and stops the 31st', async () => {
            await root();
            await db.exec('delete from public.post_comments');
            const id = await post(A, { title: 'For comments' });
            for (let i = 0; i < 30; i++) await comment(C, id, `c${i}`, true);
            await expect(comment(C, id, 'one too many', true)).rejects.toThrow(/commenting too quickly/);
            await age('post_comments', '2 hours');
            await comment(C, id, 'a new hour');
        });
    });

    describe('reports', () => {
        it('keeps a copy of what was reported, and who wrote it', async () => {
            const id = await post(A, { title: 'A dodgy post' });
            await as(B);
            const { rows: r } = await db.query<Record<string, string>>(
                `insert into public.content_reports (target_type, target_id, reason, details) values ('post', $1, 'dangerous', 'No preservative') returning *`, [id]);
            expect(r[0]).toMatchObject({ reporter_id: B, post_id: id, target_author_id: A, snapshot: 'A dodgy post', status: 'open', reason: 'dangerous' });
        });

        it('works for a comment, keeping the post it belongs to', async () => {
            const id = await post(A);
            const c = await comment(C, id, 'Buy my stuff at example.com');
            await as(B);
            const { rows: r } = await db.query<Record<string, string>>(`insert into public.content_reports (target_type, target_id, reason) values ('comment', $1, 'spam') returning *`, [c]);
            expect(r[0]).toMatchObject({ post_id: id, target_author_id: C, snapshot: 'Buy my stuff at example.com' });
        });

        it('cannot be about yourself, about something that is not there, or sent twice, or with an unknown reason', async () => {
            const id = await post(A);
            await as(A);
            await expect(db.query(`insert into public.content_reports (target_type, target_id, reason) values ('post', $1, 'spam')`, [id])).rejects.toThrow(/cannot report your own/);
            await as(B);
            await expect(db.query(`insert into public.content_reports (target_type, target_id, reason) values ('post', gen_random_uuid(), 'spam')`)).rejects.toThrow(/no longer exists/);
            await db.query(`insert into public.content_reports (target_type, target_id, reason) values ('post', $1, 'spam')`, [id]);
            await expect(db.query(`insert into public.content_reports (target_type, target_id, reason) values ('post', $1, 'spam')`, [id])).rejects.toThrow(/duplicate key/);
            const other = await post(A);
            await as(B);
            await expect(db.query(`insert into public.content_reports (target_type, target_id, reason) values ('post', $1, 'rude')`, [other])).rejects.toThrow(/check constraint/);
            await expect(db.query(`insert into public.content_reports (target_type, target_id, reason, details) values ('post', $1, 'other', $2)`, [other, 'x'.repeat(1001)])).rejects.toThrow(/check constraint/);
        });

        it('cannot be filed in someone else\'s name or already resolved', async () => {
            const id = await post(A);
            await as(B);
            await expect(db.query(`insert into public.content_reports (reporter_id, target_type, target_id, reason) values ($1, 'post', $2, 'spam')`, [C, id])).rejects.toThrow(/row-level security/);
            const { rows: r } = await db.query<{ status: string }>(`insert into public.content_reports (target_type, target_id, reason, status) values ('post', $1, 'spam', 'resolved') returning status`, [id]);
            expect(r[0].status).toBe('open');
        });

        it('stops after 20 reports in a day', async () => {
            await root();
            await db.exec('delete from public.content_reports');
            for (let i = 0; i < 20; i++) {
                const id = await post(A, { title: `R${i}` }).catch(async () => { await age('community_posts', '2 hours'); return post(A, { title: `R${i}` }); });
                await as(C);
                await db.query(`insert into public.content_reports (target_type, target_id, reason) values ('post', $1, 'spam')`, [id]);
            }
            await age('community_posts', '2 hours');
            const extra = await post(A, { title: 'One more' });
            await as(C);
            await expect(db.query(`insert into public.content_reports (target_type, target_id, reason) values ('post', $1, 'spam')`, [extra])).rejects.toThrow(/lot of reports/);
        });

        it('are seen by the member who sent them and by moderators, and by nobody else', async () => {
            await root();
            await db.exec('delete from public.content_reports');
            await age('community_posts', '2 hours');
            const id = await post(A, { title: 'Reported' });
            await as(B);
            await db.query(`insert into public.content_reports (target_type, target_id, reason) values ('post', $1, 'spam')`, [id]);
            expect(await rows('select * from public.content_reports')).toHaveLength(1);
            await as(C);
            expect(await rows('select * from public.content_reports')).toHaveLength(0);
            await as(A);
            expect(await rows('select * from public.content_reports')).toHaveLength(0); // not even the one reported
            await as(MOD);
            expect(await rows('select * from public.content_reports')).toHaveLength(1);
        });

        it('are resolved by moderators only, and only the status can change', async () => {
            await root();
            const report = (await rows<{ id: string }>('select id from public.content_reports'))[0].id;
            await as(B);
            expect((await db.query(`update public.content_reports set status = 'dismissed' where id = $1 returning id`, [report])).rows).toHaveLength(0);
            await as(MOD);
            const { rows: r } = await db.query<{ status: string }>(`update public.content_reports set status = 'resolved', resolved_by = $2, resolved_at = now() where id = $1 returning status`, [report, MOD]);
            expect(r[0].status).toBe('resolved');
            await expect(db.query(`update public.content_reports set snapshot = 'rewritten' where id = $1`, [report])).rejects.toThrow(/permission denied/);
            await expect(db.query(`delete from public.content_reports where id = $1`, [report])).rejects.toThrow(/permission denied/);
        });

        it('are kept after the reported content is removed', async () => {
            await root();
            await db.exec('delete from public.content_reports');
            await age('community_posts', '2 hours');
            const id = await post(A, { title: 'Soon gone' });
            await as(B);
            await db.query(`insert into public.content_reports (target_type, target_id, reason) values ('post', $1, 'dangerous')`, [id]);
            await as(MOD);
            await db.query('delete from public.community_posts where id = $1', [id]);
            const kept = await rows<{ snapshot: string }>('select snapshot from public.content_reports');
            expect(kept).toEqual([{ snapshot: 'Soon gone' }]);
        });
    });

    describe('muting', () => {
        it('is your own list: you can add and remove yours, and see no one else\'s', async () => {
            await as(A);
            await db.query(`insert into public.community_mutes (muted_user_id) values ($1)`, [B]);
            expect(await rows('select * from public.community_mutes')).toHaveLength(1);
            await as(B);
            expect(await rows('select * from public.community_mutes')).toHaveLength(0);
            expect((await db.query(`delete from public.community_mutes where user_id = $1 returning user_id`, [A])).rows).toHaveLength(0);
            await as(A);
            expect((await db.query(`delete from public.community_mutes where muted_user_id = $1 returning user_id`, [B])).rows).toHaveLength(1);
        });

        it('cannot be filed for someone else, or against yourself, or twice', async () => {
            await as(A);
            await expect(db.query(`insert into public.community_mutes (user_id, muted_user_id) values ($1, $2)`, [B, C])).rejects.toThrow(/row-level security/);
            await expect(db.query(`insert into public.community_mutes (muted_user_id) values ($1)`, [A])).rejects.toThrow(/check constraint/);
            await db.query(`insert into public.community_mutes (muted_user_id) values ($1)`, [B]);
            await expect(db.query(`insert into public.community_mutes (muted_user_id) values ($1)`, [B])).rejects.toThrow(/duplicate key/);
        });
    });

    describe('recipe versions', () => {
        it('can be added by the author of the recipe only', async () => {
            const id = await post(A, { type: 'formulation' });
            await as(B);
            await expect(db.query(`insert into public.post_snapshots (post_id, version, formulation_data) values ($1, 1, '[]')`, [id])).rejects.toThrow(/row-level security/);
            await as(A);
            await db.query(`insert into public.post_snapshots (post_id, version, formulation_data) values ($1, 1, '[]')`, [id]);
        });

        it('cannot be changed or deleted by hand, though they go with their recipe', async () => {
            const id = await post(A, { type: 'formulation' });
            await as(A);
            await db.query(`insert into public.post_snapshots (post_id, version, formulation_data) values ($1, 1, '[]')`, [id]);
            await expect(db.query(`update public.post_snapshots set version = 2 where post_id = $1`, [id])).rejects.toThrow(/permission denied/);
            await expect(db.query(`delete from public.post_snapshots where post_id = $1`, [id])).rejects.toThrow(/permission denied/);
            await db.query(`delete from public.community_posts where id = $1`, [id]);
            await root();
            expect(await rows('select * from public.post_snapshots where post_id = $1', [id])).toHaveLength(0);
        });
    });

    it('can be run again without changing anything', async () => {
        await root();
        const count = async () => (await rows<{ n: number }>(`select count(*)::int as n from pg_policies where schemaname = 'public'`))[0].n;
        const before = await count();
        await db.exec(MIGRATION_SQL);
        expect(await count()).toBe(before);
        await as(A);
        await db.query(`insert into public.community_posts (post_type, title) values ('discussion', 'Still works')`).catch((e: Error) => {
            if (!/posting too quickly/.test(e.message)) throw e;
        });
    });
});
