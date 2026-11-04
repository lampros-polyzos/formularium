// Matching one pasted line to the library, including lines that name a kind of ingredient rather than one ingredient:
//
//   "Primary Surfactant (e.g., Sodium Cocoyl Glutamate or Sodium Coco Sulfate): 15% - 30%"  -> those two are searched for
//   "Fragrance / Essential Oils & Colorants (Optional): 0.2% - 1%"                           -> no ingredient named, so the
//                                                                                              library's fragrances and essential oils are suggested
//
// A suggestion is never chosen for the person: it is offered in the list to pick from.

import { findMatches, searchTerms, type MatchableRow, type MatchCandidate, type MatchOptions } from './ingredientMatcher';
import type { ParsedLine } from './recipeParser';

type LineNames = Pick<ParsedLine, 'name' | 'alternates'> & Partial<Pick<ParsedLine, 'examples' | 'hint'>>;

/** The names to look for: the examples when the line lists some, else the name as written. */
export function lineNames(line: LineNames): { name: string; alternates: string[] } {
    const examples = line.examples ?? [];
    if (examples.length) return { name: examples[0], alternates: [...examples.slice(1), ...line.alternates] };
    return { name: line.name, alternates: line.alternates };
}

export function matchLine<R extends MatchableRow>(line: LineNames, rows: R[], options: MatchOptions = {}): MatchCandidate<R>[] {
    const { name, alternates } = lineNames(line);
    return findMatches(name, alternates, rows, options);
}

/** Words to search the library for, for one line. */
export function lineSearchTerms(line: LineNames): string[] {
    const { name, alternates } = lineNames(line);
    return searchTerms(name, alternates);
}

// ---------- Kinds of ingredient ----------

interface RoleDefinition {
    label: string;
    test: RegExp;
    /** Parts of an ingredient's "function" that make it this kind. */
    functions: string[];
    /** Parts of an ingredient's name that make it this kind, where the function is too general (essential oils). */
    names?: string[];
}

/** More specific kinds first; every kind that fits the line's words applies. */
const ROLES: RoleDefinition[] = [
    { label: 'fragrance or essential oil', test: /fragrance|essential oil|perfume|aroma|scent/i, functions: ['fragrance'], names: ['essential oil'] },
    { label: 'preservative', test: /preservative/i, functions: ['preservative'] },
    { label: 'chelating agent', test: /chelat|sequester/i, functions: ['chelat'] },
    { label: 'humectant', test: /humectant|moisturi[sz]er/i, functions: ['humectant'] },
    { label: 'conditioning agent', test: /condition/i, functions: ['conditioning'] },
    { label: 'thickener', test: /thicken|rheology|gelling|viscosity|gelling agent/i, functions: ['thicken', 'rheology'] },
    { label: 'antioxidant', test: /antioxidant/i, functions: ['antioxidant'] },
    { label: 'pH adjuster', test: /ph\s*(?:adjust|regulat|control)|acidifier|acidity regulator/i, functions: ['ph adjuster'] },
    { label: 'emollient', test: /emollient|carrier oil|\bbase oil\b/i, functions: ['emollient', 'carrier oil'] },
    { label: 'emulsifier', test: /emulsifier/i, functions: ['emulsifier'] },
    { label: 'anionic surfactant', test: /anionic/i, functions: ['anionic'] },
    { label: 'amphoteric surfactant', test: /amphoteric|betaine/i, functions: ['amphoteric'] },
    { label: 'non-ionic surfactant', test: /non-?ionic/i, functions: ['non-ionic', 'nonionic'] },
    { label: 'surfactant', test: /surfactant|cleansing agent|detergent|foam/i, functions: ['surfactant'] },
];

export interface RoleSearch {
    labels: string[];
    functions: string[];
    names: string[];
}

/**
 * What kind of ingredient a line is asking for, from its name and description: "Humectant / Moisturizer" is a humectant.
 * Null for a line that names an ordinary ingredient. A narrower surfactant kind ("anionic") replaces the general one.
 */
export function roleSearch(line: Pick<ParsedLine, 'name'> & Partial<Pick<ParsedLine, 'hint'>>): RoleSearch | null {
    const text = `${line.name} ${line.hint ?? ''}`;
    const found = ROLES.filter(role => role.test.test(text));
    const narrow = found.filter(r => /^(anionic|amphoteric|non-ionic) surfactant$/.test(r.label));
    const roles = narrow.length ? found.filter(r => r.label !== 'surfactant') : found;
    if (!roles.length) return null;
    return {
        labels: roles.map(r => r.label),
        functions: [...new Set(roles.flatMap(r => r.functions))],
        names: [...new Set(roles.flatMap(r => r.names ?? []))],
    };
}

type RoleRow = MatchableRow & { function?: string | null };

export function fitsRole(row: RoleRow, search: RoleSearch): boolean {
    const fn = (row.function ?? '').toLowerCase();
    const name = `${row.inci_name} ${row.trade_name ?? ''}`.toLowerCase();
    return search.functions.some(f => fn.includes(f)) || search.names.some(n => name.includes(n));
}

export interface RoleSuggestion<R extends MatchableRow> extends MatchCandidate<R> {
    suggestedFor: string;
}

/** Library ingredients of the kind a line asks for: owned ones first, then by name. Never more than `limit`. */
export function suggestByRole<R extends RoleRow>(
    line: Pick<ParsedLine, 'name'> & Partial<Pick<ParsedLine, 'hint'>>,
    rows: R[],
    options: { stashIds?: Set<string>; limit?: number } = {},
): RoleSuggestion<R>[] {
    const { stashIds = new Set<string>(), limit = 8 } = options;
    const search = roleSearch(line);
    if (!search) return [];
    return rows
        .filter(row => fitsRole(row, search))
        .sort((a, b) =>
            Number(stashIds.has(b.id)) - Number(stashIds.has(a.id))
            || (a.trade_name ?? a.inci_name).localeCompare(b.trade_name ?? b.inci_name))
        .slice(0, limit)
        .map(row => ({ row, score: 0.4, confidence: 'possible' as const, suggestedFor: search.labels.join(' / ') }));
}
