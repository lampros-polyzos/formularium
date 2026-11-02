import type { BatchCheck } from '../types/batches';

// Pure planning logic for "Make this batch": what to weigh, and which stash lots would be used.
// Nothing here reads or writes the database; the stash is only changed when the user confirms (see createBatch).

export interface StashLot {
    id: string;
    ingredient_id: string;
    amount_left_g: number | null;
    expiration_date: string | null;
    supplier_name?: string | null;
    batch_lot_number?: string | null;
}

export interface Allocation {
    stash_id: string;
    grams: number;
    label: string;
}

export interface StashAvailability {
    /** In date and counted. */
    freshG: number;
    /** Past its expiration date: never used automatically. */
    expiredG: number;
    /** Stash entries that exist but have no amount recorded, so they can't be deducted from. */
    hasUntracked: boolean;
}

export interface StashAllocation {
    allocations: Allocation[];
    allocatedG: number;
    /** What the stash can't cover. */
    shortG: number;
}

export const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export const plannedGrams = (percentage: number, batchSizeG: number) => round2((percentage / 100) * batchSizeG);

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export function isExpired(lot: Pick<StashLot, 'expiration_date'>, today: Date = new Date()): boolean {
    if (!lot.expiration_date) return false;
    const [y, m, d] = lot.expiration_date.split('-').map(Number);
    return new Date(y, m - 1, d) < startOfDay(today);
}

export function lotLabel(lot: StashLot): string {
    const parts = [lot.batch_lot_number, lot.supplier_name].filter(Boolean);
    if (parts.length > 0) return parts.join(' · ');
    return lot.expiration_date ? `expires ${lot.expiration_date}` : 'stash lot';
}

export function availability(ingredientId: string | null, lots: StashLot[], today: Date = new Date()): StashAvailability {
    const mine = ingredientId ? lots.filter(l => l.ingredient_id === ingredientId) : [];
    let freshG = 0, expiredG = 0;
    for (const lot of mine) {
        const amount = lot.amount_left_g ?? 0;
        if (amount <= 0) continue;
        if (isExpired(lot, today)) expiredG += amount; else freshG += amount;
    }
    return {
        freshG: round2(freshG),
        expiredG: round2(expiredG),
        hasUntracked: mine.some(l => l.amount_left_g === null || l.amount_left_g === undefined),
    };
}

/** Takes from the lot that expires first. Expired lots and lots without a recorded amount are never touched. */
export function allocateFromStash(ingredientId: string | null, neededG: number, lots: StashLot[], today: Date = new Date()): StashAllocation {
    const usable = (ingredientId ? lots.filter(l => l.ingredient_id === ingredientId) : [])
        .filter(l => (l.amount_left_g ?? 0) > 0 && !isExpired(l, today))
        .sort((a, b) => {
            if (a.expiration_date === b.expiration_date) return 0;
            if (!a.expiration_date) return 1; // no expiry: use last
            if (!b.expiration_date) return -1;
            return a.expiration_date < b.expiration_date ? -1 : 1;
        });

    const allocations: Allocation[] = [];
    let remaining = round2(neededG);
    for (const lot of usable) {
        if (remaining <= 0) break;
        const take = round2(Math.min(remaining, lot.amount_left_g ?? 0));
        if (take <= 0) continue;
        allocations.push({ stash_id: lot.id, grams: take, label: lotLabel(lot) });
        remaining = round2(remaining - take);
    }
    const allocatedG = round2(allocations.reduce((sum, a) => sum + a.grams, 0));
    return { allocations, allocatedG, shortG: round2(Math.max(neededG - allocatedG, 0)) };
}

export interface PlanRow {
    ingredient_id: string | null;
    name: string;
    inci_name: string | null;
    phase: string;
    percentage: number;
}

export interface PlanEdits {
    /** Amount to weigh, by row index, when the user typed their own. */
    amounts: Record<number, number>;
    /** Rows the user chose not to take from the stash. */
    skipStash: Set<number>;
}

export type LineStatus = 'ok' | 'short' | 'none' | 'expired';

export interface PlanLine {
    index: number;
    row: PlanRow;
    plannedG: number;
    amountG: number;
    available: StashAvailability;
    /** Whether this line will take from the stash if the batch is confirmed. */
    takeFromStash: boolean;
    allocation: StashAllocation;
    /** ok: fully covered. short: partly. expired: only expired stock. none: not in the stash. */
    status: LineStatus;
}

export function buildPlan(
    rows: PlanRow[],
    batchSizeG: number,
    lots: StashLot[],
    edits: PlanEdits = { amounts: {}, skipStash: new Set() },
    useStash = true,
    today: Date = new Date(),
): PlanLine[] {
    return rows.map((row, index) => {
        const plannedG = plannedGrams(row.percentage, batchSizeG);
        const amountG = edits.amounts[index] !== undefined ? round2(Math.max(edits.amounts[index], 0)) : plannedG;
        const available = availability(row.ingredient_id, lots, today);
        const canTake = useStash && !edits.skipStash.has(index) && available.freshG > 0;
        const allocation = canTake
            ? allocateFromStash(row.ingredient_id, amountG, lots, today)
            : { allocations: [], allocatedG: 0, shortG: amountG };

        let status: LineStatus = 'none';
        if (available.freshG > 0) status = allocation.shortG > 0 && canTake ? 'short' : 'ok';
        else if (available.expiredG > 0) status = 'expired';
        if (available.freshG > 0 && !canTake) status = 'ok';

        return { index, row, plannedG, amountG, available, takeFromStash: canTake, allocation, status };
    });
}

export interface PlanSummary {
    totalG: number;
    deductG: number;
    lotsTouched: number;
    linesTakingFromStash: number;
    shortLines: PlanLine[];
    /** True when confirming would change the stash. */
    changesStash: boolean;
}

export function summarizePlan(lines: PlanLine[]): PlanSummary {
    const taking = lines.filter(l => l.takeFromStash && l.allocation.allocations.length > 0);
    const lotIds = new Set(taking.flatMap(l => l.allocation.allocations.map(a => a.stash_id)));
    return {
        totalG: round2(lines.reduce((sum, l) => sum + l.amountG, 0)),
        deductG: round2(taking.reduce((sum, l) => sum + l.allocation.allocatedG, 0)),
        lotsTouched: lotIds.size,
        linesTakingFromStash: taking.length,
        shortLines: lines.filter(l => l.takeFromStash && l.allocation.shortG > 0),
        changesStash: taking.length > 0,
    };
}

/** "261103-1", "261103-2", ...: the date plus the next free number for that day. */
export function suggestLotNumber(existing: string[], today: Date = new Date()): string {
    const yy = String(today.getFullYear()).slice(-2);
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const base = `${yy}${mm}${dd}`;
    const used = existing
        .filter(lot => lot.startsWith(`${base}-`))
        .map(lot => Number(lot.slice(base.length + 1)))
        .filter(Number.isFinite);
    return `${base}-${used.length > 0 ? Math.max(...used) + 1 : 1}`;
}

// ---------- Check-ins ----------

export type CheckState = 'done' | 'overdue' | 'due' | 'upcoming';

export function checkState(check: Pick<BatchCheck, 'due_on' | 'checked_at'>, today: Date = new Date()): CheckState {
    if (check.checked_at) return 'done';
    const [y, m, d] = check.due_on.split('-').map(Number);
    const due = new Date(y, m - 1, d).getTime();
    const now = startOfDay(today).getTime();
    return due < now ? 'overdue' : due === now ? 'due' : 'upcoming';
}

export function daysUntil(dueOn: string, today: Date = new Date()): number {
    const [y, m, d] = dueOn.split('-').map(Number);
    return Math.round((new Date(y, m - 1, d).getTime() - startOfDay(today).getTime()) / 86_400_000);
}

export function describeDue(dueOn: string, today: Date = new Date()): string {
    const days = daysUntil(dueOn, today);
    if (days === 0) return 'due today';
    if (days === 1) return 'due tomorrow';
    if (days > 1) return `due in ${days} days`;
    if (days === -1) return '1 day overdue';
    return `${-days} days overdue`;
}

// ---------- Batch overview ----------

export interface CheckProgress {
    done: number;
    total: number;
    /** The worst result recorded so far, or null before the first check-in. */
    worst: 'good' | 'minor' | 'failed' | null;
    /** A mold or skin-reaction observation was recorded: the batch should not be used. */
    critical: boolean;
}

const SEVERITY = { good: 0, minor: 1, failed: 2 } as const;

export function checkProgress(
    checks: Pick<BatchCheck, 'checked_at' | 'result' | 'observations'>[],
    criticalIds: string[] = ['mold', 'irritation'],
): CheckProgress {
    const done = checks.filter(c => c.checked_at);
    let worst: CheckProgress['worst'] = null;
    for (const c of done) {
        if (c.result && (worst === null || SEVERITY[c.result] > SEVERITY[worst])) worst = c.result;
    }
    return {
        done: done.length,
        total: checks.length,
        worst,
        critical: done.some(c => c.observations?.some(o => criticalIds.includes(o))),
    };
}
