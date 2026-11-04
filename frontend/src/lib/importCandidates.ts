import { supabase } from './supabase';
import { toOrFilter, type CatalogFilter } from './catalogFilter';
import { lineNames, lineSearchTerms, roleSearch, type RoleSearch } from './lineMatching';
import type { ParsedLine } from './recipeParser';
import type { DatabaseIngredient } from '../types/formulation';

export type LibraryRow = DatabaseIngredient & { id: string };

type Client = Pick<typeof supabase, 'from'>;

/** Rows fetched per pasted line. Plenty for one ingredient's name, and a hard stop on a very common word. */
const ROWS_PER_LINE = 60;
/** Rows fetched for a kind of ingredient such as "fragrance". */
const ROWS_PER_ROLE = 40;
/** More lines than this is not a recipe; it keeps one paste from sending hundreds of requests. */
export const MAX_IMPORT_LINES = 60;

/** What to ask the library for, for one pasted line: its telling words, and its name exactly as written. */
export function importFilters(line: ParsedLine): CatalogFilter[] {
    const filters: CatalogFilter[] = [];
    for (const term of lineSearchTerms(line)) {
        filters.push({ column: 'inci_name', op: 'ilike', value: `%${term}%` }, { column: 'trade_name', op: 'ilike', value: `%${term}%` });
    }
    const { name, alternates } = lineNames(line);
    for (const written of [name, ...alternates]) {
        const exact = written.replace(/[%_]/g, ' ').trim();
        if (exact) filters.push({ column: 'inci_name', op: 'ilike', value: exact }, { column: 'trade_name', op: 'ilike', value: exact });
    }
    return filters;
}

/** What to ask the library for, for a line that names a kind of ingredient ("Fragrance") instead of one ingredient. */
export function roleFilters(search: RoleSearch): CatalogFilter[] {
    return [
        ...search.functions.map<CatalogFilter>(f => ({ column: 'function', op: 'ilike', value: `%${f}%` })),
        ...search.names.flatMap<CatalogFilter>(n => [{ column: 'trade_name', op: 'ilike', value: `%${n}%` }, { column: 'inci_name', op: 'ilike', value: `%${n}%` }]),
    ];
}

/** Rows of a kind: the first few by name, plus every one the user owns (so those are never cut off). */
async function fetchRole(search: RoleSearch, ownedIds: string[], client: Client): Promise<LibraryRow[]> {
    const filter = toOrFilter(roleFilters(search));
    const requests = [
        client.from('ingredients').select('*').or(filter).order('trade_name').limit(ROWS_PER_ROLE),
        ...(ownedIds.length ? [client.from('ingredients').select('*').or(filter).in('id', ownedIds.slice(0, 100))] : []),
    ];
    const results = await Promise.all(requests);
    const rows: LibraryRow[] = [];
    for (const { data, error } of results) {
        if (error) throw error;
        rows.push(...((data ?? []) as LibraryRow[]));
    }
    return rows;
}

/**
 * The library rows that could be any of the pasted ingredients, and which of the user's ingredients they own. Only rows
 * that could match are fetched, never the whole library.
 */
export async function loadImportCandidates(lines: ParsedLine[], userId: string, client: Client = supabase): Promise<{ rows: LibraryRow[]; stashIds: Set<string> }> {
    const wanted = lines.slice(0, MAX_IMPORT_LINES);
    const [lookups, stash] = await Promise.all([
        Promise.all(wanted.map(async line => {
            const filters = importFilters(line);
            if (!filters.length) return [] as LibraryRow[];
            const { data, error } = await client.from('ingredients').select('*').or(toOrFilter(filters)).order('trade_name').limit(ROWS_PER_LINE);
            if (error) throw error;
            return (data ?? []) as LibraryRow[];
        })),
        client.from('user_stash').select('ingredient_id').eq('user_id', userId),
    ]);

    const byId = new Map<string, LibraryRow>();
    for (const rows of lookups) for (const row of rows) byId.set(row.id, row);
    // Not being able to read the stash only means owned ingredients are not preferred
    const stashIds = new Set(((stash.data ?? []) as { ingredient_id: string }[]).map(s => s.ingredient_id));

    // Lines that name a kind of ingredient get that kind's ingredients to choose from (one lookup per distinct kind)
    const kinds = new Map<string, RoleSearch>();
    for (const line of wanted) {
        const search = roleSearch(line);
        if (search) kinds.set(search.functions.join('|') + '#' + search.names.join('|'), search);
    }
    const roleRows = await Promise.all([...kinds.values()].map(search => fetchRole(search, [...stashIds], client)));
    for (const rows of roleRows) for (const row of rows) byId.set(row.id, row);
    return { rows: [...byId.values()], stashIds };
}
