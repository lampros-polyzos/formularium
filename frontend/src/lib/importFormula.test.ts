import { describe, expect, it } from 'vitest';
import { buildImportedFormula, guessProfileId, type ImportLine } from './importFormula';
import { findMatches } from './ingredientMatcher';
import { parseRecipeText } from './recipeParser';
import { LIBRARY, type Row } from './starterLibraryFixture';

/** The whole path: pasted text -> lines -> best library match -> formula. */
function run(text: string, profileId?: string) {
    const parsed = parseRecipeText(text);
    const lines: ImportLine<Row>[] = parsed.lines.map(p => ({ parsed: p, row: findMatches(p.name, p.alternates, LIBRARY)[0]?.row ?? null }));
    return { lines, formula: buildImportedFormula(lines, profileId) };
}
const byName = (f: ReturnType<typeof run>['formula']) => Object.fromEntries(f.ingredients.map(i => [i.inci_name, i.percentage]));
const total = (f: ReturnType<typeof run>['formula']) => Math.round(f.ingredients.reduce((s, i) => s + i.percentage, 0) * 100) / 100;

describe('percentages written down', () => {
    it('keeps them as written and puts each ingredient in the right place', () => {
        const { formula } = run('Water 75.5%\nGlycerin 5%\nCetyl Alcohol 3%\nJojoba Oil 10%\nOlivem 1000 4%\nPhenoxyethanol (Euxyl PE 9010) 1%\nVitamin E 0.5%\nPanthenol 1%');
        expect(byName(formula)).toMatchObject({ Aqua: 75.5, Glycerin: 5, 'Cetyl Alcohol': 3, 'Simmondsia Chinensis Seed Oil': 10, Tocopherol: 0.5, Panthenol: 1 });
        expect(formula.warnings).toEqual([]);
        expect(formula.lineIndexes).toHaveLength(8);
    });

    it('warns when they do not add up to 100', () => {
        const { formula } = run('Water 60%\nGlycerin 5%');
        expect(formula.warnings.join(' ')).toMatch(/add up to 65%/);
        expect(total(formula)).toBe(65);
    });

    it('lets "q.s." take what is left', () => {
        const { formula } = run('Glycerin 5%\nCetyl Alcohol 3%\nWater q.s. to 100');
        expect(byName(formula).Aqua).toBe(92);
        expect(total(formula)).toBe(100);
        expect(formula.ingredients.find(i => i.inci_name === 'Aqua')?.isQS).toBe(true);
        expect(formula.sources).toContain('remainder');
    });

    it('says so when nothing is left for the q.s. line', () => {
        const { formula } = run('Glycerin 70%\nCetyl Alcohol 40%\nWater q.s.');
        expect(formula.warnings.join(' ')).toMatch(/nothing left/);
        expect(byName(formula).Aqua).toBe(0);
    });
});

describe('weights', () => {
    it('become percentages of the total weight', () => {
        const { formula } = run('Water 70 g\nGlycerin 5 g\nCetyl alcohol 3g\nJojoba oil 22 g');
        expect(byName(formula)).toMatchObject({ Aqua: 70, Glycerin: 5, 'Cetyl Alcohol': 3, 'Simmondsia Chinensis Seed Oil': 22 });
        expect(total(formula)).toBe(100);
    });

    it('scale to any total, not only 100', () => {
        const { formula } = run('Water 350 g\nGlycerin 25 g\nJojoba oil 125 g');
        expect(byName(formula)).toMatchObject({ Aqua: 70, Glycerin: 5, 'Simmondsia Chinensis Seed Oil': 25 });
    });

    it('count an unmatched line in the total, and say it was skipped', () => {
        const { formula } = run('Water 80 g\nUnobtainium powder 10 g\nGlycerin 10 g');
        expect(byName(formula)).toMatchObject({ Aqua: 80, Glycerin: 10 });
        expect(formula.warnings.join(' ')).toMatch(/Skipped with an amount: Unobtainium powder/);
    });

    it('treat a bare list of numbers as percentages if they add up to 100, otherwise as grams', () => {
        expect(byName(run('Water: 70\nGlycerin: 5\nCetyl alcohol: 25').formula)).toMatchObject({ Aqua: 70, Glycerin: 5, 'Cetyl Alcohol': 25 });
        expect(byName(run('Water: 140\nGlycerin: 10\nCetyl alcohol: 50').formula)).toMatchObject({ Aqua: 70, Glycerin: 5, 'Cetyl Alcohol': 25 });
    });
});

describe('lines without an amount', () => {
    it('are given suggested amounts around the ones that were written', () => {
        const { formula } = run('Water q.s.\nGlycerin 5%\nCetyl Alcohol\nPhenoxyethanol (and) Ethylhexylglycerin');
        const amounts = byName(formula);
        expect(amounts.Glycerin).toBe(5);
        expect(amounts['Cetyl Alcohol']).toBeGreaterThan(0);
        expect(amounts['Phenoxyethanol (and) Ethylhexylglycerin']).toBeGreaterThan(0);
        expect(total(formula)).toBeCloseTo(100, 0);
        expect(formula.sources[formula.ingredients.findIndex(i => i.inci_name === 'Cetyl Alcohol')]).toBe('suggested');
        expect(formula.warnings.join(' ')).toMatch(/no amount/);
    });

    it('make a whole formula from a plain INCI list', () => {
        const { formula } = run('Aqua, Glycerin, Cetearyl Alcohol (and) Cetearyl Glucoside, Simmondsia Chinensis Seed Oil, Cetyl Alcohol, Tocopherol, Phenoxyethanol (and) Ethylhexylglycerin');
        expect(formula.ingredients).toHaveLength(7);
        expect(total(formula)).toBeCloseTo(100, 0);
        expect(formula.warnings.join(' ')).toMatch(/No amounts were given/);
        expect(formula.profileId).toBe('ow_lotion');
        for (const ing of formula.ingredients) expect(ing.percentage).toBeGreaterThan(0);
    });
});

describe('phases and product type', () => {
    it('uses the heading above a line, else the ingredient\'s own temperature limit', () => {
        const { formula } = run('Phase B\nJojoba Oil 10%\nPhase A\nWater 80%\nGlycerin 5%\nPhase C\nVitamin E 1%\nPhenoxyethanol (and) Ethylhexylglycerin 1%');
        const phase = Object.fromEntries(formula.ingredients.map(i => [i.inci_name, i.phase]));
        expect(phase).toMatchObject({ 'Simmondsia Chinensis Seed Oil': 'B', Aqua: 'A', Glycerin: 'A', Tocopherol: 'C' });
        const plain = run('Vitamin E 1%\nWater 99%').formula;
        expect(plain.ingredients.find(i => i.inci_name === 'Tocopherol')?.phase).toBe('C');   // heat-sensitive: cool-down
    });

    it('lets the person choose a phase or an amount in the review', () => {
        const { lines } = run('Water 70%\nGlycerin 5%');
        lines[1].overridePct = 8;
        lines[1].overridePhase = 'C';
        const formula = buildImportedFormula(lines);
        expect(formula.ingredients[1]).toMatchObject({ percentage: 8, phase: 'C' });
        expect(formula.sources[1]).toBe('edited');
    });

    it('guesses the product type from what is in it, and accepts the person\'s choice', () => {
        expect(run('Water 70%\nGlycerin 5%\nJojoba Oil 10%\nOlivem 1000 4%\nCetyl Alcohol 3%').formula.profileId).toBe('ow_lotion');
        expect(run('Water 90%\nGlycerin 5%\nPanthenol 1%').formula.profileId).toBe('toner_mist');
        expect(run('Jojoba Oil 80%\nMCT oil 20%').formula.profileId).toBe('facial_oil');
        expect(run('Shea Butter 60%\nJojoba Oil 40%').formula.profileId).toBe('body_butter');
        expect(run('Water 60%\nCoco-Glucoside 20%\nCAPB 10%\nSodium Chloride 1%').formula.profileId).toBe('body_wash');
        expect(run('Water 90%\nGlycerin 10%', 'shampoo').formula.profileId).toBe('shampoo');
        expect(guessProfileId([]).profileId).toBeTruthy();
    });
});

describe('nothing usable', () => {
    it('says nothing matched, without building anything', () => {
        const { formula } = run('Unobtainium 5%\nMystery goo 3%');
        expect(formula.ingredients).toEqual([]);
        expect(formula.warnings.join(' ')).toMatch(/None of the pasted lines matched/);
    });

    it('leaves skipped lines out and keeps the order of the rest', () => {
        const { lines, formula } = run('Glycerin 5%\nMystery goo 3%\nWater 92%');
        lines[0].row = null;   // the person skipped it
        const built = buildImportedFormula(lines);
        expect(built.ingredients.map(i => i.inci_name)).toEqual(['Aqua']);
        expect(built.lineIndexes).toEqual([2]);
        expect(formula.lineIndexes).toEqual([0, 2]);
    });
});
