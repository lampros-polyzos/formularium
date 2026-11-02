import { supabase } from './supabase';

export interface SaveItem {
    id: string;
    phase: string;
    percentage: number;
    isQS: boolean;
}

export interface SaveInput {
    formulaId: string | null;
    userId: string;
    name: string;
    profileId: string;
    targetWeight: number;
    targetPh: number | null;
    ingredients: SaveItem[];
}

type Client = Pick<typeof supabase, 'from' | 'rpc'>;

// If the database function is missing or broken we use the older step-by-step save from then on
let rpcUsable = true;
export function resetSaveStateForTests() {
    rpcUsable = true;
}

/** Writes the formula and returns its id. Creates it first when it has none. */
export async function saveFormulation(input: SaveInput, client: Client = supabase): Promise<string> {
    const fields = {
        name: input.name,
        profile_id: input.profileId,
        target_weight_g: input.targetWeight,
        target_ph: input.targetPh,
        user_id: input.userId,
    };

    let id = input.formulaId;
    if (id) {
        // The status is only set when a formula is created, so saving never overwrites it
        const { error } = await client.from('formulations').update(fields).eq('id', id);
        if (error) throw error;
    } else {
        const { data, error } = await client.from('formulations').insert([{ ...fields, status: 'Draft' }]).select('id').single();
        if (error) throw error;
        id = data.id as string;
    }

    const items = [...input.ingredients]
        .sort((a, b) => (a.phase < b.phase ? -1 : a.phase > b.phase ? 1 : (b.percentage || 0) - (a.percentage || 0)))
        .map(i => ({ phase_letter: i.phase, ingredient_id: i.id, percentage: i.percentage || 0, is_qs: i.isQS }));

    await replaceContents(client, id, items, Boolean(input.formulaId));
    return id;
}

interface Item { phase_letter: string; ingredient_id: string; percentage: number; is_qs: boolean }

async function replaceContents(client: Client, formulaId: string, items: Item[], hadContents: boolean) {
    if (rpcUsable) {
        const { error } = await client.rpc('save_formulation_contents', { p_formulation_id: formulaId, p_items: items });
        if (!error) return;
        // No error code means the request never reached the database: nothing was written, so let the caller retry
        if (!error.code) throw error;
        rpcUsable = false;
        console.warn('save_formulation_contents is unavailable, using the step-by-step save instead:', error.message);
    }
    await replaceContentsStepwise(client, formulaId, items, hadContents);
}

async function replaceContentsStepwise(client: Client, formulaId: string, items: Item[], hadContents: boolean) {
    if (hadContents) {
        const { error } = await client.from('formulation_phases').delete().eq('formulation_id', formulaId);
        if (error) throw error;
    }
    const letters = Array.from(new Set(items.map(i => i.phase_letter)));
    if (letters.length === 0) return;

    const { data: phases, error: phaseError } = await client
        .from('formulation_phases')
        .insert(letters.map(letter => ({ formulation_id: formulaId, phase_letter: letter })))
        .select('id, phase_letter');
    if (phaseError) throw phaseError;

    const rows = items.map(i => ({
        phase_id: phases.find(p => p.phase_letter === i.phase_letter)!.id,
        ingredient_id: i.ingredient_id,
        percentage: i.percentage,
        is_qs: i.is_qs,
    }));
    const { error } = await client.from('formulation_ingredients').insert(rows);
    if (error) throw error;
}
