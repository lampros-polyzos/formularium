import type { PlanLine, StashLot } from './batchPlan';

// What a batch costs. This mirrors the arithmetic in the database's create_batch function, so the preview you see
// before starting a batch is what gets recorded: grams taken from a stash lot cost that lot's price, and any other
// grams are costed with an estimate (the average price of that ingredient across your lots) and labelled as such.

/** A stash lot's price per gram, or null when none was entered. A price of 0 means "not entered". */
export const lotPrice = (lot: Pick<StashLot, 'price_per_g'> | undefined): number | null =>
    lot?.price_per_g && lot.price_per_g > 0 ? lot.price_per_g : null;

/** The average price per gram of an ingredient across the lots you hold, weighted by how much is left. */
export function estimatePricePerG(ingredientId: string | null, lots: StashLot[]): number | null {
    if (!ingredientId) return null;
    const priced = lots.filter(l => l.ingredient_id === ingredientId && lotPrice(l) !== null);
    if (priced.length === 0) return null;
    const weights = priced.map(l => Math.max(l.amount_left_g ?? 0, 0));
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    if (totalWeight <= 0) return priced.reduce((sum, l) => sum + lotPrice(l)!, 0) / priced.length;
    return priced.reduce((sum, l, i) => sum + lotPrice(l)! * weights[i], 0) / totalWeight;
}

export interface LineCost {
    /** Null when no price is known for any of it. */
    cost: number | null;
    /** Some of the cost is a guess, or part of it has no price so the figure is too low. */
    estimated: boolean;
    /** The estimate used for grams that are not taken from the stash, sent along when the batch is started. */
    estimatePerG: number | null;
}

const TOLERANCE = 0.0001;

export function lineCost(line: PlanLine, lots: StashLot[]): LineCost {
    const estimatePerG = estimatePricePerG(line.row.ingredient_id, lots);
    const allocations = line.takeFromStash ? line.allocation.allocations : [];
    let real = 0, allocated = 0, unknown = 0, hasPrice = false;
    for (const a of allocations) {
        const price = lotPrice(lots.find(l => l.id === a.stash_id));
        allocated += a.grams;
        if (price !== null) { real += a.grams * price; hasPrice = true; } else unknown += a.grams;
    }
    const rest = Math.max(line.amountG - allocated, 0) + unknown;

    if (rest > TOLERANCE && estimatePerG !== null) return { cost: real + rest * estimatePerG, estimated: true, estimatePerG };
    if (hasPrice) return { cost: real, estimated: rest > TOLERANCE, estimatePerG };
    return { cost: null, estimated: false, estimatePerG };
}

export interface BatchCost {
    lines: LineCost[];
    /** Null when nothing could be priced. */
    total: number | null;
    /** Ingredients with no price at all. */
    unpriced: number;
    /** True when any part of the total is a guess. */
    estimated: boolean;
    /** Per 100 g of product; null when there is no total. */
    per100g: number | null;
}

export function planCost(plan: PlanLine[], lots: StashLot[], batchSizeG: number): BatchCost {
    const lines = plan.map(line => lineCost(line, lots));
    const priced = lines.filter(l => l.cost !== null);
    const total = priced.length > 0 ? round4(priced.reduce((sum, l) => sum + l.cost!, 0)) : null;
    return {
        lines,
        total,
        unpriced: lines.length - priced.length,
        estimated: lines.some(l => l.estimated),
        per100g: total !== null && batchSizeG > 0 ? (total / batchSizeG) * 100 : null,
    };
}

const round4 = (v: number) => Math.round((v + Number.EPSILON) * 10_000) / 10_000;

/** "$1.23", or "$0.0123" for tiny amounts, so a cheap preservative doesn't show as nothing. */
export function formatMoney(value: number, currency = '$'): string {
    const digits = Math.abs(value) < 0.1 && value !== 0 ? 3 : 2;
    return `${currency}${value.toFixed(digits)}`;
}

export interface UnitCost {
    /** Ingredients for one container's worth. */
    ingredients: number;
    containerPrice: number;
    total: number;
}

/** Cost of one filled container: its share of the batch plus the container itself. */
export function costPerContainer(ingredientTotal: number | null, containersFilled: number, unitPrice: number): UnitCost | null {
    if (ingredientTotal === null || containersFilled <= 0) return null;
    const ingredients = ingredientTotal / containersFilled;
    return { ingredients, containerPrice: unitPrice, total: ingredients + unitPrice };
}
