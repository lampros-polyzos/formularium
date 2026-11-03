import { isExpired, type StashLot } from './batchPlan';
import { lowStockLevel } from './lowStock';
import { isWaterIngredient } from './pantry';
import type { CatalogIngredient } from './substitutions';

// One shopping list across several formulas: what each ingredient is needed for, what you have, what to buy, plus
// stash alerts (expired, expiring soon, running low).

export interface ListFormula {
    id: string;
    name: string;
    /** How much of it is being made, in grams. */
    batchG: number;
    lines: { ingredient: CatalogIngredient; percentage: number }[];
}

/** covered: your stock does it. partial: some of it. missing: none. */
export type CoverState = 'covered' | 'partial' | 'missing';

export interface Usage {
    formulaId: string;
    formulaName: string;
    neededG: number;
    /** How much of the need your stock covers. Stock is shared out in the order the formulas were chosen. */
    coveredG: number;
    state: CoverState;
}

export interface ShoppingItem {
    ingredient: CatalogIngredient;
    needG: number;
    /** In-date stock. Null when a lot is in the stash but its amount was never recorded: it is trusted to be enough. */
    haveG: number | null;
    buyG: number;
    /** What would be left in stock after making everything, when the amount is known. */
    leftG: number | null;
    usages: Usage[];
}

export type AlertKind = 'expired' | 'expiring' | 'low' | 'low-after';

export interface StashAlert {
    kind: AlertKind;
    ingredientId: string;
    name: string;
    /** Which lot, for expiry alerts. */
    lot?: string;
    /** The date, for expiry alerts. */
    expiresOn?: string | null;
    daysLeft?: number;
    amountG: number | null;
    /** One of the chosen formulas uses it. */
    inList: boolean;
}

export interface ShoppingList {
    items: ShoppingItem[];
    alerts: StashAlert[];
    /** Grams to buy across everything. */
    totalBuyG: number;
}

export interface ListOptions {
    today?: Date;
    /** Lots expiring within this many days are flagged. */
    warningDays: number;
    /** Stock at or below this many grams is flagged as low, for an ingredient used at 10% or more. Ingredients used in
     *  small amounts (essential oils, preservatives) get proportionally less, see `lowStockLevel`. */
    lowStockG: number;
}

const EPS = 1e-9;
const round2 = (n: number) => Math.round(n * 100) / 100;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const parseDay = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
const nameOf = (i: CatalogIngredient | undefined) => (i ? i.trade_name || i.inci_name : 'Unknown ingredient');

function lotName(lot: StashLot): string {
    return [lot.batch_lot_number, lot.supplier_name].filter(Boolean).join(' · ') || 'Unlabelled lot';
}

/** The grams of each ingredient a formula needs for its batch. Water is left out, and repeated lines are added up. */
export function formulaNeeds(formula: ListFormula): Map<string, { ingredient: CatalogIngredient; neededG: number }> {
    const needs = new Map<string, { ingredient: CatalogIngredient; neededG: number }>();
    for (const { ingredient, percentage } of formula.lines) {
        if (isWaterIngredient(ingredient) || !(percentage > 0) || !(formula.batchG > 0)) continue;
        const grams = (percentage / 100) * formula.batchG;
        const known = needs.get(ingredient.id);
        if (known) known.neededG += grams;
        else needs.set(ingredient.id, { ingredient, neededG: grams });
    }
    return needs;
}

export function buildShoppingList(
    formulas: ListFormula[],
    lots: StashLot[],
    /** Library rows for what is in the stash, to name it in alerts. */
    stashIngredients: CatalogIngredient[],
    { today = new Date(), warningDays, lowStockG }: ListOptions,
): ShoppingList {
    const day = startOfDay(today);
    const names = new Map(stashIngredients.map(i => [i.id, i]));

    // Stock that can be used: in date, not empty
    const usable = lots.filter(l => !isExpired(l, day) && (l.amount_left_g === null || l.amount_left_g === undefined || l.amount_left_g > 0));
    const stock = new Map<string, { grams: number; unknown: boolean }>();
    for (const lot of usable) {
        const s = stock.get(lot.ingredient_id) ?? { grams: 0, unknown: false };
        if (lot.amount_left_g === null || lot.amount_left_g === undefined) s.unknown = true;
        else s.grams += Number(lot.amount_left_g);
        stock.set(lot.ingredient_id, s);
    }

    // What each chosen formula needs, by ingredient, in the order the formulas were chosen
    const wanted = new Map<string, { ingredient: CatalogIngredient; uses: { formula: ListFormula; neededG: number }[] }>();
    for (const formula of formulas) {
        for (const [id, { ingredient, neededG }] of formulaNeeds(formula)) {
            const entry = wanted.get(id) ?? { ingredient, uses: [] };
            entry.uses.push({ formula, neededG });
            wanted.set(id, entry);
        }
    }

    const items: ShoppingItem[] = [];
    for (const [id, { ingredient, uses }] of wanted) {
        const have = stock.get(id);
        const unknown = Boolean(have?.unknown);
        let remaining = have?.grams ?? 0;
        let needG = 0;
        const usages: Usage[] = uses.map(({ formula, neededG }) => {
            needG += neededG;
            const coveredG = unknown ? neededG : Math.min(neededG, remaining);
            remaining -= coveredG;
            const state: CoverState = coveredG >= neededG - EPS ? 'covered' : coveredG > EPS ? 'partial' : 'missing';
            return { formulaId: formula.id, formulaName: formula.name, neededG: round2(neededG), coveredG: round2(coveredG), state };
        });
        const haveG = unknown ? null : have?.grams ?? 0;
        items.push({
            ingredient,
            needG: round2(needG),
            haveG: haveG === null ? null : round2(haveG),
            buyG: unknown ? 0 : round2(Math.max(0, needG - (have?.grams ?? 0))),
            leftG: unknown ? null : round2(Math.max(0, (have?.grams ?? 0) - needG)),
            usages,
        });
    }
    // What has to be bought first (the most of it first), then what is already in stock
    items.sort((a, b) => Number(b.buyG > 0) - Number(a.buyG > 0) || b.buyG - a.buyG || nameOf(a.ingredient).localeCompare(nameOf(b.ingredient)));

    // Alerts cover the whole stash, not only the chosen formulas
    const inList = (ingredientId: string) => wanted.has(ingredientId);
    const alerts: StashAlert[] = [];
    const horizon = new Date(day);
    horizon.setDate(horizon.getDate() + warningDays);
    for (const lot of lots) {
        if (lot.amount_left_g !== null && lot.amount_left_g !== undefined && !(lot.amount_left_g > 0)) continue; // used up
        if (!lot.expiration_date) continue;
        const expires = parseDay(lot.expiration_date);
        const daysLeft = Math.round((expires.getTime() - day.getTime()) / 86_400_000);
        const kind: AlertKind | null = expires < day ? 'expired' : expires <= horizon ? 'expiring' : null;
        if (kind) {
            alerts.push({ kind, ingredientId: lot.ingredient_id, name: nameOf(names.get(lot.ingredient_id)), lot: lotName(lot),
                expiresOn: lot.expiration_date, daysLeft, amountG: lot.amount_left_g ?? null, inList: inList(lot.ingredient_id) });
        }
    }

    const itemFor = new Map(items.map(i => [i.ingredient.id, i]));
    const ids = new Set([...stock.keys()]);
    for (const id of ids) {
        const s = stock.get(id)!;
        if (s.unknown || !(s.grams > 0)) continue;
        const item = itemFor.get(id);
        const known = names.get(id) ?? item?.ingredient;
        const level = lowStockLevel(known?.max_usage_pct, lowStockG);
        if (s.grams <= level) {
            alerts.push({ kind: 'low', ingredientId: id, name: nameOf(known), amountG: round2(s.grams), inList: Boolean(item) });
        } else if (item && item.leftG !== null && item.leftG > 0 && item.leftG <= level) {
            alerts.push({ kind: 'low-after', ingredientId: id, name: nameOf(item.ingredient), amountG: item.leftG, inList: true });
        }
    }

    const order: Record<AlertKind, number> = { expired: 0, expiring: 1, low: 2, 'low-after': 3 };
    alerts.sort((a, b) => order[a.kind] - order[b.kind]
        || Number(b.inList) - Number(a.inList)
        || (a.daysLeft ?? 0) - (b.daysLeft ?? 0)
        || a.name.localeCompare(b.name));

    return { items, alerts, totalBuyG: round2(items.reduce((sum, i) => sum + i.buyG, 0)) };
}
