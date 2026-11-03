// Narrows the ingredient catalog on the server, so the editor asks for the few hundred rows a task can
// use instead of downloading the whole table. Pure: no network here.
//
// A task is described by a list of filters, any of which may match ("or"). Each filter has a JavaScript twin
// (`filterMatches`) so tests can prove a filter never drops a row the in-app logic would have used.

export interface CatalogFilter {
    column: 'function' | 'inci_name' | 'trade_name';
    /** `ilike` is case-insensitive and understands % as "anything". */
    op: 'ilike' | 'eq';
    value: string;
}

/** The filter syntax for a PostgREST `or(...)`. Values are quoted, so commas and brackets in names are safe. */
export function toOrFilter(filters: CatalogFilter[]): string {
    const quote = (v: string) => `"${v.replace(/[\\"]/g, '\\$&')}"`;
    return [...new Set(filters.map(f => `${f.column}.${f.op}.${quote(f.value)}`))].join(',');
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** What the database does with one filter, for tests. */
export function filterMatches(filter: CatalogFilter, row: Partial<Record<CatalogFilter['column'], string | null>>): boolean {
    const text = row[filter.column];
    if (text == null) return false;
    if (filter.op === 'eq') return text === filter.value;
    const pattern = filter.value.split('%').map(escapeRegex).join('.*');
    return new RegExp(`^${pattern}$`, 'is').test(text);
}

export const matchesAny = (filters: CatalogFilter[], row: Partial<Record<CatalogFilter['column'], string | null>>) =>
    filters.some(f => filterMatches(f, row));

/** Shorthand used by the tables of filters. */
export const fnHas = (word: string): CatalogFilter => ({ column: 'function', op: 'ilike', value: `%${word}%` });
export const fnStart = (word: string): CatalogFilter => ({ column: 'function', op: 'ilike', value: `${word}%` });
export const inci = (word: string): CatalogFilter => ({ column: 'inci_name', op: 'ilike', value: `${word}%` });
export const inciHas = (word: string): CatalogFilter => ({ column: 'inci_name', op: 'ilike', value: `%${word}%` });
export const inciEnds = (word: string): CatalogFilter => ({ column: 'inci_name', op: 'ilike', value: `%${word}` });
export const trade = (word: string): CatalogFilter => ({ column: 'trade_name', op: 'ilike', value: `%${word}%` });
