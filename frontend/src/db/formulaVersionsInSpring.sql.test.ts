// @vitest-environment node
//
// Runs the "formula history in Spring" migration on a real Postgres engine (PGlite): the table keeps numbered, frozen copies per formula, refuses a
// repeated number or lines that are not a list, goes with its formula and its account, and the old save function is removed.

import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const migrations = import.meta.glob('./fixtures/20261119000000_formula_versions_in_spring.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const MIGRATION_SQL = Object.values(migrations)[0];

const USER = '00000000-0000-0000-0000-0000000000a1';
const FORMULA = '00000000-0000-0000-0000-0000000000f1';

describe.skipIf(!MIGRATION_SQL)('formula history in Spring (real Postgres)', () => {
    let db: PGlite;
    const count = async (table = 'public.formulation_versions') => Number((await db.query<{ n: number }>(`select count(*)::int as n from ${table}`)).rows[0].n);
    const add = (n: number, lines = `'[]'`) => db.exec(`insert into public.formulation_versions (formulation_id, user_id, version_number, name, lines) values ('${FORMULA}', '${USER}', ${n}, 'Day Cream', ${lines})`);

    beforeAll(async () => {
        db = new PGlite();
        await db.exec(`
          create table public.app_users (id uuid primary key);
          create table public.formulations (id uuid primary key, user_id uuid references public.app_users (id) on delete cascade, name text);
          create function public.save_formulation_contents(p_formulation_id uuid, p_items jsonb) returns void language sql as 'select 1';
          insert into public.app_users values ('${USER}');
          insert into public.formulations values ('${FORMULA}', '${USER}', 'Day Cream');
        `);
        await db.exec(MIGRATION_SQL);
    }, 60_000);

    afterAll(async () => { await db?.close(); });

    it('keeps numbered versions of a formula, with their lines as JSON text', async () => {
        await add(1, `'[{"ingredient_id":"x","inci_name":"Aqua","trade_name":"Water","phase":"A","percentage":80,"is_qs":true}]'`);
        await add(2);
        expect(await count()).toBe(2);
        const rows = (await db.query<{ version_number: number; lines: string }>(`select version_number, lines from public.formulation_versions order by 1`)).rows;
        expect(JSON.parse(rows[0].lines)[0]).toMatchObject({ inci_name: 'Aqua', percentage: 80, is_qs: true });
    });

    it('never gives two versions of one formula the same number', async () => {
        await expect(add(2)).rejects.toThrow(/duplicate key/i);
    });

    it('refuses lines that are not a list, or not JSON', async () => {
        await expect(add(3, `'{"a":1}'`)).rejects.toThrow(/check constraint|violates/i);
        await expect(add(3, `'not json'`)).rejects.toThrow();
        expect(await count()).toBe(2);
    });

    it('goes with its formula, and with its account', async () => {
        await db.exec(`insert into public.formulations values ('00000000-0000-0000-0000-0000000000f2', '${USER}', 'Other')`);
        await db.exec(`insert into public.formulation_versions (formulation_id, user_id, version_number, name) values ('00000000-0000-0000-0000-0000000000f2', '${USER}', 1, 'Other')`);
        expect(await count()).toBe(3);
        await db.exec(`delete from public.formulations where id = '00000000-0000-0000-0000-0000000000f2'`);
        expect(await count()).toBe(2);
        await db.exec(`delete from public.app_users where id = '${USER}'`);
        expect(await count()).toBe(0);
    });

    it('turns on row-level security with no policies, and removes the old save function', async () => {
        const rls = await db.query<{ relrowsecurity: boolean }>(`select relrowsecurity from pg_class where relname = 'formulation_versions'`);
        expect(rls.rows[0].relrowsecurity).toBe(true);
        expect(Number((await db.query<{ n: number }>(`select count(*)::int as n from pg_policies where tablename = 'formulation_versions'`)).rows[0].n)).toBe(0);
        const fns = await db.query<{ proname: string }>(`select proname from pg_proc where proname = 'save_formulation_contents'`);
        expect(fns.rows).toEqual([]);
    });

    it('changes nothing when run again', async () => {
        await db.exec(MIGRATION_SQL);
        expect(await count()).toBe(0);
    });
});
