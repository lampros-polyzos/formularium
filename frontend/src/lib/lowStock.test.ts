import { describe, expect, it } from 'vitest';
import type { StashLot } from './batchPlan';
import { lowStockLevel } from './lowStock';
import { computeMetrics } from './metrics';
import { buildShoppingList } from './shoppingList';
import type { CatalogIngredient } from './substitutions';


describe('the low-stock level of an ingredient', () => {
    it('is the setting for ingredients used at 10% or more', () => {
        expect(lowStockLevel(10, 20)).toBe(20);
        expect(lowStockLevel(100, 20)).toBe(20);
        expect(lowStockLevel(25, 20)).toBe(20);
    });

    it('is proportionally less for ingredients used in small amounts', () => {
        expect(lowStockLevel(5, 20)).toBe(10);
        expect(lowStockLevel(1, 20)).toBe(2);
        expect(lowStockLevel(0.5, 20)).toBe(1);
    });

    it('never drops below a twentieth of the setting, however tiny the dose', () => {
        expect(lowStockLevel(0.01, 20)).toBe(1);
    });

    it('uses the setting as it is when the usage is not known', () => {
        for (const unknown of [null, undefined, 0, -1, NaN]) expect(lowStockLevel(unknown, 20)).toBe(20);
    });

    it('follows the setting, including turning it off', () => {
        expect(lowStockLevel(1, 50)).toBe(5);
        expect(lowStockLevel(1, 0)).toBe(0);
    });
});

const ing = (id: string, trade_name: string, max_usage_pct: number | null): CatalogIngredient =>
    ({ id, inci_name: trade_name, trade_name, function: null, min_usage_pct: null, max_usage_pct });
const lot = (id: string, ingredient_id: string, amount: number): StashLot => ({ id, ingredient_id, amount_left_g: amount, expiration_date: null });

const LAVENDER = ing('lav', 'Lavender Essential Oil', 1);
const GLYCERIN = ing('gly', 'Glycerin', 10);
const SHEA = ing('shea', 'Shea Butter', 100);
const OPTS = { today: new Date(2026, 10, 18), warningDays: 30, lowStockG: 20 };

describe('on the shopping list', () => {
    const alertsFor = (lots: StashLot[]) => buildShoppingList([], lots, [LAVENDER, GLYCERIN, SHEA], OPTS).alerts.map(a => [a.name, a.kind]);

    it('does not call a good amount of essential oil low, but does call the same amount of shea low', () => {
        expect(alertsFor([lot('1', 'lav', 15), lot('2', 'shea', 15)])).toEqual([['Shea Butter', 'low']]);
    });

    it('calls essential oil low when it is nearly gone', () => {
        expect(alertsFor([lot('1', 'lav', 1.5)])).toEqual([['Lavender Essential Oil', 'low']]);
        expect(alertsFor([lot('1', 'lav', 2)])).toEqual([['Lavender Essential Oil', 'low']]);
        expect(alertsFor([lot('1', 'lav', 2.5)])).toEqual([]);
    });

    it('treats an ingredient used at 10% like the setting says', () => {
        expect(alertsFor([lot('1', 'gly', 20)])).toEqual([['Glycerin', 'low']]);
        expect(alertsFor([lot('1', 'gly', 21)])).toEqual([]);
    });

    it('adds up several lots before comparing', () => {
        expect(alertsFor([lot('1', 'lav', 1), lot('2', 'lav', 1.5)])).toEqual([]); // 2.5 g together
    });

    it('warns that an essential oil will run low only when the batches leave almost none', () => {
        const formula = { id: 'f', name: 'Serum', batchG: 100, lines: [{ ingredient: LAVENDER, percentage: 1 }] };
        const run = (grams: number) => buildShoppingList([formula], [lot('1', 'lav', grams)], [LAVENDER], OPTS).alerts.map(a => a.kind);
        expect(run(30)).toEqual([]); // 29 g would be left
        expect(run(2.5)).toEqual(['low-after']); // 1.5 g would be left
    });

    it('still uses the plain setting for an ingredient it knows nothing about', () => {
        expect(alertsFor([lot('1', 'ghost', 15)])).toEqual([['Unknown ingredient', 'low']]);
    });
});

describe('in the metrics', () => {
    const count = (lots: StashLot[], max: Map<string, number | null> | undefined) =>
        computeMetrics({ batches: [], lines: [], formulas: [], favorites: [], lots, stashNames: new Map(), stashMaxUsage: max, sharedCount: 0 }, { range: 'all', ...OPTS }).stash.low;

    it('counts small-dose ingredients as low only when they really are', () => {
        const max = new Map<string, number | null>([['lav', 1], ['shea', 100]]);
        expect(count([lot('1', 'lav', 15), lot('2', 'shea', 15)], max)).toBe(1);
        expect(count([lot('1', 'lav', 1.5), lot('2', 'shea', 15)], max)).toBe(2);
    });

    it('uses the plain setting when the usage is not known', () => {
        expect(count([lot('1', 'lav', 15)], undefined)).toBe(1);
        expect(count([lot('1', 'lav', 15)], new Map([['lav', null]]))).toBe(1);
    });
});
