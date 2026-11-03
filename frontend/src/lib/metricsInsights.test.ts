import { describe, expect, it, vi } from 'vitest';
import { computeMetrics, type MetricBatch, type MetricsInput } from './metrics';
import { buildInsights } from './metricsInsights';

vi.mock('./supabase', () => ({ supabase: {} }));

const TODAY = new Date(2026, 10, 18);
const batch = (id: string, made_on: string, over: Partial<MetricBatch> = {}): MetricBatch =>
    ({ id, formulation_id: 'f', name: 'Lotion', batch_size_g: 100, made_on, status: 'active', checks: [], ...over });
const empty: MetricsInput = { batches: [], lines: [], formulas: [], favorites: [], lots: [], stashNames: new Map(), sharedCount: 0 };
const insights = (input: Partial<MetricsInput>) =>
    buildInsights(computeMetrics({ ...empty, ...input }, { range: 'all', today: TODAY, warningDays: 30, lowStockG: 20 }));
const ids = (input: Partial<MetricsInput>) => insights(input).map(i => i.id);

describe('highlights', () => {
    it('say nothing when there is nothing to say', () => {
        expect(insights({})).toEqual([]);
    });

    it('mention a streak of two weeks or more, and a long gap otherwise', () => {
        expect(insights({ batches: [batch('a', '2026-11-16'), batch('b', '2026-11-09')] })[0]).toMatchObject({ id: 'streak', text: 'You have made something in 2 weeks in a row.' });
        expect(ids({ batches: [batch('a', '2026-08-01')] })).toContain('gap');
        expect(ids({ batches: [batch('a', '2026-11-10')] })).not.toContain('gap');
    });

    it('name the ingredient in most batches, once it is in at least two', () => {
        const batches = [batch('a', '2026-11-16'), batch('b', '2026-11-09'), batch('c', '2026-11-02')];
        const lines = [{ batch_id: 'a', ingredient_id: 's', name: 'Shea', actual_g: 5 }, { batch_id: 'b', ingredient_id: 's', name: 'Shea', actual_g: 5 }];
        expect(insights({ batches, lines }).find(i => i.id === 'top-ingredient')?.text).toBe('Shea goes into 2 of your 3 batches, more than anything else.');
        expect(ids({ batches, lines: lines.slice(0, 1) })).not.toContain('top-ingredient');
    });

    it('report how well check-ins went, and the problem noted most', () => {
        const done = (result: 'good' | 'minor', observations: string[] = []) => ({ result, observations, checked_at: '2026-11-02T00:00:00Z' });
        const batches = [batch('a', '2026-11-01', { checks: [done('good'), done('minor', ['separation']), done('minor', ['separation'])] })];
        const list = insights({ batches });
        expect(list.find(i => i.id === 'stability')).toMatchObject({ tone: 'warn', text: '33% of your stability check-ins say the batch looks good.' });
        expect(list.find(i => i.id === 'problem')?.text).toContain('Separation or oil on top');
    });

    it('count batches thrown away and what they cost', () => {
        const text = insights({ batches: [batch('a', '2026-11-01', { status: 'discarded', batch_size_g: 250, ingredient_cost: 4 })] }).find(i => i.id === 'waste')?.text;
        expect(text).toBe('1 batch had to be thrown away: 250 g and $4.00 of ingredients.');
    });

    it('point out favourites never used, expired stash, idle stash value, missing prices and formulas never made', () => {
        const input: Partial<MetricsInput> = {
            batches: [batch('a', '2026-11-01')],
            favorites: [{ id: 'rose', name: 'Rose Oil' }],
            lots: [{ id: 'l1', ingredient_id: 'x', amount_left_g: 10, expiration_date: '2020-01-01', price_per_g: 2 }],
            stashNames: new Map([['x', 'Old Thing']]),
            formulas: ['1', '2', '3'].map(n => ({ id: `n${n}`, name: n, created_at: null, ingredientCount: 3 })),
        };
        const list = insights(input);
        expect(list.map(i => i.id)).toEqual(expect.arrayContaining(['favorites', 'expired', 'idle', 'unpriced', 'never-made']));
        expect(list.find(i => i.id === 'idle')?.text).toBe('$20.00 of your stash has never been used in a batch.');
        expect(list.find(i => i.id === 'expired')?.text).toBe('1 lot in your stash has expired.');
    });

    it('show at most six', () => {
        const input: Partial<MetricsInput> = {
            batches: [batch('a', '2026-11-16', { status: 'discarded', ingredient_cost: 1 }), batch('b', '2026-11-09'), batch('c', '2026-11-02')],
            favorites: [{ id: 'rose', name: 'Rose' }],
            lots: [{ id: 'l1', ingredient_id: 'x', amount_left_g: 10, expiration_date: '2020-01-01', price_per_g: 2 }],
            formulas: ['1', '2', '3'].map(n => ({ id: `n${n}`, name: n, created_at: null, ingredientCount: 3 })),
        };
        expect(insights(input).length).toBeLessThanOrEqual(6);
    });
});
