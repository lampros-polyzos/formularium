// @vitest-environment node
//
// Runs the batch cost + container migration on a real Postgres engine (PGlite, in-process), on top of the
// batch-log migration it builds on, and checks the guarantees that matter: what a batch cost is worked out from the
// prices of the lots actually used and frozen at that moment, guesses are labelled as guesses, and a failure leaves
// nothing behind.

import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const base = import.meta.glob('./fixtures/20261105000000_batch_log.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
// A glob (rather than an import) so the test skips, instead of breaking the whole run, if the file was removed
const next = import.meta.glob('../../../supabase/migrations/20261108000000_batch_costs_and_containers.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const BASE_SQL = Object.values(base)[0];
const NEXT_SQL = Object.values(next)[0];
const A = '11111111-1111-1111-1111-111111111111';

type Alloc = { stash_id: string; grams: number; label: string };
type Line = { ingredient_id: string; name: string; inci_name: string; phase: string; percentage: number; planned_g: number; actual_g: number; est_price_per_g?: number | null; allocations: Alloc[] };
type Cost = { cost: string | null; cost_estimated: boolean };

describe.skipIf(!BASE_SQL || !NEXT_SQL)('batch costs and containers migration (real Postgres)', () => {
    let db: PGlite;
    let seq = 0;

    const as = (uid: string) => db.exec(`reset role; select set_config('app.uid', '${uid}', false); set role authenticated;`);
    const root = () => db.exec('reset role');
    const ingredient = async (name: string) => (await db.query<{ id: string }>(`insert into public.ingredients (trade_name) values ('${name}') returning id`)).rows[0].id;
    const lot = async (ing: string, grams: number, price: number | null, label = `lot-${++seq}`) =>
        (await db.query<{ id: string }>(`insert into public.user_stash (user_id, ingredient_id, amount_left_g, price_per_g, batch_lot_number) values ('${A}', '${ing}', ${grams}, ${price ?? 'null'}, '${label}') returning id`)).rows[0].id;
    const left = async (id: string) => Number((await db.query<{ amount_left_g: string }>(`select amount_left_g from public.user_stash where id = '${id}'`)).rows[0].amount_left_g);
    const num = (v: string | null | undefined) => (v === null || v === undefined ? null : Number(v));
    const line = (ing: string, name: string, grams: number, allocations: Alloc[] = [], est?: number | null): Line =>
        ({ ingredient_id: ing, name, inci_name: name, phase: 'A', percentage: grams, planned_g: grams, actual_g: grams, est_price_per_g: est, allocations });
    const lotNumber = () => `L-${++seq}`;
    const create = (lines: Line[], container: unknown = null) =>
        db.query<{ id: string }>('select public.create_batch($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9::jsonb) as id', [null, 'Day Cream', lotNumber(), 100, 5.5, null, JSON.stringify(lines), '2026-11-08', container === null ? null : JSON.stringify(container)]);
    const costs = async (batchId: string) =>
        (await db.query<Cost & { name: string }>('select name, cost, cost_estimated from public.batch_ingredients where batch_id = $1 order by name', [batchId])).rows;
    const batchRow = async (id: string) =>
        (await db.query<Record<string, string | number | null>>('select * from public.batches where id = $1', [id])).rows[0];

    let glycerin: string, shea: string, oil: string;

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
            amount_left_g numeric, price_per_g numeric, expiration_date date, batch_lot_number text, supplier_name text);
          create table public.user_containers (id uuid primary key default gen_random_uuid(), user_id uuid not null, name text, volume_ml numeric, price_per_unit numeric);
          alter table public.user_stash enable row level security;
          create policy stash_owner on public.user_stash for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
          insert into auth.users values ('${A}');
        `);
        await db.exec(BASE_SQL);
        await db.exec(NEXT_SQL);
        await db.exec('grant all on all tables in schema public to authenticated');
        glycerin = await ingredient('Glycerin');
        shea = await ingredient('Shea Butter');
        oil = await ingredient('Jojoba Oil');
    });

    afterAll(async () => { await db.close(); });

    it('can be applied twice without error', async () => {
        await root();
        await expect(db.exec(NEXT_SQL)).resolves.not.toThrow();
    });

    describe('what a batch cost', () => {
        it('is the grams taken from each lot times that lot\'s price, frozen on the batch', async () => {
            await root();
            const l = await lot(glycerin, 200, 0.02);
            await as(A);
            const { rows: [{ id }] } = await create([line(glycerin, 'Glycerin', 50, [{ stash_id: l, grams: 50, label: 'a' }])]);
            await root();

            expect(await costs(id)).toEqual([{ name: 'Glycerin', cost: '1.0000', cost_estimated: false }]);
            expect(num((await batchRow(id)).ingredient_cost as string)).toBeCloseTo(1, 4);
            expect((await batchRow(id)).unpriced_count).toBe(0);
            const usage = await db.query<{ price_per_g: string }>('select price_per_g from public.batch_stash_usage where batch_id = $1', [id]);
            expect(num(usage.rows[0].price_per_g)).toBeCloseTo(0.02, 6);
        });

        it('adds up lots bought at different prices', async () => {
            await root();
            const cheap = await lot(shea, 100, 0.01), dear = await lot(shea, 100, 0.03);
            await as(A);
            const { rows: [{ id }] } = await create([line(shea, 'Shea Butter', 50, [
                { stash_id: cheap, grams: 30, label: 'old' }, { stash_id: dear, grams: 20, label: 'new' }])]);
            await root();
            expect(num((await costs(id))[0].cost)).toBeCloseTo(0.9, 4); // 30 x 0.01 + 20 x 0.03
        });

        it('does not change when the lot\'s price changes afterwards', async () => {
            await root();
            const l = await lot(oil, 100, 0.05);
            await as(A);
            const { rows: [{ id }] } = await create([line(oil, 'Jojoba Oil', 20, [{ stash_id: l, grams: 20, label: 'a' }])]);
            await root();
            await db.exec(`update public.user_stash set price_per_g = 9 where id = '${l}'`);
            expect(num((await costs(id))[0].cost)).toBeCloseTo(1, 4);
        });

        it('keeps the cost record, and gives the stash back, when the batch is undone', async () => {
            await root();
            const l = await lot(glycerin, 100, 0.02);
            await as(A);
            const { rows: [{ id }] } = await create([line(glycerin, 'Glycerin', 40, [{ stash_id: l, grams: 40, label: 'a' }])]);
            expect(await left(l)).toBe(60);
            await db.query('select public.void_batch($1)', [id]);
            expect(await left(l)).toBe(100);
            await root();
            expect(num((await costs(id))[0].cost)).toBeCloseTo(0.8, 4);
        });
    });

    describe('what is not known for sure', () => {
        it('prices grams that were not taken from the stash with the estimate, and says it is an estimate', async () => {
            const { rows: [{ id }] } = await create([line(glycerin, 'Glycerin', 50, [], 0.03)]);
            expect(await costs(id)).toEqual([{ name: 'Glycerin', cost: '1.5000', cost_estimated: true }]);
        });

        it('prices only the uncovered part with the estimate when the stash covers some of it', async () => {
            await root();
            const l = await lot(glycerin, 40, 0.02);
            await as(A);
            const { rows: [{ id }] } = await create([line(glycerin, 'Glycerin', 50, [{ stash_id: l, grams: 40, label: 'a' }], 0.03)]);
            await root();
            const [c] = await costs(id);
            expect(num(c.cost)).toBeCloseTo(40 * 0.02 + 10 * 0.03, 4);
            expect(c.cost_estimated).toBe(true);
        });

        it('has no cost, rather than a made-up one, when there is no price anywhere', async () => {
            const { rows: [{ id }] } = await create([line(shea, 'Shea Butter', 50, [], null)]);
            expect(await costs(id)).toEqual([{ name: 'Shea Butter', cost: null, cost_estimated: false }]);
            const batch = await batchRow(id);
            expect(batch.ingredient_cost).toBeNull();
            expect(batch.unpriced_count).toBe(1);
        });

        it('treats a price of 0 as "not entered"', async () => {
            await root();
            const l = await lot(shea, 100, 0);
            await as(A);
            const { rows: [{ id }] } = await create([line(shea, 'Shea Butter', 10, [{ stash_id: l, grams: 10, label: 'a' }], 0.04)]);
            await root();
            const [c] = await costs(id);
            expect(num(c.cost)).toBeCloseTo(0.4, 4); // all of it at the estimate
            expect(c.cost_estimated).toBe(true);
        });

        it('flags a total as understated when part of an ingredient has no price at all', async () => {
            await root();
            const l = await lot(glycerin, 30, 0.02);
            await as(A);
            const { rows: [{ id }] } = await create([line(glycerin, 'Glycerin', 50, [{ stash_id: l, grams: 30, label: 'a' }], null)]);
            await root();
            const [c] = await costs(id);
            expect(num(c.cost)).toBeCloseTo(0.6, 4); // only the 30 g that has a price
            expect(c.cost_estimated).toBe(true);
        });

        it('totals the priced ingredients and counts the unpriced ones', async () => {
            await root();
            const l = await lot(glycerin, 100, 0.02);
            await as(A);
            const { rows: [{ id }] } = await create([
                line(glycerin, 'Glycerin', 50, [{ stash_id: l, grams: 50, label: 'a' }]),
                line(shea, 'Shea Butter', 20, [], null),
                line(oil, 'Jojoba Oil', 10, [], 0.05),
            ]);
            await root();
            const batch = await batchRow(id);
            expect(num(batch.ingredient_cost as string)).toBeCloseTo(1 + 0.5, 4);
            expect(batch.unpriced_count).toBe(1);
        });
    });

    describe('containers', () => {
        it('records the container, how many it fills and the density used', async () => {
            await root();
            const { rows: [c] } = await db.query<{ id: string }>(`insert into public.user_containers (user_id, name, volume_ml, price_per_unit) values ('${A}', '50 ml pump bottle', 50, 0.8) returning id`);
            await as(A);
            const { rows: [{ id }] } = await create([line(glycerin, 'Glycerin', 50, [], 0.03)], { id: c.id, name: '50 ml pump bottle', volume_ml: 50, count: 3.4, unit_price: 0.8, density_g_ml: 0.97 });
            await root();
            const batch = await batchRow(id);
            expect(batch).toMatchObject({ container_id: c.id, container_name: '50 ml pump bottle' });
            expect(num(batch.container_volume_ml as string)).toBe(50);
            expect(num(batch.container_count as string)).toBeCloseTo(3.4, 6);
            expect(num(batch.container_unit_price as string)).toBeCloseTo(0.8, 6);
            expect(num(batch.density_g_ml as string)).toBeCloseTo(0.97, 6);
        });

        it('keeps the container\'s name and size on the batch after the container is deleted', async () => {
            await root();
            const { rows: [c] } = await db.query<{ id: string }>(`insert into public.user_containers (user_id, name, volume_ml, price_per_unit) values ('${A}', 'Jar', 100, 1) returning id`);
            await as(A);
            const { rows: [{ id }] } = await create([line(glycerin, 'Glycerin', 50, [], 0.03)], { id: c.id, name: 'Jar', volume_ml: 100, count: 1, unit_price: 1, density_g_ml: 1 });
            await root();
            await db.exec(`delete from public.user_containers where id = '${c.id}'`);
            const batch = await batchRow(id);
            expect(batch.container_id).toBeNull();
            expect(batch).toMatchObject({ container_name: 'Jar' });
            expect(num(batch.container_volume_ml as string)).toBe(100);
        });

        it('is optional', async () => {
            const { rows: [{ id }] } = await create([line(glycerin, 'Glycerin', 50, [], 0.03)]);
            expect(await batchRow(id)).toMatchObject({ container_id: null, container_name: null, container_volume_ml: null, container_count: null });
        });

        it('refuses a container with no size, and then saves nothing at all', async () => {
            await root();
            const l = await lot(glycerin, 100, 0.02);
            const before = Number((await db.query<{ n: number }>('select count(*)::int as n from public.batches')).rows[0].n);
            await as(A);
            await expect(create([line(glycerin, 'Glycerin', 50, [{ stash_id: l, grams: 50, label: 'a' }])], { name: 'Broken', volume_ml: 0, count: 1 })).rejects.toThrow();
            await root();
            expect(Number((await db.query<{ n: number }>('select count(*)::int as n from public.batches')).rows[0].n)).toBe(before);
            expect(await left(l)).toBe(100);
        });
    });

    describe('what stays the same', () => {
        it('still works when called the old way, without a container', async () => {
            await root();
            const l = await lot(glycerin, 100, 0.02);
            await as(A);
            const { rows: [{ id }] } = await db.query<{ id: string }>(
                'select public.create_batch($1, $2, $3, $4, $5, $6, $7::jsonb) as id',
                [null, 'Old call', lotNumber(), 100, 5.5, null, JSON.stringify([line(glycerin, 'Glycerin', 10, [{ stash_id: l, grams: 10, label: 'a' }])])]);
            await root();
            expect(await left(l)).toBe(90);
            expect(num((await costs(id))[0].cost)).toBeCloseTo(0.2, 4);
        });

        it('still refuses, and changes nothing, when a lot no longer holds enough', async () => {
            await root();
            const l = await lot(glycerin, 5, 0.02);
            const before = Number((await db.query<{ n: number }>('select count(*)::int as n from public.batches')).rows[0].n);
            await as(A);
            await expect(create([line(glycerin, 'Glycerin', 50, [{ stash_id: l, grams: 50, label: 'a' }])])).rejects.toThrow(/Not enough/);
            await root();
            expect(await left(l)).toBe(5);
            expect(Number((await db.query<{ n: number }>('select count(*)::int as n from public.batches')).rows[0].n)).toBe(before);
        });

        it('only the owner can call it', async () => {
            await root();
            const { rows } = await db.query<{ ok: boolean }>(`select has_function_privilege('authenticated', 'public.create_batch(uuid, text, text, numeric, numeric, text, jsonb, date, jsonb)', 'execute') as ok`);
            expect(rows[0].ok).toBe(true);
            const anon = await db.query<{ n: number }>(`select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'create_batch'`);
            expect(anon.rows[0].n).toBe(1); // the old version is gone, so there is no ambiguity about which one is called
        });
    });
});
