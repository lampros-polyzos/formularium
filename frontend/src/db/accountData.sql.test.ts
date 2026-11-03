// @vitest-environment node
//
// Runs the account-data migration on a real Postgres engine (PGlite, in-process) against stand-in tables that
// mimic the app's shapes, and checks what matters: an export holds only the caller's data, a deletion removes
// all of it and nothing of anyone else's, and a deletion that cannot finish leaves everything in place.

import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// A glob (rather than an import) so the test skips, instead of breaking the whole run, if the file was removed
const migrations = import.meta.glob('./fixtures/20261106000000_account_data.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const MIGRATION_SQL = Object.values(migrations)[0];
const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';

describe.skipIf(!MIGRATION_SQL)('account data migration (real Postgres)', () => {
    let db: PGlite;

    const as = (uid: string | null, email = '') =>
        db.exec(`reset role; select set_config('app.uid', '${uid ?? ''}', false), set_config('app.email', '${email}', false); set role authenticated;`);
    const root = () => db.exec('reset role');
    const count = async (table: string, where = 'true') => Number((await db.query<{ n: number }>(`select count(*)::int as n from ${table.includes('.') ? table : `public.${table}`} where ${where}`)).rows[0].n);
    const exported = async () => (await db.query<{ doc: { exported_at: string; account: { id: string; email: string }; data: Record<string, Record<string, unknown>[]> } }>('select public.export_my_data() as doc')).rows[0].doc;

    beforeAll(async () => {
        db = new PGlite();
        await db.exec(`
          create schema auth;
          create table auth.users (id uuid primary key);
          create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.uid', true), '')::uuid $$;
          create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('email', current_setting('app.email', true)) $$;
          create role authenticated;
          create role anon;
          grant usage on schema public, auth to authenticated, anon;

          -- Shapes copied from the app: direct owners, an author column, a recipient column, a keyed profile, children
          create table public.profiles (id uuid primary key references auth.users on delete cascade, username text);
          create table public.formulations (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users, name text);
          create table public.formulation_phases (id uuid primary key default gen_random_uuid(), formulation_id uuid references public.formulations on delete cascade, phase text);
          create table public.user_stash (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users on delete cascade, note text);
          create table public.community_posts (id uuid primary key default gen_random_uuid(), author_id uuid references auth.users, title text);
          create table public.post_comments (id uuid primary key default gen_random_uuid(), post_id uuid references public.community_posts on delete cascade, author_id uuid references auth.users, body text);
          create table public.notifications (id uuid primary key default gen_random_uuid(), recipient_id uuid references auth.users, author_id uuid, message text);
          -- A parent and a child that both belong to the user, where the child has no cascade: the parent can only go second
          create table public.lots (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users, label text);
          create table public.lots_notes (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users, lot_id uuid references public.lots, body text);
          create table public.ingredients (id uuid primary key default gen_random_uuid(), trade_name text);

          alter table public.formulations enable row level security;
          create policy formulations_owner on public.formulations for all to authenticated using (user_id = auth.uid());
          grant all on all tables in schema public to authenticated;
        `);
        await db.exec(MIGRATION_SQL);
        await db.exec('grant all on all tables in schema public to authenticated');
    });

    afterAll(async () => { await db.close(); });

    async function seed() {
        await root();
        await db.exec(`
          truncate auth.users, public.ingredients cascade;
          insert into auth.users values ('${A}'), ('${B}');
          insert into public.ingredients (trade_name) values ('Glycerin');
          insert into public.profiles values ('${A}', 'alice'), ('${B}', 'bob');
          insert into public.formulations (id, user_id, name) values
            ('f0000000-0000-0000-0000-00000000000a', '${A}', 'Alice cream'), ('f0000000-0000-0000-0000-00000000000b', '${B}', 'Bob balm');
          insert into public.formulation_phases (formulation_id, phase) values
            ('f0000000-0000-0000-0000-00000000000a', 'A'), ('f0000000-0000-0000-0000-00000000000a', 'B'), ('f0000000-0000-0000-0000-00000000000b', 'A');
          insert into public.user_stash (user_id, note) values ('${A}', 'a-lot'), ('${B}', 'b-lot');
          insert into public.community_posts (id, author_id, title) values
            ('c0000000-0000-0000-0000-00000000000a', '${A}', 'Alice post'), ('c0000000-0000-0000-0000-00000000000b', '${B}', 'Bob post');
          insert into public.post_comments (post_id, author_id, body) values
            ('c0000000-0000-0000-0000-00000000000b', '${A}', 'alice on bob'),
            ('c0000000-0000-0000-0000-00000000000a', '${B}', 'bob on alice'),
            ('c0000000-0000-0000-0000-00000000000b', '${B}', 'bob on bob');
          insert into public.notifications (recipient_id, author_id, message) values ('${A}', '${B}', 'for alice'), ('${B}', '${A}', 'for bob');
          insert into public.lots (id, user_id, label) values ('10000000-0000-0000-0000-00000000000a', '${A}', 'lot A'), ('10000000-0000-0000-0000-00000000000b', '${B}', 'lot B');
          insert into public.lots_notes (user_id, lot_id, body) values ('${A}', '10000000-0000-0000-0000-00000000000a', 'note A'), ('${B}', '10000000-0000-0000-0000-00000000000b', 'note B');
        `);
    }

    describe('export_my_data', () => {
        it('contains the caller\'s own rows, including children reached through their parent, and the account details', async () => {
            await seed();
            await as(A, 'alice@example.com');
            const doc = await exported();
            expect(doc.account).toEqual({ id: A, email: 'alice@example.com' });
            expect(Date.parse(doc.exported_at)).not.toBeNaN();
            expect(doc.data.profiles).toHaveLength(1);
            expect(doc.data.formulations.map(r => r.name)).toEqual(['Alice cream']);
            expect(doc.data.formulation_phases.map(r => r.phase).sort()).toEqual(['A', 'B']);
            expect(doc.data.user_stash.map(r => r.note)).toEqual(['a-lot']);
            expect(doc.data.community_posts.map(r => r.title)).toEqual(['Alice post']);
            expect(doc.data.post_comments.map(r => r.body)).toEqual(['alice on bob']);
            expect(doc.data.notifications.map(r => r.message)).toEqual(['for alice']);
            expect(doc.data.lots_notes.map(r => r.body)).toEqual(['note A']);
        });

        it('never contains anyone else\'s data or shared reference data', async () => {
            await seed();
            await as(A, 'alice@example.com');
            const text = JSON.stringify(await exported());
            for (const other of ['Bob balm', 'Bob post', 'bob on alice', 'bob on bob', 'b-lot', 'lot B', 'note B', 'for bob']) expect(text).not.toContain(other);
            expect(Object.keys((await exported()).data)).not.toContain('ingredients');
        });

        it('gives an empty list, not an error, for a table where the user has nothing', async () => {
            await seed();
            await root();
            await db.exec(`insert into auth.users values ('33333333-3333-3333-3333-333333333333')`);
            await as('33333333-3333-3333-3333-333333333333', 'new@example.com');
            const doc = await exported();
            expect(doc.data.formulations).toEqual([]);
            expect(doc.data.formulation_phases).toEqual([]);
        });

        it('refuses when nobody is signed in', async () => {
            await seed();
            await as(null);
            await expect(db.query('select public.export_my_data()')).rejects.toThrow(/signed in/);
        });

        it('does not change any data', async () => {
            await seed();
            await as(A);
            await exported();
            await root();
            expect(await count('formulations')).toBe(2);
        });
    });

    describe('delete_my_account', () => {
        it('removes everything the user owns and the login, and nothing of anyone else\'s', async () => {
            await seed();
            await as(A);
            await db.query('select public.delete_my_account()');
            await root();

            expect(await count('auth.users', `id = '${A}'`)).toBe(0);
            for (const [table, where] of [
                ['profiles', `id = '${A}'`], ['formulations', `user_id = '${A}'`], ['user_stash', `user_id = '${A}'`],
                ['community_posts', `author_id = '${A}'`], ['post_comments', `author_id = '${A}'`], ['notifications', `recipient_id = '${A}'`],
                ['lots', `user_id = '${A}'`], ['lots_notes', `user_id = '${A}'`],
            ]) expect(await count(table, where), `${table} should hold nothing of Alice's`).toBe(0);
            // children go with their parent
            expect(await count('formulation_phases')).toBe(1);

            // Bob keeps all of his, and the shared catalogue is untouched
            expect(await count('auth.users', `id = '${B}'`)).toBe(1);
            expect(await count('profiles', `id = '${B}'`)).toBe(1);
            expect(await count('formulations', `user_id = '${B}'`)).toBe(1);
            expect(await count('user_stash', `user_id = '${B}'`)).toBe(1);
            expect(await count('community_posts', `author_id = '${B}'`)).toBe(1);
            expect(await count('post_comments', `author_id = '${B}'`)).toBe(1); // his comment on Alice's post went with the post
            expect(await count('notifications', `recipient_id = '${B}'`)).toBe(1);
            expect(await count('lots', `user_id = '${B}'`)).toBe(1);
            expect(await count('lots_notes', `user_id = '${B}'`)).toBe(1);
            expect(await count('ingredients')).toBe(1);
        });

        it('takes other people\'s comments on the user\'s posts away with the post', async () => {
            await seed();
            await as(A);
            await db.query('select public.delete_my_account()');
            await root();
            expect(await count('post_comments', `body = 'bob on alice'`)).toBe(0);
        });

        it('handles rows that block each other (parent listed before its child)', async () => {
            await seed();
            await as(A);
            await db.query('select public.delete_my_account()');
            await root();
            expect(await count('lots')).toBe(1);
            expect(await count('lots_notes')).toBe(1);
        });

        it('refuses when nobody is signed in, and removes nothing', async () => {
            await seed();
            await as(null);
            await expect(db.query('select public.delete_my_account()')).rejects.toThrow(/signed in/);
            await root();
            expect(await count('auth.users')).toBe(2);
            expect(await count('formulations')).toBe(2);
        });

        it('cannot be used by anonymous visitors', async () => {
            await root();
            for (const fn of ['delete_my_account()', 'export_my_data()', 'account_owned_tables()']) {
                const { rows } = await db.query<{ ok: boolean }>(`select has_function_privilege('anon', 'public.${fn}', 'execute') as ok`);
                expect(rows[0].ok, fn).toBe(false);
                const signedIn = await db.query<{ ok: boolean }>(`select has_function_privilege('authenticated', 'public.${fn}', 'execute') as ok`);
                expect(signedIn.rows[0].ok, fn).toBe(true);
            }
        });

        it('rolls everything back if something still points at the login and cannot be removed', async () => {
            await seed();
            await root();
            // No owner column and no cascade, so the function can neither find it nor cascade through it
            await db.exec(`create table public.legacy_refs (id serial primary key, who uuid references auth.users); insert into public.legacy_refs (who) values ('${A}');`);
            await as(A);
            await expect(db.query('select public.delete_my_account()')).rejects.toThrow();
            await root();

            expect(await count('auth.users', `id = '${A}'`)).toBe(1);
            expect(await count('formulations', `user_id = '${A}'`)).toBe(1);
            expect(await count('user_stash', `user_id = '${A}'`)).toBe(1);
            expect(await count('post_comments', `author_id = '${A}'`)).toBe(1);
            expect(await count('lots_notes', `user_id = '${A}'`)).toBe(1);
            await db.exec('drop table public.legacy_refs');
        });
    });
});
