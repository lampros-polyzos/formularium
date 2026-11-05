// @vitest-environment node
//
// Runs the "Spring owns auth" migration on a real Postgres engine (PGlite, in-process) against a stand-in for Supabase's own user table:
// every foreign key that pointed at auth.users must now point at app_users, nothing may be deleted, and running it twice must change nothing.

import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const migrations = import.meta.glob('./fixtures/20261116000000_spring_owns_auth.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const MIGRATION_SQL = Object.values(migrations)[0];

const OLD_USER = '00000000-0000-0000-0000-0000000000a1';

describe.skipIf(!MIGRATION_SQL)('Spring owns auth (real Postgres)', () => {
    let db: PGlite;

    const foreignKeys = async () => (await db.query<{ tbl: string; col: string; target: string; on_delete: string; validated: boolean }>(`
        select c.conrelid::regclass::text as tbl, a.attname as col, c.confrelid::regclass::text as target, c.confdeltype as on_delete, c.convalidated as validated
          from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
         where c.contype = 'f' and c.conrelid::regclass::text in ('user_stash', 'community_posts', 'content_reports', 'profiles')
         order by 1, 2`)).rows;

    beforeAll(async () => {
        db = new PGlite();
        await db.exec(`
          create schema auth;
          create table auth.users (id uuid primary key);
          create table public.profiles (id uuid primary key references auth.users (id) on delete cascade, username text);
          create table public.user_stash (id serial primary key, user_id uuid not null references auth.users (id) on delete cascade);
          create table public.community_posts (id serial primary key, author_id uuid references auth.users (id) on delete set null);
          create table public.content_reports (id serial primary key, reporter_id uuid not null references auth.users (id) on delete cascade, note text);
          -- a foreign key to something else must be left alone
          create table public.other (id serial primary key, stash_id int references public.user_stash (id));
          -- Supabase's own tables also point at auth.users, and are owned by Supabase: the migration must leave them alone
          create table auth.identities (id serial primary key, user_id uuid not null references auth.users (id) on delete cascade);
          insert into auth.users values ('${OLD_USER}');
          insert into public.profiles values ('${OLD_USER}', 'old-timer');
          insert into public.user_stash (user_id) values ('${OLD_USER}');
          insert into public.community_posts (author_id) values ('${OLD_USER}');
        `);
        await db.exec(MIGRATION_SQL);
    }, 60_000);

    afterAll(async () => { await db?.close(); });

    it('moves every foreign key from auth.users to app_users, keeping what happens on delete', async () => {
        const fks = await foreignKeys();
        expect(fks).toHaveLength(4);
        for (const fk of fks) expect(fk.target, `${fk.tbl}.${fk.col}`).toBe('app_users');
        const byTable = Object.fromEntries(fks.map(f => [f.tbl, f.on_delete]));
        expect(byTable['community_posts']).toBe('n');   // set null stays set null
        expect(byTable['user_stash']).toBe('c');        // cascade stays cascade
    });

    it('keeps the rows that belong to old Supabase accounts (the new keys are not checked against them)', async () => {
        for (const fk of await foreignKeys()) expect(fk.validated, `${fk.tbl}.${fk.col}`).toBe(false);
        expect(Number((await db.query<{ n: number }>('select count(*)::int as n from public.user_stash')).rows[0].n)).toBe(1);
        expect(Number((await db.query<{ n: number }>('select count(*)::int as n from public.profiles')).rows[0].n)).toBe(1);
    });

    it('does not let anything new point at an account that does not exist, and cascades from the new table', async () => {
        await expect(db.exec(`insert into public.user_stash (user_id) values ('00000000-0000-0000-0000-0000000000ff')`)).rejects.toThrow(/foreign key/i);

        await db.exec(`insert into public.app_users (id, email, username) values ('00000000-0000-0000-0000-0000000000b1', 'a@example.com', 'alice')`);
        await db.exec(`insert into public.user_stash (user_id) values ('00000000-0000-0000-0000-0000000000b1')`);
        await db.exec(`delete from public.app_users where id = '00000000-0000-0000-0000-0000000000b1'`);
        const left = await db.query<{ n: number }>(`select count(*)::int as n from public.user_stash where user_id = '00000000-0000-0000-0000-0000000000b1'`);
        expect(Number(left.rows[0].n)).toBe(0);
    });

    it('leaves the tables Supabase owns alone (they belong to Supabase, and changing them is not allowed)', async () => {
        const rows = await db.query<{ target: string }>(`select c.confrelid::regclass::text as target from pg_constraint c where c.contype = 'f' and c.conrelid = 'auth.identities'::regclass`);
        expect(rows.rows.map(r => r.target)).toEqual(['auth.users']);
    });

    it('leaves foreign keys to other tables alone', async () => {
        const rows = await db.query<{ target: string }>(`select c.confrelid::regclass::text as target from pg_constraint c where c.contype = 'f' and c.conrelid = 'public.other'::regclass`);
        expect(rows.rows.map(r => r.target)).toEqual(['user_stash']);
    });

    it('keeps email and username unique ignoring upper and lower case, and the Google id unique', async () => {
        await db.exec(`insert into public.app_users (email, username, google_sub) values ('Case@Example.com', 'Casey', 'g-1')`);
        await expect(db.exec(`insert into public.app_users (email, username) values ('case@example.com', 'other')`)).rejects.toThrow(/duplicate key/i);
        await expect(db.exec(`insert into public.app_users (email, username) values ('new@example.com', 'CASEY')`)).rejects.toThrow(/duplicate key/i);
        await expect(db.exec(`insert into public.app_users (email, username, google_sub) values ('g@example.com', 'gee', 'g-1')`)).rejects.toThrow(/duplicate key/i);
    });

    it('removes refresh tokens with their account, and keeps only a hash of each', async () => {
        await db.exec(`insert into public.app_users (id, email, username) values ('00000000-0000-0000-0000-0000000000c1', 'c@example.com', 'carol')`);
        await db.exec(`insert into public.refresh_tokens (user_id, family_id, token_hash, expires_at) values ('00000000-0000-0000-0000-0000000000c1', gen_random_uuid(), 'abc', now() + interval '1 day')`);
        await expect(db.exec(`insert into public.refresh_tokens (user_id, family_id, token_hash, expires_at) values ('00000000-0000-0000-0000-0000000000c1', gen_random_uuid(), 'abc', now())`)).rejects.toThrow(/duplicate key/i);
        await db.exec(`delete from public.app_users where id = '00000000-0000-0000-0000-0000000000c1'`);
        expect(Number((await db.query<{ n: number }>(`select count(*)::int as n from public.refresh_tokens`)).rows[0].n)).toBe(0);
    });

    it('turns on row-level security with no policies, so the browser roles cannot reach the new tables', async () => {
        const rls = await db.query<{ relname: string; relrowsecurity: boolean }>(`select relname, relrowsecurity from pg_class where relname in ('app_users', 'refresh_tokens') order by 1`);
        expect(rls.rows).toEqual([{ relname: 'app_users', relrowsecurity: true }, { relname: 'refresh_tokens', relrowsecurity: true }]);
        const policies = await db.query<{ n: number }>(`select count(*)::int as n from pg_policies where tablename in ('app_users', 'refresh_tokens')`);
        expect(Number(policies.rows[0].n)).toBe(0);
    });

    it('changes nothing when run again, and works on a database that has no auth schema at all', async () => {
        const before = await foreignKeys();
        await db.exec(MIGRATION_SQL);
        expect(await foreignKeys()).toEqual(before);

        const fresh = new PGlite();
        await fresh.exec(MIGRATION_SQL);
        expect(Number((await fresh.query<{ n: number }>('select count(*)::int as n from public.app_users')).rows[0].n)).toBe(0);
        await fresh.close();
    });
});
