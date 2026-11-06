import { createFormula } from './formulasApi';

export interface CloneLine {
    ingredient_id: string;
    percentage: number | string;
    phase: string;
}

/**
 * Copies a community recipe into your Studio as a new draft that remembers which recipe it started as, and returns the
 * new formula's id. The lines are given, so the copy can be the recipe as shared or with changes made to it. A line using
 * another member's private ingredient is left out, because only its owner can use it.
 */
export async function cloneRecipeToStudio(
    post: { id: string; title: string },
    lines: CloneLine[],
    name: string = `${post.title} (Clone)`,
): Promise<string> {
    const created = await createFormula({
        name,
        target_weight_g: 100,
        remixed_from_post_id: post.id,
        ingredients: lines.map(l => ({ ingredient_id: l.ingredient_id, phase_letter: l.phase, percentage: Number(l.percentage), is_qs: false })),
    }, { copy: true });
    return created.id;
}
