// @vitest-environment node
//
// Runs the formula-history migration on a real Postgres engine (PGlite, in-process) with stand-ins for the Supabase
// pieces it depends on, and checks what matters: numbering, frozen contents, and that nobody reaches another
// person's versions.

import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// A glob (rather than an import) so the test skips, instead of breaking the whole run, if the fixture is missing
const migrations = import.meta.glob('./fixtures/20261109000000_formula_versions.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const MIGRATION_SQL = Object.values(migrations)[0];
const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';

describe.skipIf(!MIGRATION_SQL)('formula history migration (real Postgres)', () => {
    let db: PGlite;
    let formulaA: string;
    let formulaA2: string;
    let formulaB: string;

    const as = (uid: string) => db.exec(`reset role; select set_config('app.uid', '${uid}', false); set role authenticated;`);
    const root = () => db.exec('reset role');
    const lines = JSON.stringify([{ ingredient_id: 'i1', inci_name: 'Aqua', trade_name: 'Water', phase: 'A', percentage: 90, is_qs: true }]);
    const save = (formulationId: string, note: string | null = 'first') =>
        db.query<{ id: string; version_number: number }>(
            `insert into public.formulation_versions (formulation_id, note, name, profile_id, target_weight_g, target_ph, lines)
             values ($1, $2, 'Day Cream', 'ow_lotion', 100, 5.5, $3::jsonb) returning id, version_number`,
            [formulationId, note, lines],
        );

    beforeAll(async () => {
        db = new PGlite();
        await db.exec(`
          create schema auth;
          create table auth.users (id uuid primary key);
          create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.uid', true), '')::uuid $$;
          create role authenticated;
          grant usage on schema public, auth to authenticated;
          create table public.formulations (id uuid primary key default gen_random_uuid(), user_id uuid not null, name text);
          alter table public.formulations enable row level security;
          create policy formulations_owner on public.formulations for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
          insert into auth.users values ('${A}'), ('${B}');
        `);
        await db.exec(MIGRATION_SQL);
        await db.exec('grant all on all tables in schema public to authenticated');
        formulaA = (await db.query<{ id: string }>(`insert into public.formulations (user_id, name) values ('${A}', 'Day Cream') returning id`)).rows[0].id;
        formulaA2 = (await db.query<{ id: string }>(`insert into public.formulations (user_id, name) values ('${A}', 'Toner') returning id`)).rows[0].id;
        formulaB = (await db.query<{ id: string }>(`insert into public.formulations (user_id, name) values ('${B}', 'Theirs') returning id`)).rows[0].id;
    }, 60_000);

    afterAll(async () => { await db?.close(); });

    it('can be run twice', async () => {
        await root();
        await db.exec(MIGRATION_SQL);
    });

    it('numbers versions 1, 2, 3 per formula, each formula counting on its own', async () => {
        await as(A);
        expect((await save(formulaA)).rows[0].version_number).toBe(1);
        expect((await save(formulaA)).rows[0].version_number).toBe(2);
        expect((await save(formulaA2)).rows[0].version_number).toBe(1);
        expect((await save(formulaA)).rows[0].version_number).toBe(3);
    });

    it('ignores a version number the app tries to choose', async () => {
        await as(A);
        const { rows } = await db.query<{ version_number: number }>(
            `insert into public.formulation_versions (formulation_id, version_number, name, lines) values ($1, 99, 'x', '[]') returning version_number`, [formulaA]);
        expect(rows[0].version_number).toBe(4);
    });

    it('keeps the contents as they were', async () => {
        await as(A);
        const { rows } = await db.query<{ lines: { percentage: number }[]; name: string }>(
            `select name, lines from public.formulation_versions where formulation_id = $1 and version_number = 1`, [formulaA]);
        expect(rows[0].name).toBe('Day Cream');
        expect(rows[0].lines).toEqual([{ ingredient_id: 'i1', inci_name: 'Aqua', trade_name: 'Water', phase: 'A', percentage: 90, is_qs: true }]);
    });

    it('lets the note be edited, and nothing else', async () => {
        await as(A);
        await db.query(`update public.formulation_versions set note = 'better note' where formulation_id = $1 and version_number = 1`, [formulaA]);
        expect((await db.query<{ note: string }>(`select note from public.formulation_versions where formulation_id = $1 and version_number = 1`, [formulaA])).rows[0].note).toBe('better note');
        await expect(db.query(`update public.formulation_versions set name = 'Changed' where formulation_id = $1 and version_number = 1`, [formulaA])).rejects.toThrow(/cannot be changed/);
        await expect(db.query(`update public.formulation_versions set lines = '[]' where formulation_id = $1 and version_number = 1`, [formulaA])).rejects.toThrow(/cannot be changed/);
        await expect(db.query(`update public.formulation_versions set version_number = 50 where formulation_id = $1 and version_number = 1`, [formulaA])).rejects.toThrow(/cannot be changed/);
    });

    it('does not let you add a version to someone else\'s formula', async () => {
        await as(A);
        await expect(save(formulaB)).rejects.toThrow(/row-level security/);
    });

    it('does not let you add one under someone else\'s name', async () => {
        await as(A);
        await expect(db.query(`insert into public.formulation_versions (formulation_id, user_id, name) values ($1, '${B}', 'x')`, [formulaA])).rejects.toThrow(/row-level security/);
    });

    it('keeps each person\'s versions to themselves', async () => {
        await as(B);
        await save(formulaB, 'mine');
        expect((await db.query(`select * from public.formulation_versions`)).rows).toHaveLength(1);
        // and cannot change or delete the other person's
        await db.query(`update public.formulation_versions set note = 'hacked' where formulation_id = $1`, [formulaA]);
        await db.query(`delete from public.formulation_versions where formulation_id = $1`, [formulaA]);
        await as(A);
        expect((await db.query(`select * from public.formulation_versions where formulation_id = $1`, [formulaA])).rows).toHaveLength(4);
        expect((await db.query<{ note: string }>(`select note from public.formulation_versions where formulation_id = $1 and version_number = 2`, [formulaA])).rows[0].note).toBe('first');
    });

    it('lets you delete your own version without renumbering the rest, and the next one carries on', async () => {
        await as(A);
        await db.query(`delete from public.formulation_versions where formulation_id = $1 and version_number = 2`, [formulaA]);
        const numbers = (await db.query<{ version_number: number }>(`select version_number from public.formulation_versions where formulation_id = $1 order by 1`, [formulaA])).rows.map(r => r.version_number);
        expect(numbers).toEqual([1, 3, 4]);
        expect((await save(formulaA)).rows[0].version_number).toBe(5);
    });

    it('goes away with the formula', async () => {
        await as(A);
        await db.query(`delete from public.formulations where id = $1`, [formulaA2]);
        expect((await db.query(`select * from public.formulation_versions where formulation_id = $1`, [formulaA2])).rows).toHaveLength(0);
    });

    it('rejects contents that are not a list', async () => {
        await as(A);
        await expect(db.query(`insert into public.formulation_versions (formulation_id, name, lines) values ($1, 'x', '{}'::jsonb)`, [formulaA])).rejects.toThrow(/check constraint/);
    });
});
