import { supabase } from './supabase';
import { withLineage } from './lineage';

type Client = Pick<typeof supabase, 'from'>;

export interface CloneLine {
    ingredient_id: string;
    percentage: number | string;
    phase: string;
}

/**
 * Copies a community recipe into your Studio as a new draft that remembers which recipe it started as, and returns the
 * new formula's id. The lines are given, so the copy can be the recipe as shared or with changes made to it.
 */
export async function cloneRecipeToStudio(
    userId: string,
    post: { id: string; title: string },
    lines: CloneLine[],
    name: string = `${post.title} (Clone)`,
    client: Client = supabase,
): Promise<string> {
    const { data: draft, error: draftError } = await withLineage(
        extra => client
            .from('formulations')
            .insert([{ name, user_id: userId, status: 'Draft', target_weight_g: 100, ...extra }])
            .select('id')
            .single(),
        { remixed_from_post_id: post.id },
    );
    if (draftError) throw draftError;

    const phases = Array.from(new Set(lines.map(l => l.phase)));
    if (phases.length > 0) {
        const { data: inserted, error: phaseError } = await client
            .from('formulation_phases')
            .insert(phases.map(phase_letter => ({ formulation_id: draft.id, phase_letter })))
            .select('id, phase_letter');
        if (phaseError) throw phaseError;

        const { error: ingredientsError } = await client.from('formulation_ingredients').insert(
            lines.map(l => ({
                phase_id: inserted.find(p => p.phase_letter === l.phase)!.id,
                ingredient_id: l.ingredient_id,
                percentage: l.percentage,
                is_qs: false,
            })),
        );
        if (ingredientsError) throw ingredientsError;
    }
    return draft.id;
}
