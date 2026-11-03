import { supabase } from './supabase';
import type { CatalogIngredient } from './substitutions';

/** The most rows one request returns. A filter that matches more than this is cut off, with a warning. */
export const CANDIDATE_LIMIT = 300;

/** Ids per request for the stash lookup, so the address stays short. */
const STASH_CHUNK = 100;

const chunk = <T,>(items: T[], size: number): T[][] =>
    Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));

/**
 * Catalog rows matching a PostgREST `or(...)` filter. The user's own stash is looked up separately so those
 * ingredients are never cut off by the limit: a substitute you already own matters most.
 */
export async function fetchCandidates(orFilter: string, stashIds: string[]): Promise<CatalogIngredient[]> {
    const requests = [
        supabase.from('ingredients').select('*').or(orFilter).order('trade_name').limit(CANDIDATE_LIMIT),
        ...chunk(stashIds, STASH_CHUNK).map(ids => supabase.from('ingredients').select('*').or(orFilter).in('id', ids)),
    ];
    const results = await Promise.all(requests);

    const byId = new Map<string, CatalogIngredient>();
    for (const { data, error } of results) {
        if (error) throw error;
        for (const row of (data ?? []) as CatalogIngredient[]) byId.set(row.id, row);
    }
    if ((results[0].data?.length ?? 0) >= CANDIDATE_LIMIT) {
        console.warn(`Ingredient candidates were limited to ${CANDIDATE_LIMIT} for filter: ${orFilter}`);
    }
    return [...byId.values()];
}
