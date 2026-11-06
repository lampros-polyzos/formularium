// @vitest-environment node
//
// Runs the "drop unused tables" migration on a real Postgres engine (PGlite): the tables the app uses keep every row, tables it does not use go, a table
// something still depends on stops the whole migration with nothing dropped, and running it again changes nothing.

import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const migrations = import.meta.glob('./fixtures/20261124000000_drop_unused_tables.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const MIGRATION_SQL = Object.values(migrations)[0];

describe.skipIf(!MIGRATION_SQL)('drop unused tables (real Postgres)', () => {
    let db: PGlite;
    const tables = async () => (await db.query<{ n: string }>(`select relname as n from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' order by 1`)).rows.map(r => r.n);

    beforeAll(async () => {
        db = new PGlite();
        await db.exec(`
          create table public.app_users (id uuid primary key default gen_random_uuid(), username text);
          create table public.formulations (id uuid primary key default gen_random_uuid(), name text);
          create table public.community_posts (id uuid primary key default gen_random_uuid(), title text);
          create table public.profiles (id uuid primary key, username text);
          create table public.users (id uuid primary key);
          create table public.reviews (id uuid primary key default gen_random_uuid(), body text);
          create table public.ingredient_safety_updates (id uuid primary key default gen_random_uuid(), note text);
          insert into public.app_users (username) values ('sam');
          insert into public.formulations (name) values ('Day cream'), ('Toner');
          insert into public.reviews (body) values ('old');
        `);
    }, 60_000);

    afterAll(async () => { await db?.close(); });

    it('stops without dropping anything when a kept table still depends on an unused one', async () => {
        await db.exec(`alter table public.community_posts add column legacy uuid references public.users (id)`);
        await expect(db.exec(MIGRATION_SQL)).rejects.toThrow();
        expect(await tables()).toEqual(['app_users', 'community_posts', 'formulations', 'ingredient_safety_updates', 'profiles', 'reviews', 'users']);
        await db.exec(`alter table public.community_posts drop column legacy`);
    });

    it('drops every table the app does not use, and only those', async () => {
        await db.exec(MIGRATION_SQL);
        expect(await tables()).toEqual(['app_users', 'community_posts', 'formulations']);
    });

    it('keeps every row of the tables it keeps', async () => {
        expect(Number((await db.query<{ n: number }>('select count(*)::int as n from public.formulations')).rows[0].n)).toBe(2);
        expect(Number((await db.query<{ n: number }>('select count(*)::int as n from public.app_users')).rows[0].n)).toBe(1);
    });

    it('changes nothing when run again, or on a database that never had them', async () => {
        await db.exec(MIGRATION_SQL);
        expect(await tables()).toEqual(['app_users', 'community_posts', 'formulations']);
        const fresh = new PGlite();
        await fresh.exec(MIGRATION_SQL);
        await fresh.close();
    });
});
