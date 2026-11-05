import type { CatalogFilter } from './catalogFilter';
import { searchIngredients } from './libraryApi';
import type { CatalogIngredient } from './substitutions';

/** The most rows one request returns. A filter that matches more than this is cut off, with a warning. */
export const CANDIDATE_LIMIT = 300;

/** Ids per request for the stash lookup, so one request stays small. */
const STASH_CHUNK = 100;

const chunk = <T,>(items: T[], size: number): T[][] =>
    Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));

/**
 * Catalog rows matching any of the filters. The user's own stash is looked up separately so those
 * ingredients are never cut off by the limit: a substitute you already own matters most.
 */
export async function fetchCandidates(filters: CatalogFilter[], stashIds: string[]): Promise<CatalogIngredient[]> {
    const [found, ...owned] = await Promise.all([
        searchIngredients({ anyOf: filters, limit: CANDIDATE_LIMIT, orderByName: true }),
        ...chunk(stashIds, STASH_CHUNK).map(ids => searchIngredients({ anyOf: filters, ids, limit: STASH_CHUNK })),
    ]);

    const byId = new Map<string, CatalogIngredient>();
    for (const row of [found, ...owned].flat() as CatalogIngredient[]) byId.set(row.id, row);
    if (found.length >= CANDIDATE_LIMIT) {
        console.warn(`Ingredient candidates were limited to ${CANDIDATE_LIMIT} for ${filters.length} filters, starting with ${filters[0]?.column} ${filters[0]?.op} ${filters[0]?.value}`);
    }
    return [...byId.values()];
}
