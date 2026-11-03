import { isExpired, type StashLot } from './batchPlan';
import { lowStockLevel } from './lowStock';
import type { BatchStatus, CheckResult } from '../types/batches';

// Everything the Metrics page shows is worked out here from plain data, so each number can be tested.

export interface MetricBatch {
    id: string;
    formulation_id: string | null;
    name: string;
    batch_size_g: number;
    made_on: string; // YYYY-MM-DD
    status: BatchStatus;
    final_weight_g?: number | null;
    ingredient_cost?: number | null;
    unpriced_count?: number | null;
    container_name?: string | null;
    container_volume_ml?: number | null;
    container_count?: number | null;
    container_unit_price?: number | null;
    checks: { result: CheckResult | null; observations: string[]; checked_at: string | null }[];
}

export interface MetricLine {
    batch_id: string;
    ingredient_id: string | null;
    name: string;
    actual_g: number;
    cost?: number | null;
}

export interface MetricFormula { id: string; name: string; created_at: string | null; ingredientCount: number }
export interface MetricFavorite { id: string; name: string }

export interface MetricsInput {
    batches: MetricBatch[];
    lines: MetricLine[];
    formulas: MetricFormula[];
    favorites: MetricFavorite[];
    lots: StashLot[];
    /** Names for what is in the stash. */
    stashNames: Map<string, string>;
    /** The highest usual amount (% of a batch) of what is in the stash, so small-dose ingredients are not called low too soon. */
    stashMaxUsage?: Map<string, number | null>;
    /** Recipes of yours that others can see. */
    sharedCount: number;
}

export type RangeId = 'all' | 'year' | '90d' | '30d';
export const RANGES: { id: RangeId; label: string }[] = [
    { id: 'all', label: 'All time' },
    { id: 'year', label: 'Last 12 months' },
    { id: '90d', label: 'Last 90 days' },
    { id: '30d', label: 'Last 30 days' },
];

export interface MetricsOptions { range: RangeId; today?: Date; warningDays: number; lowStockG: number }

export interface IngredientStat { key: string; name: string; batches: number; grams: number; cost: number }
export interface FormulaStat { key: string; name: string; batches: number; grams: number; cost: number; lastMade: string; discarded: number }
export interface ContainerStat { name: string; batches: number; filled: number; volumeMl: number | null; spend: number }
export interface MonthStat { month: string; batches: number; grams: number; spend: number }

export interface Metrics {
    range: RangeId;
    /** Batches that count: made in the range and not undone. */
    batchCount: number;
    overview: {
        batches: number;
        gramsMade: number;
        avgBatchG: number;
        ingredientSpend: number;
        /** Batches whose cost is known, out of all of them. */
        pricedBatches: number;
        avgCostPerBatch: number | null;
        /** Cost of ingredients per 100 g made, from the batches that have a price. */
        costPer100g: number | null;
        mostExpensive: { name: string; cost: number; made_on: string } | null;
        containersFilled: number;
        containerSpend: number;
        distinctIngredients: number;
        distinctFormulas: number;
        lastMadeOn: string | null;
        daysSinceLast: number | null;
        discarded: number;
        discardedCost: number;
        discardedGrams: number;
    };
    ingredientsByUse: IngredientStat[];
    ingredientsBySpend: IngredientStat[];
    ingredientsByGrams: IngredientStat[];
    formulasByBatches: FormulaStat[];
    activity: {
        months: MonthStat[];
        busiestMonth: MonthStat | null;
        avgPerActiveMonth: number;
        weekdays: number[]; // Monday first
        busiestWeekday: number | null;
        streakWeeks: number;
    };
    containers: ContainerStat[];
    stability: {
        checksDone: number;
        results: Record<CheckResult, number>;
        goodShare: number | null;
        problems: { id: string; count: number }[];
        batchesWithProblems: number;
    };
    yieldStats: { measured: number; avgPercent: number | null; lostG: number };
    favorites: {
        used: (IngredientStat & { starred: true })[];
        neverUsed: MetricFavorite[];
        /** Heavily used, but not starred. */
        notStarred: IngredientStat[];
    };
    library: {
        formulas: number;
        avgIngredients: number | null;
        neverMade: { id: string; name: string }[];
        shared: number;
    };
    stash: {
        lots: number;
        ingredients: number;
        value: number;
        unpricedLots: number;
        expired: number;
        expiring: number;
        low: number;
        /** In the stash but never used in a batch: what is sitting idle. */
        idle: { id: string; name: string; grams: number | null; value: number | null }[];
        idleValue: number;
    };
}

const EPS = 1e-9;
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const parseDay = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
/** Monday of the week the date falls in. */
const weekStart = (d: Date) => { const x = dayStart(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const weekKey = (d: Date) => { const w = weekStart(d); return `${w.getFullYear()}-${w.getMonth() + 1}-${w.getDate()}`; };
const round2 = (n: number) => Math.round(n * 100) / 100;

function cutoffFor(range: RangeId, today: Date): Date | null {
    const d = dayStart(today);
    if (range === 'year') { d.setFullYear(d.getFullYear() - 1); return d; }
    if (range === '90d') { d.setDate(d.getDate() - 90); return d; }
    if (range === '30d') { d.setDate(d.getDate() - 30); return d; }
    return null;
}

/** Recent months, oldest first, up to `count`. */
function lastMonths(today: Date, count: number): string[] {
    return Array.from({ length: count }, (_, n) => monthKey(new Date(today.getFullYear(), today.getMonth() - (count - 1 - n), 1)));
}

export function computeMetrics(input: MetricsInput, { range, today = new Date(), warningDays, lowStockG }: MetricsOptions): Metrics {
    const now = dayStart(today);
    const cutoff = cutoffFor(range, now);

    // Undone batches never happened
    const real = input.batches.filter(b => b.status !== 'voided');
    const batches = real.filter(b => !cutoff || parseDay(b.made_on) >= cutoff);
    const inRange = new Set(batches.map(b => b.id));
    const lines = input.lines.filter(l => inRange.has(l.batch_id));
    const everUsed = new Set<string>(); // ingredients used in any batch, ever
    const realIds = new Set(real.map(b => b.id));
    for (const l of input.lines) if (l.ingredient_id && realIds.has(l.batch_id)) everUsed.add(l.ingredient_id);

    // ---- Ingredients ----
    const stats = new Map<string, IngredientStat & { seen: Set<string> }>();
    for (const l of lines) {
        const key = l.ingredient_id ?? `name:${l.name.toLowerCase()}`;
        const s = stats.get(key) ?? { key, name: l.name, batches: 0, grams: 0, cost: 0, seen: new Set<string>() };
        s.grams += num(l.actual_g);
        s.cost += num(l.cost);
        s.seen.add(l.batch_id);
        stats.set(key, s);
    }
    const ingredientStats: IngredientStat[] = [...stats.values()].map(({ seen, ...s }) => ({ ...s, batches: seen.size, grams: round2(s.grams), cost: round2(s.cost) }));
    const byName = (a: IngredientStat, b: IngredientStat) => a.name.localeCompare(b.name);
    const top = (sort: (a: IngredientStat, b: IngredientStat) => number, keep: (s: IngredientStat) => boolean = () => true) =>
        ingredientStats.filter(keep).sort((a, b) => sort(a, b) || byName(a, b)).slice(0, 10);

    // ---- Totals ----
    const gramsMade = batches.reduce((s, b) => s + num(b.batch_size_g), 0);
    const priced = batches.filter(b => b.ingredient_cost !== null && b.ingredient_cost !== undefined);
    const ingredientSpend = priced.reduce((s, b) => s + num(b.ingredient_cost), 0);
    const pricedGrams = priced.reduce((s, b) => s + num(b.batch_size_g), 0);
    const dearest = priced.reduce<MetricBatch | null>((best, b) => (!best || num(b.ingredient_cost) > num(best.ingredient_cost) ? b : best), null);
    const containerSpend = batches.reduce((s, b) => s + num(b.container_unit_price) * num(b.container_count), 0);
    const discarded = batches.filter(b => b.status === 'discarded');
    const lastMadeOn = real.map(b => b.made_on).sort().at(-1) ?? null;

    // ---- Formulas ----
    const formulaMap = new Map<string, FormulaStat>();
    for (const b of batches) {
        const key = b.formulation_id ?? `name:${b.name.toLowerCase()}`;
        const f = formulaMap.get(key) ?? { key, name: b.name, batches: 0, grams: 0, cost: 0, lastMade: b.made_on, discarded: 0 };
        f.batches++;
        f.grams += num(b.batch_size_g);
        f.cost += num(b.ingredient_cost);
        f.discarded += b.status === 'discarded' ? 1 : 0;
        if (b.made_on > f.lastMade) { f.lastMade = b.made_on; f.name = b.name; }
        formulaMap.set(key, f);
    }
    const formulasByBatches = [...formulaMap.values()]
        .map(f => ({ ...f, grams: round2(f.grams), cost: round2(f.cost) }))
        .sort((a, b) => b.batches - a.batches || b.grams - a.grams || a.name.localeCompare(b.name))
        .slice(0, 10);

    // ---- Activity ----
    const monthsShown = range === 'all' || range === 'year' ? 12 : range === '90d' ? 4 : 2;
    const monthList = lastMonths(now, monthsShown);
    const months: MonthStat[] = monthList.map(month => ({ month, batches: 0, grams: 0, spend: 0 }));
    const weekdays = [0, 0, 0, 0, 0, 0, 0];
    for (const b of batches) {
        const day = parseDay(b.made_on);
        const m = months.find(x => x.month === monthKey(day));
        if (m) { m.batches++; m.grams += num(b.batch_size_g); m.spend += num(b.ingredient_cost); }
        weekdays[(day.getDay() + 6) % 7]++;
    }
    for (const m of months) { m.grams = round2(m.grams); m.spend = round2(m.spend); }
    const activeMonths = new Set(batches.map(b => b.made_on.slice(0, 7)));
    const busiestMonth = months.reduce<MonthStat | null>((best, m) => (m.batches > 0 && (!best || m.batches > best.batches) ? m : best), null);
    const peak = Math.max(...weekdays);
    // Weeks in a row with a batch, counting back from this week (or last week, if this one has none yet).
    // A streak is about all your batches, so the range does not cut it short.
    const allWeeks = new Set(real.map(b => weekKey(parseDay(b.made_on))));
    let streakWeeks = 0;
    const cursor = weekStart(now);
    if (!allWeeks.has(weekKey(cursor))) cursor.setDate(cursor.getDate() - 7);
    while (allWeeks.has(weekKey(cursor))) { streakWeeks++; cursor.setDate(cursor.getDate() - 7); }

    // ---- Containers ----
    const containerMap = new Map<string, ContainerStat>();
    for (const b of batches) {
        const name = b.container_name?.trim() || 'No container recorded';
        const c = containerMap.get(name) ?? { name, batches: 0, filled: 0, volumeMl: b.container_volume_ml ?? null, spend: 0 };
        c.batches++;
        c.filled += num(b.container_count);
        c.spend += num(b.container_unit_price) * num(b.container_count);
        containerMap.set(name, c);
    }
    const containers = [...containerMap.values()]
        .map(c => ({ ...c, filled: round2(c.filled), spend: round2(c.spend) }))
        .sort((a, b) => Number(a.name.startsWith('No container')) - Number(b.name.startsWith('No container')) || b.batches - a.batches || a.name.localeCompare(b.name));

    // ---- Stability ----
    const results: Record<CheckResult, number> = { good: 0, minor: 0, failed: 0 };
    const problemCount = new Map<string, number>();
    const problemBatches = new Set<string>();
    let checksDone = 0;
    for (const b of batches) {
        for (const c of b.checks) {
            if (!c.checked_at) continue;
            checksDone++;
            if (c.result) results[c.result]++;
            if (c.result === 'minor' || c.result === 'failed') problemBatches.add(b.id);
            for (const o of c.observations ?? []) problemCount.set(o, (problemCount.get(o) ?? 0) + 1);
        }
    }
    const judged = results.good + results.minor + results.failed;

    // ---- Yield ----
    const measured = batches.filter(b => num(b.final_weight_g) > 0 && num(b.batch_size_g) > 0);
    const yieldPercent = measured.length ? measured.reduce((s, b) => s + (num(b.final_weight_g) / num(b.batch_size_g)) * 100, 0) / measured.length : null;
    const lostG = measured.reduce((s, b) => s + Math.max(0, num(b.batch_size_g) - num(b.final_weight_g)), 0);

    // ---- Favourites ----
    const statById = new Map(ingredientStats.map(s => [s.key, s]));
    const favIds = new Set(input.favorites.map(f => f.id));
    const favUsed = input.favorites.flatMap(f => { const s = statById.get(f.id); return s ? [{ ...s, name: s.name || f.name, starred: true as const }] : []; })
        .sort((a, b) => b.batches - a.batches || b.grams - a.grams || a.name.localeCompare(b.name));
    const favNeverUsed = input.favorites.filter(f => !statById.has(f.id)).sort((a, b) => a.name.localeCompare(b.name));
    const notStarred = ingredientStats.filter(s => !favIds.has(s.key) && !s.key.startsWith('name:') && s.batches >= 2)
        .sort((a, b) => b.batches - a.batches || b.grams - a.grams || byName(a, b)).slice(0, 5);

    // ---- Formula library (all time) ----
    const madeFormulas = new Set(real.map(b => b.formulation_id).filter((x): x is string => Boolean(x)));
    const neverMade = input.formulas.filter(f => !madeFormulas.has(f.id)).map(f => ({ id: f.id, name: f.name })).sort((a, b) => a.name.localeCompare(b.name));

    // ---- Stash (as it is now) ----
    const horizon = new Date(now);
    horizon.setDate(horizon.getDate() + warningDays);
    const alive = input.lots.filter(l => !(l.amount_left_g !== null && l.amount_left_g !== undefined && !(num(l.amount_left_g) > 0)));
    const perIngredient = new Map<string, { grams: number | null; value: number | null }>();
    let value = 0;
    let unpricedLots = 0;
    let expired = 0;
    let expiring = 0;
    for (const l of alive) {
        const price = num(l.price_per_g);
        const known = l.amount_left_g !== null && l.amount_left_g !== undefined;
        const lotValue = known && price > 0 ? num(l.amount_left_g) * price : null;
        if (lotValue === null) unpricedLots++; else value += lotValue;
        if (l.expiration_date) {
            if (isExpired(l, now)) expired++;
            else if (parseDay(l.expiration_date) <= horizon) expiring++;
        }
        const p = perIngredient.get(l.ingredient_id) ?? { grams: 0, value: null as number | null };
        // A lot whose amount was never recorded makes the total unknown (it is trusted to be enough, never "low")
        p.grams = known && p.grams !== null ? p.grams + num(l.amount_left_g) : null;
        if (lotValue !== null) p.value = (p.value ?? 0) + lotValue;
        perIngredient.set(l.ingredient_id, p);
    }
    const low = [...perIngredient.entries()].filter(([id, p]) =>
        p.grams !== null && p.grams > 0 && p.grams <= lowStockLevel(input.stashMaxUsage?.get(id), lowStockG) + EPS).length;
    const idle = [...perIngredient.entries()]
        .filter(([id]) => !everUsed.has(id))
        .map(([id, p]) => ({ id, name: input.stashNames.get(id) ?? 'Unknown ingredient', grams: p.grams === null ? null : round2(p.grams), value: p.value === null ? null : round2(p.value) }))
        .sort((a, b) => (b.value ?? -1) - (a.value ?? -1) || (b.grams ?? 0) - (a.grams ?? 0) || a.name.localeCompare(b.name));

    return {
        range,
        batchCount: batches.length,
        overview: {
            batches: batches.length,
            gramsMade: round2(gramsMade),
            avgBatchG: batches.length ? round2(gramsMade / batches.length) : 0,
            ingredientSpend: round2(ingredientSpend),
            pricedBatches: priced.length,
            avgCostPerBatch: priced.length ? round2(ingredientSpend / priced.length) : null,
            costPer100g: pricedGrams > 0 ? round2((ingredientSpend / pricedGrams) * 100) : null,
            mostExpensive: dearest ? { name: dearest.name, cost: round2(num(dearest.ingredient_cost)), made_on: dearest.made_on } : null,
            containersFilled: round2(batches.reduce((s, b) => s + num(b.container_count), 0)),
            containerSpend: round2(containerSpend),
            distinctIngredients: stats.size,
            distinctFormulas: formulaMap.size,
            lastMadeOn,
            daysSinceLast: lastMadeOn ? Math.max(0, Math.round((now.getTime() - parseDay(lastMadeOn).getTime()) / 86_400_000)) : null,
            discarded: discarded.length,
            discardedCost: round2(discarded.reduce((s, b) => s + num(b.ingredient_cost), 0)),
            discardedGrams: round2(discarded.reduce((s, b) => s + num(b.batch_size_g), 0)),
        },
        ingredientsByUse: top((a, b) => b.batches - a.batches || b.grams - a.grams),
        ingredientsBySpend: top((a, b) => b.cost - a.cost, s => s.cost > 0),
        ingredientsByGrams: top((a, b) => b.grams - a.grams),
        formulasByBatches,
        activity: {
            months,
            busiestMonth,
            avgPerActiveMonth: activeMonths.size ? round2(batches.length / activeMonths.size) : 0,
            weekdays,
            busiestWeekday: peak > 0 ? weekdays.indexOf(peak) : null,
            streakWeeks,
        },
        containers,
        stability: {
            checksDone,
            results,
            goodShare: judged ? results.good / judged : null,
            problems: [...problemCount.entries()].map(([id, count]) => ({ id, count })).sort((a, b) => b.count - a.count || a.id.localeCompare(b.id)),
            batchesWithProblems: problemBatches.size,
        },
        yieldStats: { measured: measured.length, avgPercent: yieldPercent === null ? null : round2(yieldPercent), lostG: round2(lostG) },
        favorites: { used: favUsed, neverUsed: favNeverUsed, notStarred },
        library: {
            formulas: input.formulas.length,
            avgIngredients: input.formulas.length ? round2(input.formulas.reduce((s, f) => s + f.ingredientCount, 0) / input.formulas.length) : null,
            neverMade,
            shared: input.sharedCount,
        },
        stash: {
            lots: alive.length,
            ingredients: perIngredient.size,
            value: round2(value),
            unpricedLots,
            expired,
            expiring,
            low,
            idle: idle.slice(0, 10),
            idleValue: round2(idle.reduce((s, i) => s + (i.value ?? 0), 0)),
        },
    };
}
