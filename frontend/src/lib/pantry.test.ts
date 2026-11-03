import { describe, expect, it } from 'vitest';
import type { StashLot } from './batchPlan';
import { cloneLines, filterByCloseness, matchRecipe, rankMatches, swapsToApply, usableStash, type Recipe } from './pantry';
import type { CatalogIngredient, FormulaLine } from './substitutions';

const ing = (id: string, inci_name: string, trade_name: string, fn: string, solubility: string, extra: Partial<CatalogIngredient> = {}): CatalogIngredient =>
    ({ id, inci_name, trade_name, function: fn, solubility, min_usage_pct: 0.1, max_usage_pct: 100, ...extra });

const WATER = ing('water', 'Aqua', 'Distilled Water', 'Solvent', 'water');
const GLYCERIN = ing('gly', 'Glycerin', 'Glycerin', 'Humectant', 'water');
const PROPANEDIOL = ing('pd', 'Propanediol', 'Zemea', 'Humectant / Solvent', 'water');
const ALMOND = ing('almond', 'Prunus Amygdalus Dulcis Oil', 'Sweet Almond Oil', 'Carrier Oil (Emollient)', 'oil');
const JOJOBA = ing('jojoba', 'Simmondsia Chinensis Seed Oil', 'Jojoba Oil', 'Carrier Oil', 'oil');
const APRICOT = ing('apricot', 'Prunus Armeniaca Kernel Oil', 'Apricot Oil', 'Carrier Oil', 'oil');
const SHEA = ing('shea', 'Butyrospermum Parkii Butter', 'Shea Butter', 'Butter (Emollient)', 'oil');
const OLIVEM = ing('olivem', 'Cetearyl Olivate (and) Sorbitan Olivate', 'Olivem 1000', 'Emulsifier', 'oil');
const PE9010 = ing('pe', 'Phenoxyethanol (and) Ethylhexylglycerin', 'Euxyl PE 9010', 'Preservative', 'water', { max_usage_pct: 1.1 });
const K712 = ing('k712', 'Sodium Benzoate (and) Potassium Sorbate', 'Euxyl K712', 'Preservative', 'water', { max_usage_pct: 1.5 });
const BISABOLOL = ing('bisabolol', 'Bisabolol', 'Alpha-Bisabolol', 'Active (Soothing / Anti-inflammatory)', 'oil');
const ALLANTOIN = ing('allantoin', 'Allantoin', 'Allantoin', 'Active (Soothing)', 'water');

const line = (ingredient: CatalogIngredient, percentage: number, phase: 'A' | 'B' | 'C' = 'A'): FormulaLine => ({ ingredient, phase, percentage });
const recipe = (name: string, lines: FormulaLine[], over: Partial<Recipe> = {}): Recipe => ({ id: name, source: 'own', name, lines, ...over });

const TODAY = new Date(2026, 10, 8);
const lot = (id: string, ingredient_id: string, grams: number | null, expiration_date: string | null = null): StashLot =>
    ({ id, ingredient_id, amount_left_g: grams, expiration_date });

/** Runs the matcher the way the app does: from the lots, with the stash's own ingredients as the only stand-ins. */
const match = (r: Recipe, lots: StashLot[], owned: CatalogIngredient[], batchG = 100) =>
    matchRecipe(r, usableStash(lots, TODAY), owned, batchG);

describe('what counts as being in the stash', () => {
    it('leaves out lots that have expired, and ones that are used up', () => {
        const entries = usableStash([
            lot('a', 'gly', 50, '2026-11-01'),   // expired a week ago
            lot('b', 'gly', 0),                  // empty
            lot('c', 'gly', 20, '2027-01-01'),   // fine
            lot('d', 'gly', 10),                 // no expiry
        ], TODAY);
        expect(entries).toEqual([{ ingredient_id: 'gly', amount_left_g: 20 }, { ingredient_id: 'gly', amount_left_g: 10 }]);
    });

    it('counts a lot whose amount was never recorded, with the benefit of the doubt', () => {
        expect(usableStash([lot('a', 'gly', null)], TODAY)).toEqual([{ ingredient_id: 'gly', amount_left_g: null }]);
    });

    it('counts a lot that expires today as still usable', () => {
        expect(usableStash([lot('a', 'gly', 5, '2026-11-08')], TODAY)).toHaveLength(1);
    });
});

describe('matching a recipe with what you have', () => {
    const lotion = recipe('Lotion', [line(WATER, 70), line(GLYCERIN, 5), line(JOJOBA, 15, 'B'), line(OLIVEM, 4, 'B'), line(PE9010, 1, 'C')]);

    it('is ready when everything is in stock, and water needs no stock at all', () => {
        const m = match(lotion, [lot('1', 'gly', 50), lot('2', 'jojoba', 100), lot('3', 'olivem', 20), lot('4', 'pe', 30)], [GLYCERIN, JOJOBA, OLIVEM, PE9010]);
        expect(m.status).toBe('ready');
        expect(m.exact).toBe(1);
        expect(m.readiness).toBe(1);
        expect(m.haveCount).toBe(5);
        expect(m.missing).toEqual([]);
        expect(m.lines.find(l => l.line.ingredient.id === 'water')!.state).toBe('assumed');
    });

    it('scores a recipe by how much of it, by weight, you can make', () => {
        // Missing the 15% oil and the 1% preservative: water, glycerin and the emulsifier are 79 of the 95 parts
        const m = match(lotion, [lot('1', 'gly', 50), lot('3', 'olivem', 20)], [GLYCERIN, OLIVEM]);
        expect(m.exact).toBeCloseTo(79 / 95, 6);
        expect(m.missing.map(l => l.line.ingredient.id)).toEqual(['jojoba', 'pe']);
        expect(m.status).toBe('partial');
        expect(m.haveCount).toBe(3);
    });

    it('weighs a big missing ingredient more than a small one', () => {
        const missingOil = match(lotion, [lot('1', 'gly', 50), lot('3', 'olivem', 20), lot('4', 'pe', 30)], [GLYCERIN, OLIVEM, PE9010]);
        const missingPreservative = match(lotion, [lot('1', 'gly', 50), lot('2', 'jojoba', 100), lot('3', 'olivem', 20)], [GLYCERIN, JOJOBA, OLIVEM]);
        expect(missingPreservative.readiness).toBeGreaterThan(missingOil.readiness);
    });

    it('counts an ingredient you have only some of as partly covered', () => {
        // 5% glycerin of a 100 g batch needs 5 g: with 2 g you have 40% of it
        const m = match(recipe('R', [line(WATER, 90), line(GLYCERIN, 5)]), [lot('1', 'gly', 2)], [GLYCERIN]);
        const gly = m.lines.find(l => l.line.ingredient.id === 'gly')!;
        expect(gly.state).toBe('low');
        expect(gly.haveG).toBe(2);
        expect(gly.exactCover).toBeCloseTo(0.4, 6);
        expect(m.missing.map(l => l.line.ingredient.id)).toEqual(['gly']); // still something to buy
    });

    it('adds up several lots of the same ingredient', () => {
        const m = match(recipe('R', [line(WATER, 90), line(GLYCERIN, 5)]), [lot('1', 'gly', 3), lot('2', 'gly', 3)], [GLYCERIN]);
        expect(m.lines[1].state).toBe('have');
    });

    it('needs more of it for a bigger batch', () => {
        const r = recipe('R', [line(WATER, 90), line(GLYCERIN, 10)]);
        const lots = [lot('1', 'gly', 8)];
        expect(match(r, lots, [GLYCERIN], 50).lines[1].state).toBe('have');   // 5 g needed
        expect(match(r, lots, [GLYCERIN], 100).lines[1].state).toBe('low');  // 10 g needed
        expect(match(r, lots, [GLYCERIN], 400).lines[1].neededG).toBe(40);
    });

    it('does not count an ingredient whose only lot has expired', () => {
        const m = match(recipe('R', [line(WATER, 90), line(GLYCERIN, 10)]), [lot('1', 'gly', 50, '2026-10-01')], [GLYCERIN]);
        expect(m.lines[1].state).toBe('missing');
    });

    it('treats an amount nobody wrote down as enough', () => {
        const m = match(recipe('R', [line(WATER, 90), line(GLYCERIN, 10)]), [lot('1', 'gly', null)], [GLYCERIN]);
        expect(m.lines[1].state).toBe('have');
        expect(m.status).toBe('ready');
    });

    it('copes with an empty recipe', () => {
        const m = match(recipe('Empty', []), [], []);
        expect(m).toMatchObject({ readiness: 0, exact: 0, status: 'far', haveCount: 0 });
    });
});

describe('stand-ins from your own stash', () => {
    const oilCream = recipe('Oil cream', [line(WATER, 80), line(ALMOND, 15, 'B'), line(OLIVEM, 4, 'B'), line(GLYCERIN, 1)]);
    const owned = [JOJOBA, OLIVEM, GLYCERIN];
    const baseLots = [lot('1', 'olivem', 20), lot('2', 'gly', 20)];

    it('offers something you own in place of what is missing, and counts it', () => {
        const m = match(oilCream, [...baseLots, lot('3', 'jojoba', 60)], owned);
        const almond = m.lines.find(l => l.line.ingredient.id === 'almond')!;
        expect(almond.state).toBe('missing');
        expect(almond.swap?.ingredient.id).toBe('jojoba');
        expect(almond.swap!.inStash).toBe(true);
        expect(almond.exactCover).toBe(0);
        expect(almond.cover).toBeCloseTo(almond.swap!.score / 100, 6);
        expect(m.swapCount).toBe(1);
        expect(m.missing).toEqual([]);
        expect(m.status).toBe('ready-with-swaps');
        expect(m.readiness).toBeGreaterThan(m.exact);
        expect(m.readiness).toBeLessThan(1); // a stand-in is not the real thing
    });

    it('ranks the same recipe lower when the stand-in is a weaker match', () => {
        const strong = match(oilCream, [...baseLots, lot('3', 'jojoba', 60)], owned);
        const weakOwned = [BISABOLOL, OLIVEM, GLYCERIN];
        const weak = match(oilCream, [...baseLots, lot('3', 'bisabolol', 60)], weakOwned);
        expect(weak.lines.find(l => l.line.ingredient.id === 'almond')!.swap).toBeNull(); // an active is not an oil
        expect(strong.readiness).toBeGreaterThan(weak.readiness);
    });

    it('does not offer a stand-in you do not have enough of', () => {
        const m = match(oilCream, [...baseLots, lot('3', 'jojoba', 5)], owned); // 15 g needed
        expect(m.lines.find(l => l.line.ingredient.id === 'almond')!.swap).toBeNull();
        expect(m.missing.map(l => l.line.ingredient.id)).toEqual(['almond']);
        expect(m.status).not.toBe('ready-with-swaps');
    });

    it('does not offer a stand-in whose lots have all expired', () => {
        const m = match(oilCream, [...baseLots, lot('3', 'jojoba', 60, '2026-01-01')], owned);
        expect(m.lines.find(l => l.line.ingredient.id === 'almond')!.swap).toBeNull();
    });

    it('accepts a stand-in whose amount was never recorded', () => {
        const m = match(oilCream, [...baseLots, lot('3', 'jojoba', null)], owned);
        expect(m.lines.find(l => l.line.ingredient.id === 'almond')!.swap?.ingredient.id).toBe('jojoba');
    });

    it('never offers an ingredient the recipe already uses', () => {
        const both = recipe('Two oils', [line(WATER, 70), line(JOJOBA, 10, 'B'), line(ALMOND, 10, 'B'), line(OLIVEM, 4, 'B')]);
        const m = match(both, [lot('1', 'jojoba', 100), lot('2', 'olivem', 20)], [JOJOBA, OLIVEM]);
        expect(m.lines.find(l => l.line.ingredient.id === 'almond')!.swap).toBeNull();
    });

    it('lets one ingredient stand in for one thing only', () => {
        const twoGaps = recipe('Two gaps', [line(WATER, 60), line(ALMOND, 20, 'B'), line(SHEA, 15, 'B'), line(OLIVEM, 4, 'B')]);
        const m = match(twoGaps, [lot('1', 'jojoba', 100), lot('2', 'olivem', 20)], [JOJOBA, OLIVEM]);
        const swapped = m.lines.filter(l => l.swap);
        expect(swapped).toHaveLength(1);
        expect(swapped[0].line.ingredient.id).toBe('almond'); // the bigger gap gets it
        expect(m.missing.map(l => l.line.ingredient.id)).toEqual(['shea']);
    });

    it('does not promise more of a stand-in than is left after the first use', () => {
        // 30 g of jojoba: 20 g go to the first gap, so the second (also 20 g) cannot have it
        const twoGaps = recipe('Two gaps', [line(WATER, 60), line(ALMOND, 20, 'B'), line(APRICOT, 20, 'B')]);
        const m = match(twoGaps, [lot('1', 'jojoba', 30)], [JOJOBA]);
        expect(m.lines.filter(l => l.swap)).toHaveLength(1);
    });

    it('offers other stand-ins too, best first', () => {
        const oils = [JOJOBA, APRICOT, OLIVEM];
        const m = match(oilCream, [lot('1', 'jojoba', 60), lot('2', 'apricot', 60), lot('3', 'olivem', 20), lot('4', 'gly', 20)], oils);
        const almond = m.lines.find(l => l.line.ingredient.id === 'almond')!;
        expect(almond.swap).not.toBeNull();
        expect(almond.alternatives.length).toBeGreaterThan(0);
        expect(almond.alternatives.every(a => a.score <= almond.swap!.score)).toBe(true);
        expect(almond.alternatives.map(a => a.ingredient.id)).not.toContain(almond.swap!.ingredient.id);
    });

    it('offers a stand-in for something you only have a little of, and keeps its quality in the score', () => {
        const r = recipe('R', [line(WATER, 80), line(PROPANEDIOL, 10), line(GLYCERIN, 10)]);
        const m = match(r, [lot('1', 'pd', 2), lot('2', 'gly', 50)], [PROPANEDIOL, GLYCERIN]);
        const propanediol = m.lines.find(l => l.line.ingredient.id === 'pd')!;
        expect(propanediol.state).toBe('low');
        expect(propanediol.swap).toBeNull(); // glycerin is already in the recipe, so cannot stand in
        expect(propanediol.cover).toBeCloseTo(0.2, 6); // just what you have: 2 of 10 g
    });
});

describe('a missing preservative', () => {
    const cream = recipe('Cream', [line(WATER, 90), line(GLYCERIN, 9), line(PE9010, 1, 'C')]);

    it('is flagged, because it is the one thing not to skip', () => {
        const m = match(cream, [lot('1', 'gly', 50)], [GLYCERIN]);
        expect(m.missingPreservative).toBe(true);
    });

    it('is not flagged when it is in stock', () => {
        const m = match(cream, [lot('1', 'gly', 50), lot('2', 'pe', 10)], [GLYCERIN, PE9010]);
        expect(m.missingPreservative).toBe(false);
    });

    it('is not flagged when another preservative you own can stand in', () => {
        const m = match(cream, [lot('1', 'gly', 50), lot('2', 'k712', 10)], [GLYCERIN, K712]);
        expect(m.lines.find(l => l.line.ingredient.id === 'pe')!.swap?.ingredient.id).toBe('k712');
        expect(m.missingPreservative).toBe(false);
    });

    it('is not flagged for a recipe without water, which needs none', () => {
        const butter = recipe('Butter', [line(SHEA, 95, 'B'), line(PE9010, 1, 'C')]);
        expect(match(butter, [lot('1', 'shea', 200)], [SHEA]).missingPreservative).toBe(false);
    });

    it('is not mistaken for a preservative booster', () => {
        const booster = ing('boost', 'Caprylyl Glycol', 'Lexgard O', 'Preservative Booster', 'water');
        const r = recipe('R', [line(WATER, 90), line(booster, 1)]);
        expect(match(r, [], []).missingPreservative).toBe(false);
    });
});

describe('ranking and filtering', () => {
    const owned = [GLYCERIN, JOJOBA, OLIVEM, PE9010];
    const lots = [lot('1', 'gly', 50), lot('2', 'jojoba', 100), lot('3', 'olivem', 20), lot('4', 'pe', 30)];
    const mk = (name: string, lines: FormulaLine[]) => match(recipe(name, lines), lots, owned);

    const ready = mk('Ready cream', [line(WATER, 70), line(GLYCERIN, 5), line(JOJOBA, 15, 'B'), line(OLIVEM, 4, 'B'), line(PE9010, 1, 'C')]);
    const nearly = mk('Nearly cream', [line(WATER, 70), line(GLYCERIN, 5), line(JOJOBA, 15, 'B'), line(SHEA, 4, 'B'), line(PE9010, 1, 'C')]);
    const far = mk('Far away', [line(WATER, 10), line(SHEA, 40, 'B'), line(ALMOND, 40, 'B'), line(ing('x', 'Xanthan Gum', 'Xanthan', 'Rheology Modifier', 'water'), 10)]);

    it('puts what is closest to ready first', () => {
        expect(rankMatches([far, nearly, ready]).map(m => m.recipe.name)).toEqual(['Ready cream', 'Nearly cream', 'Far away']);
    });

    it('breaks ties as written, then by what is left to buy, then by name', () => {
        const a = { ...ready, recipe: { ...ready.recipe, name: 'B recipe' } };
        const b = { ...ready, recipe: { ...ready.recipe, name: 'A recipe' } };
        expect(rankMatches([a, b]).map(m => m.recipe.name)).toEqual(['A recipe', 'B recipe']);
        const asWritten = { ...ready, readiness: 0.9, exact: 0.9, recipe: { ...ready.recipe, name: 'Z' } };
        const withSwaps = { ...ready, readiness: 0.9, exact: 0.5, recipe: { ...ready.recipe, name: 'A' } };
        expect(rankMatches([withSwaps, asWritten]).map(m => m.recipe.name)).toEqual(['Z', 'A']);
    });

    it('does not change the list it is given', () => {
        const input = [far, ready];
        rankMatches(input);
        expect(input.map(m => m.recipe.name)).toEqual(['Far away', 'Ready cream']);
    });

    it('filters to what needs nothing bought, what is almost there, or everything', () => {
        const all = [ready, nearly, far];
        expect(filterByCloseness(all, 'ready').map(m => m.recipe.name)).toEqual(['Ready cream']);
        expect(filterByCloseness(all, 'almost').map(m => m.recipe.name)).toEqual(['Ready cream', 'Nearly cream']);
        expect(filterByCloseness(all, 'all')).toHaveLength(3);
    });

    it('counts a recipe that is ready once stand-ins are used as "ready"', () => {
        const oilCream = recipe('Oil cream', [line(WATER, 80), line(ALMOND, 15, 'B'), line(OLIVEM, 4, 'B'), line(GLYCERIN, 1)]);
        const m = match(oilCream, [lot('1', 'olivem', 20), lot('2', 'gly', 20), lot('3', 'jojoba', 60)], [JOJOBA, OLIVEM, GLYCERIN]);
        expect(m.status).toBe('ready-with-swaps');
        expect(filterByCloseness([m], 'ready')).toHaveLength(1);
    });
});

describe('actives swap only with the same kind of active', () => {
    it('offers allantoin for another soothing active, but not for an unrelated one', () => {
        const panthenol = ing('panthenol', 'Panthenol', 'Provitamin B5', 'Active (Soothing / Hydrating)', 'water');
        const soothing = recipe('Calm', [line(WATER, 90), line(panthenol, 3, 'C')]);
        const m = match(soothing, [lot('1', 'allantoin', 10)], [ALLANTOIN]);
        expect(m.lines[1].swap?.ingredient.id).toBe('allantoin');

        const brightening = ing('niacin', 'Niacinamide', 'Vitamin B3', 'Active (Brightening)', 'water');
        const other = recipe('Bright', [line(WATER, 90), line(brightening, 3)]);
        expect(match(other, [lot('1', 'allantoin', 10)], [ALLANTOIN]).lines[1].swap).toBeNull();
    });

    it('will not swap an oil-soluble active for a water-soluble one: they do different jobs in a formula', () => {
        const soothing = recipe('Calm', [line(WATER, 90), line(BISABOLOL, 1, 'C')]);
        expect(match(soothing, [lot('1', 'allantoin', 10)], [ALLANTOIN]).lines[1].swap).toBeNull();
    });
});

describe('cloning with the stand-ins applied', () => {
    // Almond oil is missing, jojoba is in stock as a stand-in; everything else is as written
    const lotion = recipe('Lotion', [line(WATER, 80), line(ALMOND, 15, 'B'), line(GLYCERIN, 5)]);
    const m = match(lotion, [lot('1', 'jojoba', 500), lot('2', 'gly', 500)], [JOJOBA, GLYCERIN]);

    it('lists what would change', () => {
        expect(swapsToApply(m).map(l => l.line.ingredient.id)).toEqual(['almond']);
    });

    it('as shared, changes nothing', () => {
        expect(cloneLines(m, false)).toEqual([
            { ingredient_id: 'water', percentage: 80, phase: 'A' },
            { ingredient_id: 'almond', percentage: 15, phase: 'B' },
            { ingredient_id: 'gly', percentage: 5, phase: 'A' },
        ]);
    });

    it('with swaps, replaces only the missing ingredient, in its own phase, at the suggested amount', () => {
        const lines = cloneLines(m, true);
        expect(lines.map(l => l.ingredient_id)).toEqual(['water', 'jojoba', 'gly']);
        expect(lines[1]).toEqual({ ingredient_id: 'jojoba', percentage: m.lines[1].swap!.percentage, phase: 'B' });
        expect(lines[0]).toEqual({ ingredient_id: 'water', percentage: 80, phase: 'A' });
    });

    it('has nothing to apply when everything is in stock', () => {
        const full = match(lotion, [lot('1', 'almond', 500), lot('2', 'gly', 500)], [ALMOND, GLYCERIN]);
        expect(swapsToApply(full)).toEqual([]);
        expect(cloneLines(full, true)).toEqual(cloneLines(full, false));
    });
});
