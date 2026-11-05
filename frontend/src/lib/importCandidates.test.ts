import { beforeEach, describe, expect, it, vi } from 'vitest';
import { importFilters, loadImportCandidates, MAX_IMPORT_LINES } from './importCandidates';
import { matchesAny } from './catalogFilter';
import { findMatches } from './ingredientMatcher';
import { parseRecipeText } from './recipeParser';
import { LIBRARY } from './starterLibraryFixture';

// The library and the stash come from the backend
const api = vi.hoisted(() => ({ searchIngredients: vi.fn(), fetchStash: vi.fn() }));
vi.mock('./libraryApi', () => api);

const line = (text: string) => parseRecipeText(text).lines[0];

/** A backend with this library and this stash. Everything asked of it is recorded by the mocks. */
function fakeLibrary(rows = LIBRARY, stash: string[] = []) {
    api.searchIngredients.mockReset().mockResolvedValue(rows);
    api.fetchStash.mockReset().mockResolvedValue(stash.map(id => ({ ingredient_id: id })));
}

beforeEach(() => fakeLibrary());

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
        fakeLibrary(LIBRARY, [LIBRARY[1].id]);
        const parsed = parseRecipeText('Water 70%\nGlycerin 5%\nCetyl alcohol 3%').lines;
        const { rows, stashIds } = await loadImportCandidates(parsed);
        expect(api.searchIngredients).toHaveBeenCalledTimes(3);
        expect(rows).toHaveLength(LIBRARY.length);   // the same rows from every line, counted once
        expect([...stashIds]).toEqual([LIBRARY[1].id]);
    });

    it('does not send more requests than a recipe could need', async () => {
        const text = Array.from({ length: MAX_IMPORT_LINES + 20 }, (_, i) => `Ingredient${i} 1%`).join('\n');
        await loadImportCandidates(parseRecipeText(text).lines);
        expect(api.searchIngredients).toHaveBeenCalledTimes(MAX_IMPORT_LINES);
    });

    it('passes on a library error', async () => {
        api.searchIngredients.mockRejectedValue(new Error('boom'));
        await expect(loadImportCandidates(parseRecipeText('Water 70%').lines)).rejects.toMatchObject({ message: 'boom' });
    });

    it('still finds the candidates when the stash cannot be read, it just prefers nothing you own', async () => {
        api.fetchStash.mockRejectedValue(new Error('down'));
        const { rows, stashIds } = await loadImportCandidates(parseRecipeText('Water 70%').lines);
        expect(rows).toHaveLength(LIBRARY.length);
        expect(stashIds.size).toBe(0);
    });
});
