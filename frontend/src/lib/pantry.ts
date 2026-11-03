import type { CloneLine } from './cloneRecipe';
import { isExpired, type StashLot } from './batchPlan';
import { analyzeFormula, parseFunction, type CatalogIngredient, type FormulaLine, type StashEntry, type SubstituteOption } from './substitutions';

// "What can I make?": how much of a recipe you could make from what you already own, counting a close stand-in from
// your own stash for what you are missing. Only your stash is ever searched for stand-ins, never the whole library.

export interface Recipe {
    id: string;
    source: 'own' | 'community';
    name: string;
    /** Who shared it, for community recipes. */
    author?: string | null;
    lines: FormulaLine[];
    targetPh?: number | null;
}

/** have: enough in stock. assumed: water. low: some, but not enough. missing: none. */
export type LineState = 'have' | 'assumed' | 'low' | 'missing';

export interface LineMatch {
    line: FormulaLine;
    state: LineState;
    neededG: number;
    /** What you have of it; null when it is not in the stash or the amount was never recorded. */
    haveG: number | null;
    /** The best stand-in from your stash, when the ingredient is missing or short. */
    swap: SubstituteOption | null;
    /** Other stand-ins from your stash, best first. */
    alternatives: SubstituteOption[];
    /** How much of this line you can cover as it is, 0 to 1. */
    exactCover: number;
    /** How much you can cover counting the stand-in, 0 to 1. */
    cover: number;
}

/**
 * ready: everything is in stock. ready-with-swaps: everything is, once stand-ins are used. partial: more than half is
 * covered. far: not close.
 */
export type MatchStatus = 'ready' | 'ready-with-swaps' | 'partial' | 'far';

export interface RecipeMatch {
    recipe: Recipe;
    lines: LineMatch[];
    /** The share of the formula (by weight) you could make as written, 0 to 1. */
    exact: number;
    /** The share you could make using stand-ins from your stash, 0 to 1. This is what recipes are ranked by. */
    readiness: number;
    status: MatchStatus;
    /** Ingredients in stock, including water. */
    haveCount: number;
    /** Ingredients covered by a stand-in. */
    swapCount: number;
    /** Ingredients with neither: they would have to be bought. */
    missing: LineMatch[];
    /** A missing preservative: not something to skip. */
    missingPreservative: boolean;
}

const MIN_QUALITY = 0.4;
const ALMOST = 0.75;

/** The stash as the matcher sees it: out-of-date lots and empty ones do not count. Untracked amounts get the benefit of the doubt. */
export function usableStash(lots: StashLot[], today: Date = new Date()): StashEntry[] {
    return lots
        .filter(lot => !isExpired(lot, today) && (lot.amount_left_g === null || lot.amount_left_g === undefined || lot.amount_left_g > 0))
        .map(lot => ({ ingredient_id: lot.ingredient_id, amount_left_g: lot.amount_left_g ?? null }));
}

const isWaterLine = (line: FormulaLine) => (line.ingredient.inci_name ?? '').toLowerCase().replace(/\[[^\]]*\]/g, '').trim().startsWith('aqua');

export function matchRecipe(recipe: Recipe, stash: StashEntry[], stashIngredients: CatalogIngredient[], batchG: number): RecipeMatch {
    const items = analyzeFormula(recipe.lines, stashIngredients, stash, batchG, recipe.targetPh ?? null);

    // Biggest gaps first, and an ingredient from the stash stands in for one thing only, within what is left of it
    const committed = new Map<string, number>();
    const taken = new Set<string>();
    const swaps = new Map<number, { swap: SubstituteOption; alternatives: SubstituteOption[] }>();
    items
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => item.status === 'missing' || item.status === 'low')
        .sort((a, b) => b.item.line.percentage - a.item.line.percentage)
        .forEach(({ item, index }) => {
            const pick = item.stashOptions.find(o =>
                !taken.has(o.ingredient.id) && (o.stashG === null || o.stashG - (committed.get(o.ingredient.id) ?? 0) >= o.neededG));
            if (!pick) return;
            taken.add(pick.ingredient.id);
            committed.set(pick.ingredient.id, (committed.get(pick.ingredient.id) ?? 0) + pick.neededG);
            swaps.set(index, { swap: pick, alternatives: item.stashOptions.filter(o => o !== pick).slice(0, 3) });
        });

    const lines: LineMatch[] = items.map((item, index) => {
        const state: LineState = item.status;
        const exactCover = state === 'have' || state === 'assumed' ? 1
            : state === 'low' && item.haveG !== null && item.neededG > 0 ? Math.min(item.haveG / item.neededG, 1) : 0;
        const found = swaps.get(index);
        const quality = found ? Math.max(found.swap.score / 100, MIN_QUALITY) : 0;
        return {
            line: item.line,
            state,
            neededG: item.neededG,
            haveG: item.haveG,
            swap: found?.swap ?? null,
            alternatives: found?.alternatives ?? [],
            exactCover,
            cover: Math.max(exactCover, quality),
        };
    });

    const total = lines.reduce((sum, l) => sum + l.line.percentage, 0);
    const weighted = (pick: (l: LineMatch) => number) => (total > 0 ? lines.reduce((sum, l) => sum + l.line.percentage * pick(l), 0) / total : 0);
    const exact = weighted(l => l.exactCover);
    const readiness = weighted(l => l.cover);

    const stocked = (l: LineMatch) => l.state === 'have' || l.state === 'assumed';
    const missing = lines.filter(l => !stocked(l) && !l.swap);
    const hasWater = lines.some(l => isWaterLine(l.line));
    const status: MatchStatus = lines.length > 0 && lines.every(stocked) ? 'ready'
        : lines.length > 0 && missing.length === 0 ? 'ready-with-swaps'
            : readiness >= 0.5 ? 'partial' : 'far';

    return {
        recipe,
        lines,
        exact,
        readiness,
        status,
        haveCount: lines.filter(stocked).length,
        swapCount: lines.filter(l => !stocked(l) && l.swap).length,
        missing,
        missingPreservative: hasWater && missing.some(l => parseFunction(l.line.ingredient.function).all.has('preservative')),
    };
}

/** Closest to ready first: by how much is covered with stand-ins, then as written, then by fewest to buy. */
export function rankMatches(matches: RecipeMatch[]): RecipeMatch[] {
    return [...matches].sort((a, b) =>
        b.readiness - a.readiness
        || b.exact - a.exact
        || a.missing.length - b.missing.length
        || a.recipe.name.localeCompare(b.recipe.name));
}

export type Closeness = 'ready' | 'almost' | 'all';

/** `ready`: nothing to buy. `almost`: at least three quarters covered. `all`: everything. */
export function filterByCloseness(matches: RecipeMatch[], closeness: Closeness): RecipeMatch[] {
    if (closeness === 'all') return matches;
    if (closeness === 'ready') return matches.filter(m => m.status === 'ready' || m.status === 'ready-with-swaps');
    return matches.filter(m => m.readiness >= ALMOST);
}

/** What is changed when you clone a recipe with the stand-ins applied: each swapped ingredient, at the amount suggested for it. */
export function swapsToApply(match: RecipeMatch): LineMatch[] {
    return match.lines.filter(l => l.state !== 'have' && l.state !== 'assumed' && l.swap);
}

/** The recipe's lines for cloning: as shared, or with every stand-in from your stash in place of what you are missing. */
export function cloneLines(match: RecipeMatch, withSwaps: boolean): CloneLine[] {
    return match.lines.map(l => {
        const swap = withSwaps && l.state !== 'have' && l.state !== 'assumed' ? l.swap : null;
        return { ingredient_id: swap ? swap.ingredient.id : l.line.ingredient.id, percentage: swap ? swap.percentage : l.line.percentage, phase: l.line.phase };
    });
}
