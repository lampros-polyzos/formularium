import { supabase } from './supabase';
import type { Allocation } from './batchPlan';
import type { Batch, BatchCheck, BatchLine, BatchStashUse, BatchStatus, CheckResult } from '../types/batches';

type Client = Pick<typeof supabase, 'from' | 'rpc'>;

interface DbError { code?: string; message?: string }

const MIGRATION_HINT = "The batch log isn't set up in your database yet. Run supabase/migrations/20261105000000_batch_log.sql in the Supabase SQL Editor.";

/** Turns a database error into something a person can act on. */
export function friendlyError(error: DbError | null | undefined, fallback = 'Something went wrong.'): Error {
    const message = error?.message ?? '';
    if (error?.code === 'PGRST202' || error?.code === 'PGRST205' || error?.code === '42P01' || /could not find the (function|table)/i.test(message)) {
        return new Error(MIGRATION_HINT);
    }
    if (error?.code === '23505') return new Error('That lot number is already used by another batch. Pick a different one.');
    if (error?.code === '23514') return new Error('One of the values is out of range. Check the amounts and try again.');
    if (!error?.code && /failed to fetch|network/i.test(message)) return new Error("Couldn't reach the server. Check your connection and try again.");
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
 * Saves the batch and takes the allocated grams out of the stash in a single transaction. What the batch cost is
 * worked out from the stash lots' prices inside the same transaction.
 * This is the only function that can change the stash, and only for lines that carry allocations.
 */
export async function createBatch(input: CreateBatchInput, client: Client = supabase): Promise<string> {
    const args = {
        p_formulation_id: input.formulationId,
        p_name: input.name,
        p_lot_number: input.lotNumber.trim(),
        p_batch_size_g: input.batchSizeG,
        p_target_ph: input.targetPh,
        p_notes: input.notes,
        p_lines: input.lines,
        p_made_on: isoDate(),
    };
    let { data, error } = await client.rpc('create_batch', { ...args, p_container: input.container ?? null });
    if (error?.code === 'PGRST202') {
        // The database hasn't been updated with costs and containers yet. Nothing ran, so start the batch the
        // way it was done before: it is recorded and the stash is still handled, just without costs.
        console.warn('Batch costs and containers are not available yet (database migration pending); starting without them.');
        ({ data, error } = await client.rpc('create_batch', args));
    }
    if (error) throw friendlyError(error, 'Could not start the batch.');
    return data as string;
}

/** Marks the batch undone and puts what it took back into the stash. */
export async function voidBatch(batchId: string, client: Client = supabase): Promise<void> {
    const { error } = await client.rpc('void_batch', { p_batch_id: batchId });
    if (error) throw friendlyError(error, 'Could not undo the batch.');
}

// ---------- Reading ----------

export type BatchListItem = Batch & { batch_checks: Pick<BatchCheck, 'id' | 'label' | 'due_on' | 'checked_at' | 'result' | 'observations'>[] };

export async function listBatches(client: Client = supabase): Promise<BatchListItem[]> {
    const { data, error } = await client
        .from('batches')
        .select('*, batch_checks(id, label, due_on, checked_at, result, observations)')
        .order('made_on', { ascending: false })
        .order('created_at', { ascending: false });
    if (error) throw friendlyError(error, 'Could not load your batches.');
    return (data ?? []) as BatchListItem[];
}

export interface BatchDetail {
    batch: Batch;
    lines: BatchLine[];
    usage: BatchStashUse[];
    checks: BatchCheck[];
}

export async function getBatch(id: string, client: Client = supabase): Promise<BatchDetail> {
    const [batch, lines, usage, checks] = await Promise.all([
        client.from('batches').select('*').eq('id', id).single(),
        client.from('batch_ingredients').select('*').eq('batch_id', id).order('phase').order('percentage', { ascending: false }),
        client.from('batch_stash_usage').select('id, batch_ingredient_id, grams, label').eq('batch_id', id),
        client.from('batch_checks').select('*').eq('batch_id', id).order('due_on'),
    ]);
    if (batch.error) throw friendlyError(batch.error, 'Could not load this batch.');
    for (const part of [lines, usage, checks]) if (part.error) throw friendlyError(part.error, 'Could not load this batch.');
    return {
        batch: batch.data as Batch,
        lines: (lines.data ?? []) as BatchLine[],
        usage: (usage.data ?? []) as BatchStashUse[],
        checks: (checks.data ?? []) as BatchCheck[],
    };
}

/** Lot numbers already used today, for suggesting the next one. */
export async function lotNumbersLike(prefix: string, client: Client = supabase): Promise<string[]> {
    const { data, error } = await client.from('batches').select('lot_number').like('lot_number', `${prefix}%`);
    if (error) return []; // a suggestion only; the database still rejects duplicates
    return (data ?? []).map((r: { lot_number: string }) => r.lot_number);
}

/** How many check-ins are due or overdue on batches still in progress. */
export async function countDueChecks(client: Client = supabase, today: Date = new Date()): Promise<number> {
    const { count, error } = await client
        .from('batch_checks')
        .select('id, batches!inner(status)', { count: 'exact', head: true })
        .is('checked_at', null)
        .lte('due_on', isoDate(today))
        .eq('batches.status', 'active');
    if (error) throw friendlyError(error);
    return count ?? 0;
}

// ---------- Editing ----------

export async function updateBatch(
    id: string,
    patch: Partial<Pick<Batch, 'status' | 'measured_ph' | 'final_weight_g' | 'notes' | 'lot_number'>>,
    client: Client = supabase,
): Promise<void> {
    const { error } = await client.from('batches').update(patch).eq('id', id);
    if (error) throw friendlyError(error, 'Could not save your changes.');
}

export interface CheckInInput {
    result: CheckResult;
    observations: string[];
    measured_ph: number | null;
    notes: string;
}

export async function completeCheck(checkId: string, input: CheckInInput, client: Client = supabase): Promise<void> {
    const { error } = await client
        .from('batch_checks')
        .update({
            checked_at: new Date().toISOString(),
            result: input.result,
            observations: input.observations,
            measured_ph: input.measured_ph,
            notes: input.notes.trim() || null,
        })
        .eq('id', checkId);
    if (error) throw friendlyError(error, 'Could not save the check-in.');
}

export async function addCheck(batchId: string, label: string, dueOn: string, client: Client = supabase): Promise<void> {
    const { error } = await client.from('batch_checks').insert([{ batch_id: batchId, label: label.trim(), due_on: dueOn }]);
    if (error) throw friendlyError(error, 'Could not add the check-in.');
}

export const ACTIVE_STATUSES: BatchStatus[] = ['active'];
