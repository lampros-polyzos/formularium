import { request } from './apiClient';
import type { Allocation } from './batchPlan';
import type { Batch, BatchCheck, BatchLine, BatchStashUse, BatchStatus, CheckResult } from '../types/batches';

/**
 * Turns whatever went wrong into something a person can act on. The backend's own messages (for example "Not enough Shea Butter left in your
 * stash") are kept as they are; a request that never reached the server is explained.
 */
export function friendlyError(error: unknown, fallback = 'Something went wrong.'): Error {
    const message = error instanceof Error ? error.message : '';
    if (error instanceof Error && 'status' in error) return new Error(message || fallback);   // the backend answered: its message is written for people
    if (/failed to fetch|network|could not reach/i.test(message)) return new Error("Couldn't reach the server. Check your connection and try again.");
    return new Error(message || fallback);
}

export const isoDate = (d: Date = new Date()) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// ---------- Starting and undoing a batch ----------

export interface CreateBatchLine {
    ingredient_id: string | null;
    name: string;
    inci_name: string | null;
    phase: string;
    percentage: number;
    planned_g: number;
    actual_g: number;
    /** Grams to take out of stash lots. Empty means the batch is only recorded. */
    allocations: Allocation[];
    /** Price per gram to use for grams that do not come out of the stash; null when none is known. */
    est_price_per_g?: number | null;
}

/** What the batch is filled into. The name and size are kept on the batch even if the container is deleted later. */
export interface CreateBatchContainer {
    id: string | null;
    name: string;
    volume_ml: number;
    /** How many containers the batch fills (a fraction when the last is part full). */
    count: number;
    unit_price: number;
    density_g_ml: number;
}

export interface CreateBatchInput {
    formulationId: string | null;
    name: string;
    lotNumber: string;
    batchSizeG: number;
    targetPh: number | null;
    notes: string;
    lines: CreateBatchLine[];
    container?: CreateBatchContainer | null;
}

/**
 * Saves the batch and takes the allocated grams out of the stash in a single transaction, on the backend. What the batch cost is
 * worked out from the stash lots' prices inside the same transaction. If any lot no longer holds enough, nothing is saved or taken.
 * This is the only call that can change the stash, and only for lines that carry allocations.
 */
export async function createBatch(input: CreateBatchInput): Promise<string> {
    try {
        const { id } = await request<{ id: string }>('/api/v1/batches', {
            method: 'POST',
            body: {
                formulation_id: input.formulationId,
                name: input.name,
                lot_number: input.lotNumber.trim(),
                batch_size_g: input.batchSizeG,
                target_ph: input.targetPh,
                notes: input.notes,
                lines: input.lines,
                made_on: isoDate(),
                container: input.container ?? null,
            },
        });
        return id;
    } catch (error) {
        throw friendlyError(error, 'Could not start the batch.');
    }
}

/** Marks the batch undone and puts what it took back into the stash. */
export async function voidBatch(batchId: string): Promise<void> {
    try {
        await request<void>(`/api/v1/batches/${batchId}/void`, { method: 'POST' });
    } catch (error) {
        throw friendlyError(error, 'Could not undo the batch.');
    }
}

/**
 * Removes a batch for good: its ingredients, stash usage and check-ins go with it, so it disappears from the history
 * and from the metrics. With `restoreStash`, what it took from the stash is put back first (by undoing it), so the
 * worst that can happen if the removal then fails is that the batch is left marked as undone.
 */
export async function deleteBatch(batchId: string, { restoreStash = false }: { restoreStash?: boolean } = {}): Promise<void> {
    if (restoreStash) await voidBatch(batchId);
    try {
        await request<void>(`/api/v1/batches/${batchId}`, { method: 'DELETE' });
    } catch (error) {
        throw friendlyError(error, 'Could not delete the batch.');
    }
}

// ---------- Reading ----------

export type BatchListItem = Batch & { batch_checks: Pick<BatchCheck, 'id' | 'label' | 'due_on' | 'checked_at' | 'result' | 'observations'>[] };

export async function listBatches(): Promise<BatchListItem[]> {
    try {
        return await request<BatchListItem[]>('/api/v1/batches');
    } catch (error) {
        throw friendlyError(error, 'Could not load your batches.');
    }
}

export interface BatchDetail {
    batch: Batch;
    lines: BatchLine[];
    usage: BatchStashUse[];
    checks: BatchCheck[];
}

export async function getBatch(id: string): Promise<BatchDetail> {
    try {
        return await request<BatchDetail>(`/api/v1/batches/${id}`);
    } catch (error) {
        throw friendlyError(error, 'Could not load this batch.');
    }
}

/** Lot numbers already used today, for suggesting the next one. */
export async function lotNumbersLike(prefix: string): Promise<string[]> {
    try {
        return await request<string[]>(`/api/v1/batches/lot-numbers?prefix=${encodeURIComponent(prefix)}`);
    } catch {
        return []; // a suggestion only; the backend still rejects duplicates
    }
}

/** How many check-ins are due or overdue on batches still in progress. */
export async function countDueChecks(today: Date = new Date()): Promise<number> {
    try {
        return (await request<{ count: number }>(`/api/v1/batches/checks/due/count?today=${isoDate(today)}`)).count;
    } catch (error) {
        throw friendlyError(error);
    }
}

/** A check-in that is due or overdue, with the batch it belongs to, so it can be answered without opening the batch. */
export type DueCheck = BatchCheck & { batch: Pick<Batch, 'id' | 'name' | 'lot_number' | 'target_ph'> };

/** The oldest due or overdue check-ins on batches still in progress. */
export async function listDueChecks(today: Date = new Date(), limit = 3): Promise<DueCheck[]> {
    try {
        return await request<DueCheck[]>(`/api/v1/batches/checks/due?today=${isoDate(today)}&limit=${limit}`);
    } catch (error) {
        throw friendlyError(error);
    }
}

/** What went into every batch you have made (for the metrics). */
export async function listBatchLines(): Promise<{ batch_id: string; ingredient_id: string | null; name: string; actual_g: number | string; cost: number | string | null }[]> {
    try {
        return await request('/api/v1/batches/lines');
    } catch (error) {
        throw friendlyError(error, 'Could not load what went into your batches.');
    }
}

// ---------- Editing ----------

export async function updateBatch(
    id: string,
    patch: Partial<Pick<Batch, 'status' | 'measured_ph' | 'final_weight_g' | 'notes' | 'lot_number'>>,
): Promise<void> {
    try {
        await request<void>(`/api/v1/batches/${id}`, { method: 'PATCH', body: patch });
    } catch (error) {
        throw friendlyError(error, 'Could not save your changes.');
    }
}

export interface CheckInInput {
    result: CheckResult;
    observations: string[];
    measured_ph: number | null;
    notes: string;
}

export async function completeCheck(checkId: string, input: CheckInInput): Promise<void> {
    try {
        await request<void>(`/api/v1/batches/checks/${checkId}`, {
            method: 'PUT',
            body: { result: input.result, observations: input.observations, measured_ph: input.measured_ph, notes: input.notes.trim() || null },
        });
    } catch (error) {
        throw friendlyError(error, 'Could not save the check-in.');
    }
}

export async function addCheck(batchId: string, label: string, dueOn: string): Promise<void> {
    try {
        await request<void>(`/api/v1/batches/${batchId}/checks`, { method: 'POST', body: { label: label.trim(), due_on: dueOn } });
    } catch (error) {
        throw friendlyError(error, 'Could not add the check-in.');
    }
}

export const ACTIVE_STATUSES: BatchStatus[] = ['active'];
