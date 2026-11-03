import { describe, expect, it } from 'vitest';
import type { StashLot } from './batchPlan';
import { computeMetrics, type MetricBatch, type MetricLine, type MetricsInput, type MetricsOptions } from './metrics';

const TODAY = new Date(2026, 10, 18); // Wed 18 Nov 2026
const OPTS: MetricsOptions = { range: 'all', today: TODAY, warningDays: 30, lowStockG: 20 };

const batch = (id: string, made_on: string, over: Partial<MetricBatch> = {}): MetricBatch => ({
    id, formulation_id: 'f-lotion', name: 'Lotion', batch_size_g: 100, made_on, status: 'active', checks: [], ...over,
});
const line = (batch_id: string, ingredient_id: string | null, name: string, actual_g: number, cost: number | null = null): MetricLine =>
    ({ batch_id, ingredient_id, name, actual_g, cost });
const lot = (id: string, ingredient_id: string, amount: number | null, over: Partial<StashLot> = {}): StashLot =>
    ({ id, ingredient_id, amount_left_g: amount, expiration_date: null, ...over });

const empty: MetricsInput = { batches: [], lines: [], formulas: [], favorites: [], lots: [], stashNames: new Map(), sharedCount: 0 };
const run = (input: Partial<MetricsInput>, opts: Partial<MetricsOptions> = {}) => computeMetrics({ ...empty, ...input }, { ...OPTS, ...opts });

describe('with nothing yet', () => {
    it('gives zeros and gaps, not errors', () => {
        const m = run({});
        expect(m.overview).toMatchObject({ batches: 0, gramsMade: 0, avgBatchG: 0, ingredientSpend: 0, avgCostPerBatch: null, costPer100g: null, mostExpensive: null, lastMadeOn: null, daysSinceLast: null });
        expect(m.ingredientsByUse).toEqual([]);
        expect(m.activity).toMatchObject({ busiestMonth: null, busiestWeekday: null, streakWeeks: 0, avgPerActiveMonth: 0 });
        expect(m.activity.months).toHaveLength(12);
        expect(m.stability.goodShare).toBeNull();
        expect(m.yieldStats.avgPercent).toBeNull();
        expect(m.library.avgIngredients).toBeNull();
    });
});

describe('totals', () => {
    const batches = [
        batch('a', '2026-11-10', { batch_size_g: 100, ingredient_cost: 4, container_count: 2, container_unit_price: 0.5 }),
        batch('b', '2026-10-20', { batch_size_g: 200, ingredient_cost: 6, container_count: 3, container_unit_price: 0.5 }),
        batch('c', '2026-09-01', { batch_size_g: 300, ingredient_cost: null }),
        batch('v', '2026-11-01', { batch_size_g: 999, status: 'voided', ingredient_cost: 99 }),
    ];

    it('counts what was made, leaving out undone batches', () => {
        const o = run({ batches }).overview;
        expect(o.batches).toBe(3);
        expect(o.gramsMade).toBe(600);
        expect(o.avgBatchG).toBe(200);
        expect(o.lastMadeOn).toBe('2026-11-10');
        expect(o.daysSinceLast).toBe(8);
    });

    it('adds up the spend from the batches that have a price, and says how many do', () => {
        const o = run({ batches }).overview;
        expect(o).toMatchObject({ ingredientSpend: 10, pricedBatches: 2, avgCostPerBatch: 5 });
        expect(o.costPer100g).toBeCloseTo(3.33, 2); // 10 spent on 300 g that had a price
        expect(o.mostExpensive).toEqual({ name: 'Lotion', cost: 6, made_on: '2026-10-20' });
    });

    it('adds up containers filled and what they cost', () => {
        expect(run({ batches }).overview).toMatchObject({ containersFilled: 5, containerSpend: 2.5 });
    });

    it('counts what was thrown away, and what it cost', () => {
        const o = run({ batches: [...batches, batch('d', '2026-08-01', { status: 'discarded', batch_size_g: 50, ingredient_cost: 3 })] }).overview;
        expect(o).toMatchObject({ discarded: 1, discardedCost: 3, discardedGrams: 50, batches: 4 });
    });
});

describe('ranges', () => {
    const batches = [batch('new', '2026-11-10'), batch('mid', '2026-09-20'), batch('old', '2025-01-05')];

    it.each([
        ['all', 3], ['year', 2], ['90d', 2], ['30d', 1],
    ] as const)('%s keeps %i batches', (range, n) => {
        expect(run({ batches }, { range }).overview.batches).toBe(n);
    });

    it('counts a batch on the first day of the range, and not the day before', () => {
        expect(run({ batches: [batch('x', '2026-10-19')] }, { range: '30d' }).overview.batches).toBe(1);
        expect(run({ batches: [batch('x', '2026-10-18')] }, { range: '30d' }).overview.batches).toBe(0);
    });

    it('only counts ingredients of the batches in range', () => {
        const lines = [line('new', 'a', 'A', 5), line('old', 'b', 'B', 9)];
        expect(run({ batches, lines }, { range: '30d' }).ingredientsByUse.map(i => i.name)).toEqual(['A']);
    });

    it('keeps the streak about all your batches, whatever the range', () => {
        expect(run({ batches: [batch('x', '2026-11-16')] }, { range: '30d' }).activity.streakWeeks).toBe(1);
        expect(run({ batches: [batch('x', '2026-11-16'), batch('y', '2026-01-01')] }, { range: '30d' }).activity.streakWeeks).toBe(1);
    });
});

describe('ingredients', () => {
    const batches = [batch('a', '2026-11-10'), batch('b', '2026-11-03'), batch('c', '2026-10-27')];
    const lines = [
        line('a', 'shea', 'Shea Butter', 10, 2), line('b', 'shea', 'Shea Butter', 12, 2.4), line('c', 'shea', 'Shea Butter', 8, 1.6),
        line('a', 'gly', 'Glycerin', 5, 0.1), line('b', 'gly', 'Glycerin', 5, 0.1),
        line('a', 'ext', 'Rose Extract', 1, 5),
        line('a', null, 'Mystery oil', 3), line('b', null, 'mystery OIL', 3),
    ];

    it('ranks by how many batches use it, then by grams', () => {
        const names = run({ batches, lines }).ingredientsByUse.map(i => [i.name, i.batches, i.grams]);
        expect(names).toEqual([['Shea Butter', 3, 30], ['Glycerin', 2, 10], ['Mystery oil', 2, 6], ['Rose Extract', 1, 1]]);
    });

    it('counts a batch once even if it uses the ingredient twice', () => {
        const twice = [line('a', 'oil', 'Oil', 5), line('a', 'oil', 'Oil', 5)];
        expect(run({ batches, lines: twice }).ingredientsByUse[0]).toMatchObject({ batches: 1, grams: 10 });
    });

    it('ranks by money spent, leaving out ingredients with no price', () => {
        expect(run({ batches, lines }).ingredientsBySpend.map(i => [i.name, i.cost])).toEqual([['Shea Butter', 6], ['Rose Extract', 5], ['Glycerin', 0.2]]);
    });

    it('ranks by grams, and shows at most ten', () => {
        const many = Array.from({ length: 15 }, (_, n) => line('a', `i${n}`, `Item ${String(n).padStart(2, '0')}`, n + 1));
        const g = run({ batches, lines: many }).ingredientsByGrams;
        expect(g).toHaveLength(10);
        expect(g[0].name).toBe('Item 14');
    });

    it('counts different ingredients', () => {
        expect(run({ batches, lines }).overview.distinctIngredients).toBe(4);
    });
});

describe('formulas', () => {
    it('ranks the formulas you make most, with the grams and the date of the last batch', () => {
        const batches = [
            batch('1', '2026-11-01', { formulation_id: 'f1', name: 'Lotion' }),
            batch('2', '2026-11-08', { formulation_id: 'f1', name: 'Lotion v2', batch_size_g: 50, ingredient_cost: 2 }),
            batch('3', '2026-10-01', { formulation_id: 'f2', name: 'Toner', status: 'discarded' }),
        ];
        const [first, second] = run({ batches }).formulasByBatches;
        expect(first).toMatchObject({ name: 'Lotion v2', batches: 2, grams: 150, cost: 2, lastMade: '2026-11-08', discarded: 0 });
        expect(second).toMatchObject({ name: 'Toner', discarded: 1 });
    });

    it('groups by name when the formula was deleted since', () => {
        const batches = [batch('1', '2026-11-01', { formulation_id: null, name: 'Old Balm' }), batch('2', '2026-11-02', { formulation_id: null, name: 'old balm' })];
        expect(run({ batches }).formulasByBatches).toHaveLength(1);
        expect(run({ batches }).overview.distinctFormulas).toBe(1);
    });

    it('lists formulas that were never made, and the average number of ingredients', () => {
        const formulas = [
            { id: 'f1', name: 'Lotion', created_at: null, ingredientCount: 8 },
            { id: 'f2', name: 'Zesty Toner', created_at: null, ingredientCount: 4 },
            { id: 'f3', name: 'Balm', created_at: null, ingredientCount: 3 },
        ];
        const m = run({ formulas, batches: [batch('1', '2026-11-01', { formulation_id: 'f1' })], sharedCount: 2 });
        expect(m.library).toMatchObject({ formulas: 3, avgIngredients: 5, shared: 2 });
        expect(m.library.neverMade.map(f => f.name)).toEqual(['Balm', 'Zesty Toner']);
    });

    it('treats a formula made only long ago as made, whatever the range', () => {
        const formulas = [{ id: 'f1', name: 'Lotion', created_at: null, ingredientCount: 5 }];
        expect(run({ formulas, batches: [batch('1', '2020-01-01', { formulation_id: 'f1' })] }, { range: '30d' }).library.neverMade).toEqual([]);
    });
});

describe('activity', () => {
    const batches = [batch('1', '2026-11-16'), batch('2', '2026-11-10'), batch('3', '2026-11-03'), batch('4', '2026-10-05'), batch('5', '2026-10-06')];

    it('counts batches per month, oldest first, ending with this month', () => {
        const { months, busiestMonth, avgPerActiveMonth } = run({ batches }).activity;
        expect(months.at(-1)).toMatchObject({ month: '2026-11', batches: 3 });
        expect(months.at(-2)).toMatchObject({ month: '2026-10', batches: 2 });
        expect(months[0].month).toBe('2025-12');
        expect(busiestMonth?.month).toBe('2026-11');
        expect(avgPerActiveMonth).toBe(2.5);
    });

    it('adds up grams and spend for each month', () => {
        const m = run({ batches: [batch('1', '2026-11-01', { batch_size_g: 120, ingredient_cost: 3 }), batch('2', '2026-11-02', { batch_size_g: 80, ingredient_cost: 1.5 })] });
        expect(m.activity.months.at(-1)).toMatchObject({ batches: 2, grams: 200, spend: 4.5 });
    });

    it('finds the busiest day of the week, Monday first', () => {
        const { weekdays, busiestWeekday } = run({ batches }).activity; // Mondays: 16 Nov, 5 Oct. Tuesdays: 10 Nov, 3 Nov, 6 Oct
        expect(weekdays).toEqual([2, 3, 0, 0, 0, 0, 0]);
        expect(busiestWeekday).toBe(1);
    });

    it('counts weeks in a row with a batch, starting from this week or the last one', () => {
        expect(run({ batches }).activity.streakWeeks).toBe(3); // weeks of 16 Nov, 9 Nov, 2 Nov
        expect(run({ batches: [batch('x', '2026-11-18'), batch('y', '2026-11-11'), batch('z', '2026-11-04')] }).activity.streakWeeks).toBe(3);
    });

    it('breaks the streak at a week with nothing', () => {
        expect(run({ batches: [batch('x', '2026-11-18'), batch('y', '2026-11-04')] }).activity.streakWeeks).toBe(1);
        expect(run({ batches: [batch('x', '2026-10-01')] }).activity.streakWeeks).toBe(0);
    });

    it('shows fewer months for a short range', () => {
        expect(run({ batches }, { range: '30d' }).activity.months).toHaveLength(2);
        expect(run({ batches }, { range: '90d' }).activity.months).toHaveLength(4);
    });
});

describe('containers', () => {
    it('groups batches by container, with how many were filled and what they cost, and puts "none" last', () => {
        const batches = [
            batch('1', '2026-11-01', { container_name: '30 ml dropper', container_volume_ml: 30, container_count: 3, container_unit_price: 0.4 }),
            batch('2', '2026-11-02', { container_name: '30 ml dropper', container_volume_ml: 30, container_count: 2.5, container_unit_price: 0.4 }),
            batch('3', '2026-11-03', { container_name: '50 ml jar', container_volume_ml: 50, container_count: 1 }),
            batch('4', '2026-11-04'),
            batch('5', '2026-11-05'),
            batch('6', '2026-11-06'),
        ];
        const c = run({ batches }).containers;
        expect(c.map(x => [x.name, x.batches, x.filled, x.spend])).toEqual([['30 ml dropper', 2, 5.5, 2.2], ['50 ml jar', 1, 1, 0], ['No container recorded', 3, 0, 0]]);
    });
});

describe('stability', () => {
    const checked = (result: 'good' | 'minor' | 'failed', observations: string[] = []) => ({ result, observations, checked_at: '2026-11-02T10:00:00Z' });

    it('counts check-ins, results, what went wrong most, and how many batches had trouble', () => {
        const batches = [
            batch('1', '2026-11-01', { checks: [checked('good'), checked('minor', ['separation']), { result: null, observations: [], checked_at: null }] }),
            batch('2', '2026-11-02', { checks: [checked('failed', ['separation', 'mold'])] }),
            batch('3', '2026-11-03', { checks: [checked('good')] }),
        ];
        const s = run({ batches }).stability;
        expect(s.checksDone).toBe(4);
        expect(s.results).toEqual({ good: 2, minor: 1, failed: 1 });
        expect(s.goodShare).toBe(0.5);
        expect(s.problems).toEqual([{ id: 'separation', count: 2 }, { id: 'mold', count: 1 }]);
        expect(s.batchesWithProblems).toBe(2);
    });
});

describe('yield', () => {
    it('averages the share of the batch that ended up in the pot, and what was lost', () => {
        const batches = [batch('1', '2026-11-01', { batch_size_g: 100, final_weight_g: 95 }), batch('2', '2026-11-02', { batch_size_g: 200, final_weight_g: 180 }), batch('3', '2026-11-03')];
        expect(run({ batches }).yieldStats).toEqual({ measured: 2, avgPercent: 92.5, lostG: 25 });
    });
});

describe('favourite ingredients', () => {
    const batches = [batch('1', '2026-11-01'), batch('2', '2026-11-02'), batch('3', '2026-11-03')];
    const lines = [line('1', 'shea', 'Shea', 10), line('2', 'shea', 'Shea', 10), line('3', 'jojoba', 'Jojoba', 5), line('1', 'jojoba', 'Jojoba', 5), line('1', 'gly', 'Glycerin', 3)];

    it('shows how often each favourite is used, the ones never used, and heavy use of ingredients that are not starred', () => {
        const f = run({ batches, lines, favorites: [{ id: 'shea', name: 'Shea' }, { id: 'rose', name: 'Rose Oil' }] }).favorites;
        expect(f.used.map(u => [u.name, u.batches])).toEqual([['Shea', 2]]);
        expect(f.neverUsed.map(n => n.name)).toEqual(['Rose Oil']);
        expect(f.notStarred.map(n => n.name)).toEqual(['Jojoba']); // used twice, glycerin only once
    });
});

describe('the stash', () => {
    const names = new Map([['shea', 'Shea Butter'], ['gly', 'Glycerin'], ['rose', 'Rose Oil'], ['dust', 'Old Powder']]);

    it('values it, finds what has expired or will soon, and what is low', () => {
        const lots = [
            lot('1', 'shea', 100, { price_per_g: 0.05, expiration_date: '2026-11-10' }),
            lot('2', 'gly', 10, { price_per_g: 0.01, expiration_date: '2026-12-10' }),
            lot('3', 'rose', 500, { price_per_g: 0.5, expiration_date: '2027-06-01' }),
            lot('4', 'dust', 0, { price_per_g: 1, expiration_date: '2020-01-01' }),
            lot('5', 'gly', null),
        ];
        const s = run({ lots, stashNames: names }).stash;
        expect(s).toMatchObject({ lots: 4, ingredients: 3, expired: 1, expiring: 1, unpricedLots: 1 });
        expect(s.value).toBeCloseTo(255.1, 5); // 5 + 0.1 + 250
        expect(s.low).toBe(0); // glycerin has 10 g counted but one lot is untracked
    });

    it('calls an ingredient low when what is left is at or under the level', () => {
        const lots = [lot('1', 'shea', 8), lot('2', 'shea', 12), lot('3', 'gly', 21)];
        expect(run({ lots, stashNames: names }).stash.low).toBe(1);
        expect(run({ lots, stashNames: names }, { lowStockG: 25 }).stash.low).toBe(2);
    });

    it('lists what is sitting idle: in the stash, never used in a batch, the dearest first', () => {
        const lots = [lot('1', 'shea', 100, { price_per_g: 0.05 }), lot('2', 'rose', 10, { price_per_g: 2 }), lot('3', 'dust', 50), lot('4', 'gly', 10, { price_per_g: 1 })];
        const batches = [batch('1', '2026-11-01')];
        const s = run({ lots, stashNames: names, batches, lines: [line('1', 'gly', 'Glycerin', 5)] }).stash;
        expect(s.idle.map(i => [i.name, i.value])).toEqual([['Rose Oil', 20], ['Shea Butter', 5], ['Old Powder', null]]);
        expect(s.idleValue).toBe(25);
    });

    it('counts an ingredient used long ago as used, whatever the range', () => {
        const lots = [lot('1', 'gly', 10, { price_per_g: 1 })];
        const s = run({ lots, stashNames: names, batches: [batch('1', '2020-01-01')], lines: [line('1', 'gly', 'Glycerin', 5)] }, { range: '30d' }).stash;
        expect(s.idle).toEqual([]);
    });

    it('does not count undone batches as using anything', () => {
        const lots = [lot('1', 'gly', 10, { price_per_g: 1 })];
        const s = run({ lots, stashNames: names, batches: [batch('1', '2026-11-01', { status: 'voided' })], lines: [line('1', 'gly', 'Glycerin', 5)] }).stash;
        expect(s.idle).toHaveLength(1);
    });
});
