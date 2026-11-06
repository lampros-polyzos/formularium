import { fetchProfile } from './formulasApi';
import { fetchStash, searchIngredients } from './libraryApi';
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
export async function loadStarterFormula(template: StarterTemplate): Promise<LoadedStarter> {
    const [ingredients, profileRes, stashRes] = await Promise.all([
        searchIngredients({ anyOf: templateFilters(template), limit: ROW_LIMIT }),
        fetchProfile(template.profileId).then(data => ({ data, error: null }), (error: Error) => ({ data: null, error })),
        fetchStash().then(lots => ({ lots, error: null }), (error: Error) => ({ lots: [], error })),
    ]);
    if (profileRes.error) console.warn('Could not load the product type; using default balancing rules:', profileRes.error.message);
    if (stashRes.error) console.warn('Could not read your stash; the template will not prefer what you own:', stashRes.error.message);

    const profile = (profileRes.data as ProfileConfig | null) ?? null;
    const stashIds = new Set(stashRes.lots.map(entry => entry.ingredient_id));

    const formula = buildStarterFormula(
        template,
        ingredients as (LibraryRow & { percentage?: number })[],
        // Without the profile the balancer still knows the product type from its id
        profile ?? { id: template.profileId, max_oil_phase_percent: null },
        stashIds,
    );
    return { formula, profile };
}
