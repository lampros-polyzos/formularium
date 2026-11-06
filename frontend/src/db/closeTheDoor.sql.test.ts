// @vitest-environment node
//
// Runs the "close the door" migration on a real Postgres engine (PGlite): the account-data functions are gone, the browser roles can no longer read or
// write any table (including ones created afterwards), the backend's own role still can, and every row is untouched.

import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const migrations = import.meta.glob('./fixtures/20261122000000_close_the_door.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const MIGRATION_SQL = Object.values(migrations)[0];

describe.skipIf(!MIGRATION_SQL)('close the door (real Postgres)', () => {
    let db: PGlite;
    const as = (role: string) => db.exec(`reset role; set role ${role}`);
    const canRead = async (role: string, table: string) => {
        await as(role);
        try { await db.query(`select * from public.${table}`); return true; } catch { return false; } finally { await db.exec('reset role'); }
    };

    beforeAll(async () => {
        db = new PGlite();
        await db.exec(`
          create role anon; create role authenticated; create role backend;
          grant usage on schema public to anon, authenticated, backend;
          alter default privileges in schema public grant all on tables to anon, authenticated;
          create table public.formulations (id int primary key, name text);
          create table public.profiles (id int primary key);
          grant all on all tables in schema public to anon, authenticated, backend;
          create function public.export_my_data() returns int language sql as 'select 1';
          create function public.delete_my_account() returns void language sql as 'select';
          create function public.account_owned_tables() returns int language sql as 'select 1';
          create function public.unrelated() returns int language sql as 'select 1';
          insert into public.formulations values (1, 'Day cream');
        `);
    }, 60_000);

    afterAll(async () => { await db?.close(); });

    it('removes the account-data functions and keeps other functions', async () => {
        await db.exec(MIGRATION_SQL);
        const names = (await db.query<{ n: string }>(`select proname as n from pg_proc where pronamespace = 'public'::regnamespace order by 1`)).rows.map(r => r.n);
        expect(names).toEqual(['unrelated']);
    });

    it('stops the browser roles reading any table, but not the backend role', async () => {
        expect(await canRead('anon', 'formulations')).toBe(false);
        expect(await canRead('authenticated', 'formulations')).toBe(false);
        expect(await canRead('backend', 'formulations')).toBe(true);
    });

    it('does the same for tables created later', async () => {
        await db.exec('create table public.later (id int primary key)');
        expect(await canRead('authenticated', 'later')).toBe(false);
    });

    it('deletes no rows and no tables', async () => {
        expect(Number((await db.query<{ n: number }>('select count(*)::int as n from public.formulations')).rows[0].n)).toBe(1);
        expect(Number((await db.query<{ n: number }>(`select count(*)::int as n from pg_tables where tablename = 'profiles'`)).rows[0].n)).toBe(1);
    });

    it('can be run again, and on a database that has none of it', async () => {
        await db.exec(MIGRATION_SQL);
        const fresh = new PGlite();
        await fresh.exec(MIGRATION_SQL);
        await fresh.close();
    });
});
