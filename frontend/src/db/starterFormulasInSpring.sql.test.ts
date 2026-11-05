// @vitest-environment node
//
// Runs the "starter formulas move to Spring" migration on a real Postgres engine (PGlite): the trigger that created three formulas for every new
// login, and the function behind it, are gone; formulas that already exist stay; nothing else on the login table is touched.

import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const migrations = import.meta.glob('./fixtures/20261118000000_starter_formulas_in_spring.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const MIGRATION_SQL = Object.values(migrations)[0];

describe.skipIf(!MIGRATION_SQL)('starter formulas move to Spring (real Postgres)', () => {
    let db: PGlite;
    const count = async (table: string) => Number((await db.query<{ n: number }>(`select count(*)::int as n from ${table}`)).rows[0].n);
    const triggers = async () => (await db.query<{ tgname: string }>(`select tgname from pg_trigger where tgrelid = 'auth.users'::regclass and not tgisinternal order by 1`)).rows.map(r => r.tgname);

    beforeAll(async () => {
        db = new PGlite();
        await db.exec(`
          create schema auth;
          create table auth.users (id uuid primary key default gen_random_uuid());
          create table public.formulations (id uuid primary key default gen_random_uuid(), user_id uuid, name text);
          create function public.populate_starter_formulas() returns trigger language plpgsql as $$
          begin
            insert into public.formulations (user_id, name) values (new.id, 'Starter: one'), (new.id, 'Starter: two'), (new.id, 'Starter: three');
            return new;
          end $$;
          create function public.keep_me() returns trigger language plpgsql as $$ begin return new; end $$;
          create trigger on_auth_user_created after insert on auth.users for each row execute function public.populate_starter_formulas();
          create trigger something_else after insert on auth.users for each row execute function public.keep_me();
        `);
    }, 60_000);

    afterAll(async () => { await db?.close(); });

    it('creates the three formulas for a new login today', async () => {
        await db.exec(`insert into auth.users default values`);
        expect(await count('public.formulations')).toBe(3);
    });

    it('removes the trigger and the function, and nothing else', async () => {
        await db.exec(MIGRATION_SQL);

        expect(await triggers()).toEqual(['something_else']);
        const fns = (await db.query<{ proname: string }>(`select proname from pg_proc where pronamespace = 'public'::regnamespace order by 1`)).rows.map(r => r.proname);
        expect(fns).toEqual(['keep_me']);
    });

    it('keeps the formulas that already exist, and a new login no longer gets any', async () => {
        expect(await count('public.formulations')).toBe(3);
        await db.exec(`insert into auth.users default values`);
        expect(await count('public.formulations')).toBe(3);
    });

    it('changes nothing when run again, and works on a database that has neither the login table nor the function', async () => {
        await db.exec(MIGRATION_SQL);
        expect(await triggers()).toEqual(['something_else']);

        const fresh = new PGlite();
        await fresh.exec(MIGRATION_SQL);
        await fresh.close();
    });
});
