// @vitest-environment node
//
// Runs the batch-log migration on a real Postgres engine (PGlite, in-process) with stand-ins for the Supabase
// pieces it depends on, and checks the guarantees that matter most: the stash only changes when a batch is
// confirmed with allocations, a failure leaves nothing behind, and users cannot reach each other's data.

import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// The migration as first applied (the file in supabase/migrations is removed once you have run it).
// A glob (rather than an import) so the test skips, instead of breaking the whole run, if the fixture is missing
const migrations = import.meta.glob('./fixtures/20261105000000_batch_log.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const MIGRATION_SQL = Object.values(migrations)[0];
const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';

// The migration file may be removed once it has been applied to your project
const present = Boolean(MIGRATION_SQL);

type Line = { ingredient_id: string; name: string; inci_name: string; phase: string; percentage: number; planned_g: number; actual_g: number; allocations: { stash_id: string; grams: number; label: string }[] };

describe.skipIf(!present)('batch log migration (real Postgres)', () => {
    let db: PGlite;
    let seq = 0;

    const as = (uid: string) => db.exec(`reset role; select set_config('app.uid', '${uid}', false); set role authenticated;`);
    const root = () => db.exec('reset role');
    const ingredient = async (name: string) => (await db.query<{ id: string }>(`insert into public.ingredients (trade_name) values ('${name}') returning id`)).rows[0].id;
    const lot = async (uid: string, ing: string, grams: number, label = `lot-${++seq}`) =>
        (await db.query<{ id: string }>(`insert into public.user_stash (user_id, ingredient_id, amount_left_g, batch_lot_number) values ('${uid}', '${ing}', ${grams}, '${label}') returning id`)).rows[0].id;
    const stash = async (id: string) => Number((await db.query<{ amount_left_g: string }>(`select amount_left_g from public.user_stash where id = '${id}'`)).rows[0].amount_left_g);
    const count = async (table: string) => Number((await db.query<{ n: number }>(`select count(*)::int as n from public.${table}`)).rows[0].n);
    const line = (ing: string, name: string, grams: number, allocations: Line['allocations'] = []): Line =>
        ({ ingredient_id: ing, name, inci_name: name, phase: 'A', percentage: grams, planned_g: grams, actual_g: grams, allocations });
    const start = (lotNumber: string, lines: Line[]) =>
        db.query<{ id: string }>('select public.create_batch($1, $2, $3, $4, $5, $6, $7::jsonb) as id', [null, 'Day Cream', lotNumber, 100, 5.5, null, JSON.stringify(lines)]);
    const newLot = () => `L-${++seq}`;

    let glycerin: string;
    let shea: string;

    beforeAll(async () => {
        db = new PGlite();
        await db.exec(`
          create schema auth;
          create table auth.users (id uuid primary key);
          create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.uid', true), '')::uuid $$;
          create role authenticated;
          grant usage on schema public, auth to authenticated;
          create table public.formulations (id uuid primary key default gen_random_uuid(), name text);
          create table public.ingredients (id uuid primary key default gen_random_uuid(), trade_name text);
          create table public.user_stash (
            id uuid primary key default gen_random_uuid(), user_id uuid not null, ingredient_id uuid,
            amount_left_g numeric, expiration_date date, batch_lot_number text, supplier_name text);
          alter table public.user_stash enable row level security;
          create policy stash_owner on public.user_stash for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
          insert into auth.users values ('${A}'), ('${B}');
        `);
        await db.exec(MIGRATION_SQL);
        await db.exec('grant all on all tables in schema public to authenticated');
        glycerin = await ingredient('Glycerin');
        shea = await ingredient('Shea Butter');
    }, 60_000);

    afterAll(async () => { await db?.close(); });

    describe('starting a batch', () => {
        it('takes exactly the allocated grams out of the stash lots', async () => {
            await root();
            const old = await lot(A, glycerin, 50), fresh = await lot(A, glycerin, 20), sheaLot = await lot(A, shea, 100);
            await as(A);
            const { rows } = await start(newLot(), [
                line(glycerin, 'Glycerin', 60, [{ stash_id: old, grams: 50, label: 'old' }, { stash_id: fresh, grams: 10, label: 'fresh' }]),
                line(shea, 'Shea Butter', 25, [{ stash_id: sheaLot, grams: 25, label: 'shea' }]),
            ]);
            await root();
            expect([await stash(old), await stash(fresh), await stash(sheaLot)]).toEqual([0, 10, 75]);
            expect((await db.query(`select count(*)::int as n from public.batch_stash_usage where batch_id = '${rows[0].id}'`)).rows[0]).toEqual({ n: 3 });
            expect((await db.query<{ stash_deducted: boolean }>(`select stash_deducted from public.batches where id = '${rows[0].id}'`)).rows[0].stash_deducted).toBe(true);
        });

        it('creates the 24 hour, 1 week, 4 week and 12 week check-ins', async () => {
            await as(A);
            const { rows } = await start(newLot(), [line(glycerin, 'Glycerin', 1)]);
            const checks = (await db.query<{ label: string; days: number }>(
                `select label, (due_on - made_on)::int as days from public.batch_checks c join public.batches b on b.id = c.batch_id where b.id = '${rows[0].id}' order by due_on`)).rows;
            expect(checks.map(c => [c.label, c.days])).toEqual([['24 hours', 1], ['1 week', 7], ['4 weeks', 28], ['12 weeks', 84]]);
        });

        it('does not touch the stash at all when nothing is allocated (log only)', async () => {
            await root();
            const untouched = await lot(A, glycerin, 40);
            await as(A);
            const { rows } = await start(newLot(), [line(glycerin, 'Glycerin', 5), line(shea, 'Shea Butter', 10)]);
            await root();
            expect(await stash(untouched)).toBe(40);
            expect((await db.query<{ stash_deducted: boolean }>(`select stash_deducted from public.batches where id = '${rows[0].id}'`)).rows[0].stash_deducted).toBe(false);
        });

        it('saves NOTHING when one lot no longer holds enough (the first, valid line is rolled back too)', async () => {
            await root();
            const plenty = await lot(A, shea, 100), scarce = await lot(A, glycerin, 10);
            const before = { batches: await count('batches'), lines: await count('batch_ingredients'), usage: await count('batch_stash_usage'), checks: await count('batch_checks') };
            await as(A);
            await expect(start(newLot(), [
                line(shea, 'Shea Butter', 30, [{ stash_id: plenty, grams: 30, label: 'plenty' }]),
                line(glycerin, 'Glycerin', 50, [{ stash_id: scarce, grams: 50, label: 'only 10' }]),
            ])).rejects.toThrow(/Not enough Glycerin/);
            await root();
            expect({ batches: await count('batches'), lines: await count('batch_ingredients'), usage: await count('batch_stash_usage'), checks: await count('batch_checks') }).toEqual(before);
            expect([await stash(plenty), await stash(scarce)]).toEqual([100, 10]);
        });

        it('cannot take from someone else\'s stash', async () => {
            await root();
            const bobs = await lot(B, glycerin, 500);
            await as(A);
            await expect(start(newLot(), [line(glycerin, 'Glycerin', 5, [{ stash_id: bobs, grams: 5, label: 'not mine' }])])).rejects.toThrow(/Not enough Glycerin/);
            await root();
            expect(await stash(bobs)).toBe(500);
        });

        it('rejects an empty batch, a duplicate lot number and a zero amount', async () => {
            await root();
            const stock = await lot(A, glycerin, 10);
            await as(A);
            const used = newLot();
            await start(used, [line(glycerin, 'Glycerin', 1)]);
            await expect(start(newLot(), [])).rejects.toThrow(/at least one ingredient/);
            await expect(start(used, [line(glycerin, 'Glycerin', 1)])).rejects.toThrow(/duplicate key|unique/i);
            await expect(start(newLot(), [line(glycerin, 'Glycerin', 5, [{ stash_id: stock, grams: 0, label: 'x' }])])).rejects.toThrow(/Invalid amount/);
        });

        it('lets only one of two batches claim the last grams of a lot', async () => {
            await root();
            const last = await lot(A, glycerin, 10);
            await as(A);
            await start(newLot(), [line(glycerin, 'Glycerin', 10, [{ stash_id: last, grams: 10, label: 'last' }])]);
            await expect(start(newLot(), [line(glycerin, 'Glycerin', 1, [{ stash_id: last, grams: 1, label: 'last' }])])).rejects.toThrow(/Not enough/);
            await root();
            expect(await stash(last)).toBe(0);
        });
    });

    describe('undoing a batch', () => {
        it('restores exactly what the batch took and marks it undone', async () => {
            await root();
            const stock = await lot(A, glycerin, 100);
            await as(A);
            const { rows } = await start(newLot(), [line(glycerin, 'Glycerin', 40, [{ stash_id: stock, grams: 40, label: 'x' }])]);
            await root();
            expect(await stash(stock)).toBe(60);
            await as(A);
            await db.query('select public.void_batch($1)', [rows[0].id]);
            await root();
            expect(await stash(stock)).toBe(100);
            expect((await db.query<{ status: string }>(`select status from public.batches where id = '${rows[0].id}'`)).rows[0].status).toBe('voided');
        });

        it('cannot be done twice (no double refund)', async () => {
            await root();
            const stock = await lot(A, glycerin, 100);
            await as(A);
            const { rows } = await start(newLot(), [line(glycerin, 'Glycerin', 30, [{ stash_id: stock, grams: 30, label: 'x' }])]);
            await db.query('select public.void_batch($1)', [rows[0].id]);
            await expect(db.query('select public.void_batch($1)', [rows[0].id])).rejects.toThrow(/already undone/);
            await root();
            expect(await stash(stock)).toBe(100);
        });

        it('copes with a stash lot that was deleted after the batch', async () => {
            await root();
            const gone = await lot(A, glycerin, 100);
            await as(A);
            const { rows } = await start(newLot(), [line(glycerin, 'Glycerin', 30, [{ stash_id: gone, grams: 30, label: 'x' }])]);
            await root();
            await db.query(`delete from public.user_stash where id = '${gone}'`);
            await as(A);
            await expect(db.query('select public.void_batch($1)', [rows[0].id])).resolves.toBeDefined();
        });

        it('cannot be done by another user', async () => {
            await as(A);
            const { rows } = await start(newLot(), [line(glycerin, 'Glycerin', 1)]);
            await as(B);
            await expect(db.query('select public.void_batch($1)', [rows[0].id])).rejects.toThrow(/not found/i);
        });
    });

    describe('privacy', () => {
        it('shows each user only their own batches, ingredients, stash usage and check-ins', async () => {
            await as(A);
            await start(newLot(), [line(glycerin, 'Glycerin', 1)]);
            await as(B);
            for (const table of ['batches', 'batch_ingredients', 'batch_stash_usage', 'batch_checks']) expect(await count(table)).toBe(0);
        });

        it('does not let a user attach rows to another user\'s batch', async () => {
            await as(A);
            const { rows } = await start(newLot(), [line(glycerin, 'Glycerin', 1)]);
            await as(B);
            await expect(db.query(`insert into public.batch_checks (batch_id, label, due_on) values ('${rows[0].id}', 'sneaky', current_date)`)).rejects.toThrow(/row-level security/);
            await expect(db.query(`insert into public.batch_ingredients (batch_id, name, phase, percentage, planned_g, actual_g) values ('${rows[0].id}', 'x', 'A', 1, 1, 1)`)).rejects.toThrow(/row-level security/);
        });
    });

    describe('check-ins and batch details', () => {
        it('records a check-in and measurements, and refuses invalid values', async () => {
            await as(A);
            const { rows } = await start(newLot(), [line(glycerin, 'Glycerin', 1)]);
            const first = (await db.query<{ id: string }>(`select id from public.batch_checks where batch_id = '${rows[0].id}' order by due_on limit 1`)).rows[0].id;
            await db.query(`update public.batch_checks set checked_at = now(), result = 'minor', observations = array['separation','odor'], notes = 'slight' where id = '${first}'`);
            await expect(db.query(`update public.batch_checks set result = 'amazing' where id = '${first}'`)).rejects.toThrow(/check constraint/i);
            await db.query(`update public.batches set measured_ph = 5.4, final_weight_g = 98.5 where id = '${rows[0].id}'`);
            await expect(db.query(`update public.batches set status = 'lost' where id = '${rows[0].id}'`)).rejects.toThrow(/check constraint/i);
        });
    });
});
