import { downloadPdf, pdfFilename } from './exportPdf';
import { costPerContainer } from './batchCost';
import type { BatchDetail } from './batches';
import { OBSERVATION_LABELS } from '../types/batches';

// The printed quality record is built from what was stored when the batch was made and followed up, not typed again:
// lot, date, what was weighed from which stash lot, what it cost, the pH, the notes and every stability check.

export interface BatchRecordPayload {
    name: string;
    lotNumber: string;
    madeOn: string;
    status: string;
    batchSizeG: number;
    finalWeightG: number | null;
    yieldPct: number | null;
    targetPh: number | null;
    measuredPh: number | null;
    notes: string | null;
    stashDeducted: boolean;
    currency: string;
    container: { name: string; volumeMl: number | null; count: number | null } | null;
    cost: {
        ingredientTotal: number | null;
        per100g: number | null;
        perContainer: number | null;
        containerPrice: number | null;
        estimated: boolean;
        unpricedCount: number;
    };
    lines: {
        name: string;
        inciName: string | null;
        phase: string;
        percentage: number;
        plannedG: number;
        actualG: number;
        cost: number | null;
        costEstimated: boolean;
        stashLots: { grams: number; label: string }[];
    }[];
    checks: {
        label: string;
        dueOn: string;
        checkedAt: string | null;
        result: string | null;
        observations: string[];
        measuredPh: number | null;
        notes: string | null;
    }[];
}

const num = (v: number | string | null | undefined): number | null => (v === null || v === undefined || v === '' ? null : Number(v));
const round1 = (v: number) => Math.round(v * 10) / 10;

export function buildBatchRecord(detail: BatchDetail, currency = '$'): BatchRecordPayload {
    const { batch, lines, usage, checks } = detail;
    const size = Number(batch.batch_size_g);
    const finalWeight = num(batch.final_weight_g);
    const total = num(batch.ingredient_cost);
    const count = num(batch.container_count);
    const unit = costPerContainer(total, count ?? 0, num(batch.container_unit_price) ?? 0);

    return {
        name: batch.name,
        lotNumber: batch.lot_number,
        madeOn: batch.made_on,
        status: batch.status,
        batchSizeG: size,
        finalWeightG: finalWeight,
        yieldPct: finalWeight !== null && size > 0 ? round1((finalWeight / size) * 100) : null,
        targetPh: num(batch.target_ph),
        measuredPh: num(batch.measured_ph),
        notes: batch.notes?.trim() || null,
        stashDeducted: batch.stash_deducted && batch.status !== 'voided',
        currency,
        container: batch.container_name
            ? { name: batch.container_name, volumeMl: num(batch.container_volume_ml), count }
            : null,
        cost: {
            ingredientTotal: total,
            per100g: total !== null && size > 0 ? (total / size) * 100 : null,
            perContainer: unit ? unit.total : null,
            containerPrice: unit ? unit.containerPrice : null,
            estimated: lines.some(l => l.cost_estimated),
            unpricedCount: batch.unpriced_count ?? lines.filter(l => l.cost === null || l.cost === undefined).length,
        },
        lines: lines.map(line => ({
            name: line.name,
            inciName: line.inci_name,
            phase: line.phase,
            percentage: Number(line.percentage),
            plannedG: Number(line.planned_g),
            actualG: Number(line.actual_g),
            cost: num(line.cost),
            costEstimated: Boolean(line.cost_estimated),
            stashLots: usage
                .filter(u => u.batch_ingredient_id === line.id)
                .map(u => ({ grams: Number(u.grams), label: u.label ?? 'stash' })),
        })),
        checks: checks.map(check => ({
            label: check.label,
            dueOn: check.due_on,
            checkedAt: check.checked_at,
            result: check.result,
            observations: (check.observations ?? []).map(o => OBSERVATION_LABELS[o] ?? o),
            measuredPh: num(check.measured_ph),
            notes: check.notes?.trim() || null,
        })),
    };
}

/** Asks the backend for the quality record as a PDF and saves it. */
export async function downloadBatchRecord(detail: BatchDetail, currency = '$'): Promise<void> {
    await downloadPdf('/api/v1/export/batch-record', buildBatchRecord(detail, currency), pdfFilename(detail.batch.name, `Batch_${detail.batch.lot_number}`));
}
