import { describe, expect, it, vi } from 'vitest';
import { countSharedRecipes, loadFavorites, loadFormulaSummaries, loadMetricBatches, loadMetricLines, loadMetricsInput } from './metricsData';

vi.mock('./supabase', () => ({ supabase: {} }));

/** A stand-in for the database. A table is either rows, a function giving rows for a requested range, or an error. */
type Table = unknown[] | ((range: [number, number] | null) => unknown[]) | { error: string } | { count: number };
function fakeClient(tables: Record<string, Table>) {
    const calls: { table: string; range: [number, number] | null; filters: [string, unknown][] }[] = [];
    const client = {
        from(table: string) {
            const call = { table, range: null as [number, number] | null, filters: [] as [string, unknown][] };
            calls.push(call);
            const b: Record<string, unknown> = {};
            for (const m of ['select', 'order', 'limit']) b[m] = () => b;
            for (const m of ['eq', 'in']) b[m] = (c: string, v: unknown) => { call.filters.push([`${m}:${c}`, v]); return b; };
            b.range = (from: number, to: number) => { call.range = [from, to]; return b; };
            b.then = (resolve: (v: unknown) => void) => {
                const t = tables[table];
                if (t && !Array.isArray(t) && typeof t !== 'function' && 'error' in t) return resolve({ data: null, error: { message: t.error }, count: null });
                if (t && !Array.isArray(t) && typeof t !== 'function' && 'count' in t) return resolve({ data: null, error: null, count: t.count });
                resolve({ data: typeof t === 'function' ? t(call.range) : t ?? [], error: null, count: null });
            };
            return b;
        },
    };
    return { client: client as never, calls };
}

describe('loadMetricBatches', () => {
    it('turns what the database sends into plain numbers and lists, and keeps the check-ins', async () => {
        const { client } = fakeClient({
            batches: [{
                id: 'b1', formulation_id: null, name: 'Lotion', lot_number: 'L1', batch_size_g: '120.5', made_on: '2026-11-01', status: 'active',
                final_weight_g: '118', ingredient_cost: '4.25', unpriced_count: 1, container_name: 'Jar', container_volume_ml: '50', container_count: '2.5', container_unit_price: '0.4',
                batch_checks: [{ id: 'c1', label: '24 hours', due_on: '2026-11-02', checked_at: '2026-11-02T00:00:00Z', result: 'good', observations: null }],
            }, { id: 'b2', name: 'Bare', batch_size_g: 50, made_on: '2026-11-02', status: 'discarded', batch_checks: [] }],
        });
        const [a, b] = await loadMetricBatches(client);
        expect(a).toMatchObject({ batch_size_g: 120.5, final_weight_g: 118, ingredient_cost: 4.25, container_volume_ml: 50, container_count: 2.5, container_unit_price: 0.4, container_name: 'Jar' });
        expect(a.checks).toEqual([{ result: 'good', observations: [], checked_at: '2026-11-02T00:00:00Z' }]);
        expect(b).toMatchObject({ final_weight_g: null, ingredient_cost: null, container_name: null, unpriced_count: 0 });
    });

    it('says what could not be loaded', async () => {
        await expect(loadMetricBatches(fakeClient({ batches: { error: 'boom' } }).client)).rejects.toThrow('boom');
    });
});

describe('loadMetricLines', () => {
    const row = (n: number) => ({ batch_id: 'b', ingredient_id: `i${n}`, name: `Item ${n}`, actual_g: String(n), cost: n % 2 ? null : '0.5' });

    it('reads every page until one comes back short, converting the numbers', async () => {
        const { client, calls } = fakeClient({
            batch_ingredients: range => Array.from({ length: range![0] === 0 ? 1000 : range![0] === 1000 ? 1000 : 250 }, (_, n) => row(n)),
        });
        const lines = await loadMetricLines(client);
        expect(lines).toHaveLength(2250);
        expect(calls.map(c => c.range)).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
        expect(lines[2]).toMatchObject({ actual_g: 2, cost: 0.5 });
        expect(lines[1].cost).toBeNull();
    });

    it('stops after one short page, and after an empty one', async () => {
        const short = fakeClient({ batch_ingredients: [row(1), row(2)] });
        expect(await loadMetricLines(short.client)).toHaveLength(2);
        expect(short.calls).toHaveLength(1);
        const none = fakeClient({ batch_ingredients: [] });
        expect(await loadMetricLines(none.client)).toEqual([]);
    });

    it('does not read forever', async () => {
        const { client, calls } = fakeClient({ batch_ingredients: () => Array.from({ length: 1000 }, (_, n) => row(n)) });
        expect(await loadMetricLines(client)).toHaveLength(20_000);
        expect(calls).toHaveLength(20);
    });

    it('says what could not be loaded', async () => {
        await expect(loadMetricLines(fakeClient({ batch_ingredients: { error: 'boom' } }).client)).rejects.toThrow('Could not load what went into your batches: boom');
    });
});

describe('the rest', () => {
    it('reads favourites, naming them by trade name, then INCI, skipping gaps', async () => {
        const { client, calls } = fakeClient({
            favorite_ingredients: [
                { ingredients: { id: 'a', trade_name: 'Shea Butter', inci_name: 'Butyrospermum' } },
                { ingredients: { id: 'b', trade_name: '', inci_name: 'Glycerin' } },
                { ingredients: null },
            ],
        });
        expect(await loadFavorites('u1', client)).toEqual([{ id: 'a', name: 'Shea Butter' }, { id: 'b', name: 'Glycerin' }]);
        expect(calls[0].filters).toContainEqual(['eq:user_id', 'u1']);
    });

    it('counts the ingredients of each formula across its phases', async () => {
        const { client } = fakeClient({
            formulations: [
                { id: 'f1', name: 'Lotion', created_at: 't', formulation_phases: [{ formulation_ingredients: [{ id: 1 }, { id: 2 }] }, { formulation_ingredients: [{ id: 3 }] }] },
                { id: 'f2', name: 'Empty', created_at: null, formulation_phases: [] },
            ],
        });
        expect((await loadFormulaSummaries('u1', client)).map(f => [f.id, f.ingredientCount])).toEqual([['f1', 3], ['f2', 0]]);
    });

    it('counts the recipes you have shared', async () => {
        const { client, calls } = fakeClient({ community_posts: { count: 4 } });
        expect(await countSharedRecipes('u1', client)).toBe(4);
        expect(calls[0].filters).toEqual(expect.arrayContaining([['eq:author_id', 'u1'], ['eq:post_type', 'formulation']]));
        expect(await countSharedRecipes('u1', fakeClient({ community_posts: { count: 0 } }).client)).toBe(0);
    });
});

describe('loadMetricsInput', () => {
    it('brings it all together, naming what is in the stash', async () => {
        const { client } = fakeClient({
            batches: [{ id: 'b1', name: 'Lotion', batch_size_g: 100, made_on: '2026-11-01', status: 'active', batch_checks: [] }],
            batch_ingredients: [{ batch_id: 'b1', ingredient_id: 'i1', name: 'Shea', actual_g: 10, cost: null }],
            favorite_ingredients: [],
            formulations: [],
            community_posts: { count: 2 },
            user_stash: [{ id: 'l1', ingredient_id: 'i1', amount_left_g: 50 }],
            ingredients: [{ id: 'i1', trade_name: 'Shea Butter', inci_name: 'Butyrospermum' }],
        });
        const input = await loadMetricsInput('u1', client);
        expect(input.batches).toHaveLength(1);
        expect(input.lines).toHaveLength(1);
        expect(input.sharedCount).toBe(2);
        expect(input.stashNames.get('i1')).toBe('Shea Butter');
    });

    it('fails as a whole if any part fails', async () => {
        const { client } = fakeClient({ batches: [], batch_ingredients: [], favorite_ingredients: { error: 'nope' }, formulations: [], community_posts: { count: 0 }, user_stash: [] });
        await expect(loadMetricsInput('u1', client)).rejects.toThrow('Could not load your favourite ingredients');
    });
});
