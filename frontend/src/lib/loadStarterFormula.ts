import { supabase } from './supabase';
import { toOrFilter } from './catalogFilter';
import { buildStarterFormula, templateFilters, type StarterFormula, type StarterTemplate } from './starterTemplates';
import type { DatabaseIngredient, ProfileConfig } from '../types/formulation';

type LibraryRow = DatabaseIngredient & { id: string };

/** More than any template can use, and a hard stop if a filter ever matches far more than expected. */
const ROW_LIMIT = 500;

export interface LoadedStarter {
    formula: StarterFormula<LibraryRow & { percentage?: number }>;
    /** The product type's rules, or null if it could not be loaded (the balancer then uses its defaults). */
    profile: ProfileConfig | null;
}

/**
 * Loads what a template needs from the library, the product type, and what the user owns, then builds the
 * balanced starting formula. Only the ingredients the template could use are fetched, never the whole library.
 */
export async function loadStarterFormula(template: StarterTemplate, userId: string): Promise<LoadedStarter> {
    const [ingredients, profileRes, stashRes] = await Promise.all([
        supabase.from('ingredients').select('*').or(toOrFilter(templateFilters(template))).limit(ROW_LIMIT),
        supabase.from('formulation_profiles').select('*').eq('id', template.profileId).maybeSingle(),
        supabase.from('user_stash').select('ingredient_id').eq('user_id', userId),
    ]);
    if (ingredients.error) throw ingredients.error;
    if (profileRes.error) console.warn('Could not load the product type; using default balancing rules:', profileRes.error.message);
    if (stashRes.error) console.warn('Could not read your stash; the template will not prefer what you own:', stashRes.error.message);

    const profile = (profileRes.data as ProfileConfig | null) ?? null;
    const stashIds = new Set(((stashRes.data ?? []) as { ingredient_id: string }[]).map(entry => entry.ingredient_id));

    const formula = buildStarterFormula(
        template,
        (ingredients.data ?? []) as (LibraryRow & { percentage?: number })[],
        // Without the profile the balancer still knows the product type from its id
        profile ?? { id: template.profileId, max_oil_phase_percent: null },
        stashIds,
    );
    return { formula, profile };
}
