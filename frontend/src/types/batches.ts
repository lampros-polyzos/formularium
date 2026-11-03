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
    /** What was filled into: the container record survives the container being deleted. */
    container_id?: string | null;
    container_name?: string | null;
    container_volume_ml?: number | null;
    /** How many containers the batch fills (a fraction when the last is part full). */
    container_count?: number | null;
    container_unit_price?: number | null;
    density_g_ml?: number | null;
    /** What the ingredients cost, from the prices of the stash lots used. Null when nothing could be priced. */
    ingredient_cost?: number | null;
    /** Ingredients that had no price at all. */
    unpriced_count?: number;
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
    /** Null when no price was known. */
    cost?: number | null;
    /** Part of the cost is a guess, or part of it had no price. */
    cost_estimated?: boolean;
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
/** `learn` is what to search the Learn hub for to find out why this happens and how to fix it. */
export const OBSERVATIONS: { id: string; label: string; critical?: boolean; learn: string }[] = [
    { id: 'separation', label: 'Separation or oil on top', learn: 'separates' },
    { id: 'grainy', label: 'Grainy or gritty', learn: 'grainy' },
    { id: 'texture', label: 'Texture changed (thinner or thicker)', learn: 'thin' },
    { id: 'color', label: 'Colour changed', learn: 'colour' },
    { id: 'odor', label: 'Smell changed', learn: 'smells' },
    { id: 'ph-drift', label: 'pH drifted', learn: 'ph changed' },
    { id: 'mold', label: 'Mold, spots or fuzz', critical: true, learn: 'mold' },
    { id: 'irritation', label: 'Irritated my skin', critical: true, learn: 'stings' },
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
