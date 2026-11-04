import { describe, expect, it, vi } from 'vitest';
import { importFilters, loadImportCandidates, MAX_IMPORT_LINES } from './importCandidates';
import { matchesAny } from './catalogFilter';
import { findMatches } from './ingredientMatcher';
import { parseRecipeText } from './recipeParser';
import { LIBRARY } from './starterLibraryFixture';

// The tests pass their own client, so the real one (which needs environment variables) is never created
vi.mock('./supabase', () => ({ supabase: {} }));

const line = (text: string) => parseRecipeText(text).lines[0];

/** A library that answers an `or(...)` filter the way the database would, and records what it was asked. */
function fakeClient(rows = LIBRARY, stash: string[] = []) {
    const asked: string[] = [];
    const client = {
        from: (table: string) => {
            const b: Record<string, unknown> = {};
            for (const m of ['select', 'order', 'limit', 'eq']) b[m] = () => b;
            b.or = (filter: string) => { asked.push(filter); return b; };
            b.then = (resolve: (v: unknown) => void) => resolve(table === 'user_stash' ? { data: stash.map(id => ({ ingredient_id: id })), error: null } : { data: rows, error: null });
            return b;
        },
    };
    return { client: client as never, asked };
}

describe('what is asked of the library', () => {
    it('never misses the right row: every ingredient a name can mean is allowed through the filters', () => {
        for (const [text, inci] of [
            ['Glycerine 5%', 'Glycerin'], ['Water 70%', 'Aqua'], ['Vitamin E', 'Tocopherol'], ['Hyaluronic acid', 'Sodium Hyaluronate'],
            ['Shea butter', 'Butyrospermum Parkii Butter'], ['Jojoba oil', 'Simmondsia Chinensis Seed Oil'], ['MCT oil', 'Caprylic/Capric Triglyceride'],
            ['Euxyl PE 9010', 'Phenoxyethanol (and) Ethylhexylglycerin'], ['Olivem 1000', 'Cetearyl Olivate, Sorbitan Olivate'],
        ]) {
            const parsed = line(text);
            const rowsThrough = LIBRARY.filter(r => matchesAny(importFilters(parsed), r));
            expect(findMatches(parsed.name, parsed.alternates, rowsThrough)[0]?.row.inci_name, text).toBe(inci);
        }
    });

    it('does not ask for a common word that would match half the library', () => {
        const filters = importFilters(line('Sodium Hyaluronate'));
        expect(filters.map(f => f.value)).not.toContain('%sodium%');
        expect(filters.map(f => f.value)).toContain('%hyaluronate%');
    });

    it('also asks for the name exactly as written', () => {
        expect(importFilters(line('Euxyl PE 9010')).map(f => f.value)).toContain('Euxyl PE 9010');
    });
});

describe('loading candidates', () => {
    it('asks once per pasted line, merges the rows, and reports what is in the stash', async () => {
        const { client, asked } = fakeClient(LIBRARY, [LIBRARY[1].id]);
        const parsed = parseRecipeText('Water 70%\nGlycerin 5%\nCetyl alcohol 3%').lines;
        const { rows, stashIds } = await loadImportCandidates(parsed, 'u1', client);
        expect(asked).toHaveLength(3);
        expect(rows).toHaveLength(LIBRARY.length);   // the same rows from every line, counted once
        expect([...stashIds]).toEqual([LIBRARY[1].id]);
    });

    it('does not send more requests than a recipe could need', async () => {
        const { client, asked } = fakeClient();
        const text = Array.from({ length: MAX_IMPORT_LINES + 20 }, (_, i) => `Ingredient${i} 1%`).join('\n');
        await loadImportCandidates(parseRecipeText(text).lines, 'u1', client);
        expect(asked).toHaveLength(MAX_IMPORT_LINES);
    });

    it('passes on a library error', async () => {
        const client = { from: () => { const b: Record<string, unknown> = {}; for (const m of ['select', 'order', 'limit', 'eq', 'or']) b[m] = () => b; b.then = (r: (v: unknown) => void) => r({ data: null, error: { message: 'boom' } }); return b; } };
        await expect(loadImportCandidates(parseRecipeText('Water 70%').lines, 'u1', client as never)).rejects.toMatchObject({ message: 'boom' });
    });
});
