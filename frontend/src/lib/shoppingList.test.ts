import { describe, expect, it, vi } from 'vitest';
import type { StashLot } from './batchPlan';
import { buildShoppingList, formulaNeeds, type ListFormula } from './shoppingList';
import type { CatalogIngredient } from './substitutions';

vi.mock('./supabase', () => ({ supabase: {} }));

const ing = (id: string, inci_name: string, trade_name = id): CatalogIngredient =>
    ({ id, inci_name, trade_name, function: null, min_usage_pct: null, max_usage_pct: null });

const WATER = ing('water', 'Aqua');
const SHEA = ing('shea', 'Butyrospermum Parkii Butter', 'Shea Butter');
const GLY = ing('gly', 'Glycerin', 'Glycerin');
const PRES = ing('pres', 'Phenoxyethanol', 'Preservative');
const ALL = [WATER, SHEA, GLY, PRES];

const formula = (id: string, batchG: number, lines: [CatalogIngredient, number][]): ListFormula =>
    ({ id, name: id.toUpperCase(), batchG, lines: lines.map(([ingredient, percentage]) => ({ ingredient, percentage })) });
const lot = (id: string, ingredient_id: string, amount: number | null, expiration_date: string | null = null, extra: Partial<StashLot> = {}): StashLot =>
    ({ id, ingredient_id, amount_left_g: amount, expiration_date, ...extra });

const TODAY = new Date(2026, 10, 10);
const OPTS = { today: TODAY, warningDays: 30, lowStockG: 20 };
const build = (formulas: ListFormula[], lots: StashLot[], opts = OPTS) => buildShoppingList(formulas, lots, ALL, opts);
const item = (list: ReturnType<typeof build>, id: string) => list.items.find(i => i.ingredient.id === id)!;

describe('what a formula needs', () => {
    it('is the batch size times the percentage, never water, with repeated lines added up', () => {
        const needs = formulaNeeds(formula('a', 200, [[WATER, 70], [SHEA, 5], [SHEA, 2.5], [GLY, 0]]));
        expect([...needs.keys()]).toEqual(['shea']);
        expect(needs.get('shea')!.neededG).toBeCloseTo(15);
    });

    it('needs nothing for a batch of nothing', () => {
        expect(formulaNeeds(formula('a', 0, [[SHEA, 5]])).size).toBe(0);
    });
});

describe('the combined list', () => {
    it('adds up an ingredient across formulas, and shows what each one needs it for', () => {
        const list = build([formula('lotion', 100, [[SHEA, 10], [GLY, 3]]), formula('balm', 50, [[SHEA, 40]])], []);
        const shea = item(list, 'shea');
        expect(shea.needG).toBe(30);
        expect(shea.usages.map(u => [u.formulaName, u.neededG])).toEqual([['LOTION', 10], ['BALM', 20]]);
        expect(list.items).toHaveLength(2);
    });

    it('subtracts what you have, and buys only the rest', () => {
        const list = build([formula('a', 100, [[SHEA, 10]]), formula('b', 100, [[SHEA, 10]])], [lot('1', 'shea', 14)]);
        expect(item(list, 'shea')).toMatchObject({ needG: 20, haveG: 14, buyG: 6, leftG: 0 });
        expect(list.totalBuyG).toBe(6);
    });

    it('shares stock out in the order the formulas were chosen: covered, then partly, then missing', () => {
        const list = build([formula('a', 100, [[SHEA, 10]]), formula('b', 100, [[SHEA, 10]]), formula('c', 100, [[SHEA, 10]])], [lot('1', 'shea', 15)]);
        expect(item(list, 'shea').usages.map(u => [u.formulaName, u.state, u.coveredG])).toEqual([['A', 'covered', 10], ['B', 'partial', 5], ['C', 'missing', 0]]);
    });

    it('adds up several lots, and ignores expired and empty ones', () => {
        const list = build([formula('a', 100, [[SHEA, 30]])], [lot('1', 'shea', 10), lot('2', 'shea', 10), lot('3', 'shea', 50, '2026-11-09'), lot('4', 'shea', 0)]);
        expect(item(list, 'shea')).toMatchObject({ haveG: 20, buyG: 10 });
    });

    it('trusts a lot whose amount was never recorded to be enough', () => {
        const list = build([formula('a', 100, [[SHEA, 30]])], [lot('1', 'shea', null)]);
        expect(item(list, 'shea')).toMatchObject({ haveG: null, buyG: 0, leftG: null });
        expect(item(list, 'shea').usages[0].state).toBe('covered');
    });

    it('treats an expired-only stash as having none', () => {
        const list = build([formula('a', 100, [[SHEA, 10]])], [lot('1', 'shea', 100, '2026-01-01')]);
        expect(item(list, 'shea')).toMatchObject({ haveG: 0, buyG: 10 });
    });

    it('lists what has to be bought first, the most first, then what is in stock', () => {
        const list = build([formula('a', 100, [[SHEA, 10], [GLY, 5], [PRES, 1]])], [lot('1', 'gly', 100), lot('2', 'pres', 0.2)]);
        expect(list.items.map(i => [i.ingredient.id, i.buyG])).toEqual([['shea', 10], ['pres', 0.8], ['gly', 0]]);
    });

    it('is empty when no formula is chosen, but still has alerts', () => {
        const list = build([], [lot('1', 'shea', 5)]);
        expect(list.items).toEqual([]);
        expect(list.alerts).toHaveLength(1);
    });
});

describe('stash alerts', () => {
    it('flags lots that have expired and lots expiring within the warning window, soonest first', () => {
        const list = build([], [
            lot('1', 'shea', 100, '2026-11-09', { batch_lot_number: 'L1' }),
            lot('2', 'gly', 100, '2026-12-05'),
            lot('3', 'pres', 100, '2026-11-12'),
            lot('4', 'shea', 100, '2027-06-01'),
        ]);
        expect(list.alerts.map(a => [a.kind, a.name, a.daysLeft])).toEqual([['expired', 'Shea Butter', -1], ['expiring', 'Preservative', 2], ['expiring', 'Glycerin', 25]]);
        expect(list.alerts[0]).toMatchObject({ lot: 'L1', expiresOn: '2026-11-09' });
    });

    it('counts today as still good and the last day of the window as expiring', () => {
        const list = build([], [lot('1', 'shea', 100, '2026-11-10'), lot('2', 'gly', 100, '2026-12-10'), lot('3', 'pres', 100, '2026-12-11')]);
        expect(list.alerts.map(a => [a.name, a.kind])).toEqual([['Shea Butter', 'expiring'], ['Glycerin', 'expiring']]);
    });

    it('does not flag lots that are used up', () => {
        expect(build([], [lot('1', 'shea', 0, '2020-01-01')]).alerts).toEqual([]);
    });

    it('flags low stock across all lots of an ingredient, and not stock that is fine or empty or untracked', () => {
        const list = build([], [lot('1', 'shea', 8), lot('2', 'shea', 7), lot('3', 'gly', 500), lot('4', 'pres', 0), lot('5', 'water', null)]);
        expect(list.alerts).toEqual([expect.objectContaining({ kind: 'low', name: 'Shea Butter', amountG: 15 })]);
    });

    it('uses the low-stock level it is given', () => {
        expect(build([], [lot('1', 'gly', 50)], { ...OPTS, lowStockG: 60 }).alerts[0].kind).toBe('low');
        expect(build([], [lot('1', 'gly', 50)], { ...OPTS, lowStockG: 10 }).alerts).toEqual([]);
    });

    it('warns when making the chosen formulas would leave an ingredient nearly gone', () => {
        const list = build([formula('a', 100, [[SHEA, 40]])], [lot('1', 'shea', 55)]);
        expect(list.alerts).toEqual([expect.objectContaining({ kind: 'low-after', name: 'Shea Butter', amountG: 15, inList: true })]);
    });

    it('does not say it twice when stock is already low, and says nothing if it is used up exactly', () => {
        expect(build([formula('a', 100, [[SHEA, 5]])], [lot('1', 'shea', 10)]).alerts.map(a => a.kind)).toEqual(['low']);
        expect(build([formula('a', 100, [[SHEA, 40]])], [lot('1', 'shea', 40)]).alerts).toEqual([]);
    });

    it('marks which alerts concern the chosen formulas, and puts those first', () => {
        const list = build([formula('a', 100, [[GLY, 5]])], [lot('1', 'shea', 100, '2026-11-20'), lot('2', 'gly', 100, '2026-11-20')]);
        expect(list.alerts.map(a => [a.name, a.inList])).toEqual([['Glycerin', true], ['Shea Butter', false]]);
    });

    it('names an ingredient it knows nothing about', () => {
        expect(buildShoppingList([], [lot('1', 'ghost', 100, '2020-01-01')], [], OPTS).alerts[0].name).toBe('Unknown ingredient');
    });

    it('labels a lot by its number and supplier', () => {
        const [a, b] = build([], [lot('1', 'shea', 9, '2020-01-01', { batch_lot_number: 'X1', supplier_name: 'Acme' }), lot('2', 'gly', 9, '2020-01-01')]).alerts;
        expect([a.lot, b.lot].sort()).toEqual(['Unlabelled lot', 'X1 · Acme']);
    });
});
