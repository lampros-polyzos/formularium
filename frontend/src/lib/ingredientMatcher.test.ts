import { describe, expect, it } from 'vitest';
import { findMatches, nameForms, nameScore, nameTokens, searchTerms } from './ingredientMatcher';
import { LIBRARY, row } from './starterLibraryFixture';

const best = (name: string, alternates: string[] = [], rows = LIBRARY, stash = new Set<string>()) =>
    findMatches(name, alternates, rows, { stashIds: stash })[0];

describe('matching a written name to the library', () => {
    it.each([
        ['Glycerin', 'Glycerin'],
        ['glycerine', 'Glycerin'],
        ['Vegetable Glycerin', 'Glycerin'],
        ['Water', 'Aqua'],
        ['distilled water', 'Aqua'],
        ['Deionized Water', 'Aqua'],
        ['Vitamin E', 'Tocopherol'],
        ['vitamin e oil', 'Tocopherol'],
        ['Vitamin B5', 'Panthenol'],
        ['pro-vitamin B5', 'Panthenol'],
        ['Panthenol', 'Panthenol'],
        ['Hyaluronic Acid', 'Sodium Hyaluronate'],
        ['Jojoba Oil', 'Simmondsia Chinensis Seed Oil'],
        ['jojoba oil, cold pressed', 'Simmondsia Chinensis Seed Oil'],
        ['Cocoa Butter', 'Theobroma Cacao Seed Butter'],
        ['MCT oil', 'Caprylic/Capric Triglyceride'],
        ['Fractionated coconut oil', 'Caprylic/Capric Triglyceride'],
        ['Cetyl alcohol', 'Cetyl Alcohol'],
        ['Euxyl PE 9010', 'Phenoxyethanol (and) Ethylhexylglycerin'],
        ['Olivem 1000', 'Cetearyl Olivate, Sorbitan Olivate'],
        ['Montanov 68', 'Cetearyl Alcohol (and) Cetearyl Glucoside'],
        ['Cetearyl Olivate and Sorbitan Olivate', 'Cetearyl Olivate, Sorbitan Olivate'],
        ['Disodium EDTA', 'Disodium EDTA'],
        ['EDTA', 'Disodium EDTA'],
        ['Salt', 'Sodium Chloride'],
        ['Coco glucoside', 'Coco-Glucoside'],
        ['CAPB', 'Cocamidopropyl Betaine'],
    ])('%s -> %s', (written, inci) => {
        expect(best(written)?.row.inci_name).toBe(inci);
    });

    it('finds an ingredient by its INCI name written with different capitals and brackets', () => {
        expect(best('SIMMONDSIA CHINENSIS (JOJOBA) SEED OIL')?.row.inci_name).toBe('Simmondsia Chinensis Seed Oil');
        expect(best('Butyrospermum Parkii (Shea) Butter')?.row.inci_name).toBe('Butyrospermum Parkii Butter');
    });

    it('uses a common name on the line as another way to find it', () => {
        expect(best('Water', ['Aqua'])?.row.inci_name).toBe('Aqua');
        expect(best('Shea', ['Butyrospermum Parkii Butter'])?.row.inci_name).toBe('Butyrospermum Parkii Butter');
    });

    it('forgives a small spelling mistake in a real word', () => {
        expect(best('panthenoll')?.row.inci_name).toBe('Panthenol');
        expect(best('Phenoxyethanoll')).toBeUndefined();   // not in this library as a pure ingredient
    });

    it('does not guess when nothing in the library is close', () => {
        expect(best('Unobtainium Extract')).toBeUndefined();
        expect(best('Oil')).toBeUndefined();
    });

    it('does not confuse similar names', () => {
        const rows = [row('Cetearyl Alcohol', 'Cetearyl Alcohol', 'Thickener', 1, 5, 'oil'), row('Cetyl Alcohol', 'Cetyl Alcohol', 'Thickener', 1, 5, 'oil'), row('Sodium Lauryl Sulfate', 'SLS', 'Surfactant', 1, 5, 'water')];
        expect(best('Cetyl alcohol', [], rows)?.row.inci_name).toBe('Cetyl Alcohol');
        expect(findMatches('Sodium Laureth Sulfate', [], rows).map(c => c.row.inci_name)).not.toContain('Sodium Lauryl Sulfate');
    });
});

describe('how sure it is', () => {
    it('is exact for the same name, likely for a common name or reworded one, possible for a loose one', () => {
        expect(best('Glycerin')?.confidence).toBe('exact');
        expect(best('Water')?.confidence).toBe('exact');
        expect(best('Shea Butter')?.confidence).toBe('likely');
        expect(findMatches('Sunflower Seed', [], LIBRARY)[0]?.confidence).not.toBe('exact');
    });

    it('lists alternatives, best first', () => {
        const shea = findMatches('Shea Butter', [], LIBRARY);
        expect(shea.length).toBeGreaterThan(1);
        expect(shea.map(c => c.score)).toEqual([...shea.map(c => c.score)].sort((a, b) => b - a));
        expect(shea[0].row.inci_name).toContain('Butyrospermum');
    });
});

describe('choosing between grades of the same thing', () => {
    it('prefers the plain grade over a bracketed variant, and the one you own over both', () => {
        const refined = LIBRARY.find(r => r.trade_name === 'Shea Butter (Refined)')!;
        const raw = LIBRARY.find(r => r.trade_name === 'Shea Butter (Raw)')!;
        expect(best('Shea Butter')?.row.id).toBe(refined.id);
        expect(best('Shea Butter', [], LIBRARY, new Set([raw.id]))?.row.id).toBe(raw.id);
    });

    it('prefers a pure ingredient to a blend that contains it', () => {
        const rows = [row('Phenoxyethanol (and) Ethylhexylglycerin', 'Euxyl PE 9010', 'Preservative', 0.5, 1, 'water'), row('Phenoxyethanol', 'Phenoxyethanol', 'Preservative', 0.5, 1, 'water')];
        expect(best('Phenoxyethanol', [], rows)?.row.inci_name).toBe('Phenoxyethanol');
    });
});

describe('helpers', () => {
    it('breaks names into plain lower-case words, ignoring punctuation, grades and purity figures', () => {
        expect(nameTokens('Vegetable Glycerin 99.5%')).toEqual(['vegetable', 'glycerin']);
        expect(nameTokens('Helianthus Annuus (Sunflower) Seed Oil [High Oleic]')).toEqual(['helianthus', 'annuus', 'sunflower', 'seed', 'oil']);
        expect(nameTokens('Crème Extracts')).toEqual(['creme', 'extract']);
        expect(nameTokens(null)).toEqual([]);
    });

    it('scores identical names 1 and unrelated names 0', () => {
        expect(nameScore('Glycerin', 'Glycerin')).toBe(1);
        expect(nameScore('Glycerin', 'Titanium Dioxide')).toBe(0);
        expect(nameScore('', 'Glycerin')).toBe(0);
    });

    it('lists the other names to try for a written one', () => {
        expect(nameForms('Vitamin E').map(f => f.text)).toEqual(['Vitamin E', 'tocopherol']);
        expect(nameForms('Water', ['Aqua']).map(f => f.text)).toEqual(['Water', 'aqua', 'Aqua'].filter((t, i, a) => a.findIndex(x => x.toLowerCase() === t.toLowerCase()) === i));
    });

    it('lists words to search the library for, including the start of long words', () => {
        const terms = searchTerms('Glycerine');
        expect(terms).toContain('glycerine');
        expect(terms).toContain('glyceri');
        expect(terms).toContain('glycerin');   // from the everyday-name list
        expect(searchTerms('Shea Butter')).toContain('shea');
    });
});
