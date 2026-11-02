export type BatchStatus = 'active' | 'archived' | 'discarded' | 'voided';
export type CheckResult = 'good' | 'minor' | 'failed';

export interface Batch {
    id: string;
    formulation_id: string | null;
    name: string;
    lot_number: string;
    batch_size_g: number;
    made_on: string; // YYYY-MM-DD
    status: BatchStatus;
    target_ph: number | null;
    measured_ph: number | null;
    final_weight_g: number | null;
    notes: string | null;
    stash_deducted: boolean;
    created_at: string;
}

export interface BatchLine {
    id: string;
    batch_id: string;
    ingredient_id: string | null;
    name: string;
    inci_name: string | null;
    phase: string;
    percentage: number;
    planned_g: number;
    actual_g: number;
}

export interface BatchStashUse {
    id: string;
    batch_ingredient_id: string | null;
    grams: number;
    label: string | null;
}

export interface BatchCheck {
    id: string;
    batch_id: string;
    label: string;
    due_on: string; // YYYY-MM-DD
    checked_at: string | null;
    result: CheckResult | null;
    observations: string[];
    measured_ph: number | null;
    notes: string | null;
}

/** What a stability check-in can record. `critical` ones mean the batch should not be used. */
export const OBSERVATIONS: { id: string; label: string; critical?: boolean }[] = [
    { id: 'separation', label: 'Separation or oil on top' },
    { id: 'grainy', label: 'Grainy or gritty' },
    { id: 'texture', label: 'Texture changed (thinner or thicker)' },
    { id: 'color', label: 'Colour changed' },
    { id: 'odor', label: 'Smell changed' },
    { id: 'ph-drift', label: 'pH drifted' },
    { id: 'mold', label: 'Mold, spots or fuzz', critical: true },
    { id: 'irritation', label: 'Irritated my skin', critical: true },
];

export const OBSERVATION_LABELS: Record<string, string> = Object.fromEntries(OBSERVATIONS.map(o => [o.id, o.label]));

export const STATUS_LABEL: Record<BatchStatus, { text: string; style: string }> = {
    active: { text: 'In progress', style: 'bg-green-50 text-green-800 border-green-200' },
    archived: { text: 'Archived', style: 'bg-gray-100 text-gray-600 border-gray-200' },
    discarded: { text: 'Discarded', style: 'bg-red-50 text-red-700 border-red-200' },
    voided: { text: 'Undone', style: 'bg-gray-100 text-gray-500 border-gray-200' },
};

export const RESULT_LABELS: Record<CheckResult, string> = {
    good: 'Looks good',
    minor: 'Minor change',
    failed: 'Failed',
};
