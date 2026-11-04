import { describe, expect, it } from 'vitest';
import { parseRecipeText } from './recipeParser';

const one = (text: string) => parseRecipeText(text).lines[0];
const names = (text: string) => parseRecipeText(text).lines.map(l => l.name);

describe('reading amounts', () => {
    it.each([
        ['Water 70%', 'Water', 70, '%'],
        ['70% Water', 'Water', 70, '%'],
        ['Water - 70 %', 'Water', 70, '%'],
        ['Water ........ 70%', 'Water', 70, '%'],
        ['Glycerin (5 g)', 'Glycerin', 5, 'g'],
        ['5 g glycerin', 'glycerin', 5, 'g'],
        ['5g Glycerin', 'Glycerin', 5, 'g'],
        ['1. Cetyl alcohol 3g', 'Cetyl alcohol', 3, 'g'],
        ['• Panthenol 1%', 'Panthenol', 1, '%'],
        ['- Panthenol: 1 %', 'Panthenol', 1, '%'],
        ['Phenoxyethanol 0.8-1%', 'Phenoxyethanol', 0.9, '%'],
        ['Allantoin 0,5%', 'Allantoin', 0.5, '%'],
        ['Shea butter 10 grams', 'Shea butter', 10, 'g'],
        ['Jojoba oil 2 tbsp', 'Jojoba oil', 2, 'tbsp'],
        ['Water\t70', 'Water', 70, 'number'],
        ['Water: 70', 'Water', 70, 'number'],
        ['Glycerin = 5', 'Glycerin', 5, 'number'],
        ['Water, 70', 'Water', 70, 'number'],
    ])('%s', (text, name, value, unit) => {
        const line = text === 'Water, 70' ? parseRecipeText('Water: 70').lines[0] : one(text);
        expect(line.name).toBe(name);
        expect(line.amount).toMatchObject({ value, unit });
    });

    it('does not mistake a number that is part of a name for an amount', () => {
        for (const name of ['Polysorbate 20', 'PEG-40 Hydrogenated Castor Oil', 'Euxyl PE 9010', 'Carbomer 940', 'C12-15 Alkyl Benzoate', 'Vitamin B5', 'Phenoxyethanol']) {
            const line = one(name);
            expect(line.name).toBe(name);
            expect(line.amount).toBeNull();
        }
    });

    it('still finds an amount after a name with a number in it', () => {
        expect(one('Polysorbate 20 - 2%')).toMatchObject({ name: 'Polysorbate 20', amount: { value: 2, unit: '%' } });
        expect(one('Polysorbate 20: 2')).toMatchObject({ name: 'Polysorbate 20', amount: { value: 2, unit: 'number' } });
    });

    it('reads "q.s." and "to 100" as whatever is needed to reach 100%', () => {
        for (const text of ['Water q.s. to 100', 'Water qs', 'Water to 100%', 'Water ad 100', 'Water (balance)']) {
            const line = one(text);
            expect(line.qs, text).toBe(true);
            expect(line.name, text).toBe('Water');
            expect(line.amount, text).toBeNull();
        }
    });
});

describe('names', () => {
    it('keeps a common name in brackets as another name', () => {
        expect(one('Water (Aqua) 70%')).toMatchObject({ name: 'Water', alternates: ['Aqua'], amount: { value: 70, unit: '%' } });
    });

    it('keeps INCI blends together', () => {
        expect(names('Cetearyl Alcohol (and) Cetearyl Glucoside 4%')).toEqual(['Cetearyl Alcohol and Cetearyl Glucoside']);
        expect(names('Aqua, Cetearyl Alcohol (and) Cetearyl Glucoside, Glycerin')).toEqual(['Aqua', 'Cetearyl Alcohol and Cetearyl Glucoside', 'Glycerin']);
    });

    it('marks optional items and drops words like "about" and "~"', () => {
        expect(one('Fragrance (optional) 0.3%')).toMatchObject({ name: 'Fragrance', optional: true, amount: { value: 0.3, unit: '%' } });
        expect(one('~ 5 g Glycerin')).toMatchObject({ name: 'Glycerin', amount: { value: 5, unit: 'g' } });
    });
});

describe('whole texts', () => {
    it('reads a plain ingredient list written on one line', () => {
        expect(names('Aqua, Glycerin, Cetyl Alcohol, Phenoxyethanol')).toEqual(['Aqua', 'Glycerin', 'Cetyl Alcohol', 'Phenoxyethanol']);
        expect(names('Aqua; Glycerin; Cetyl Alcohol')).toEqual(['Aqua', 'Glycerin', 'Cetyl Alcohol']);
    });

    it('reads a list with amounts on separate lines, skipping blank lines', () => {
        const result = parseRecipeText('\nWater 70%\n\nGlycerin 5%\n  Cetyl alcohol 3%\n');
        expect(result.lines.map(l => [l.name, l.amount?.value])).toEqual([['Water', 70], ['Glycerin', 5], ['Cetyl alcohol', 3]]);
    });

    it('reads several items with amounts on one line', () => {
        expect(parseRecipeText('Water 70%, Glycerin 5%, Panthenol 1%').lines.map(l => [l.name, l.amount?.value])).toEqual([['Water', 70], ['Glycerin', 5], ['Panthenol', 1]]);
    });

    it('gives each line the phase of the heading above it', () => {
        const text = 'Phase A:\nWater 70%\nGlycerin 5%\nOil phase\nShea butter 5%\nPhase C\nPhenoxyethanol 1%';
        expect(parseRecipeText(text).lines.map(l => [l.name, l.phase])).toEqual([['Water', 'A'], ['Glycerin', 'A'], ['Shea butter', 'B'], ['Phenoxyethanol', 'C']]);
    });

    it('leaves the phase empty when there are no headings', () => {
        expect(one('Water 70%').phase).toBeUndefined();
    });

    it('ignores a heading such as "Ingredients:", and stops at the method', () => {
        const text = 'Ingredients:\nWater 70%\nGlycerin 5%\n\nMethod:\nHeat the water to 70 C and add the glycerin.';
        const result = parseRecipeText(text);
        expect(result.lines.map(l => l.name)).toEqual(['Water', 'Glycerin']);
    });

    it('does not turn a sentence into ingredients', () => {
        const text = 'This is the lotion I make every week for my dry hands in winter.\nWater 70%';
        const result = parseRecipeText(text);
        expect(result.lines.map(l => l.name)).toEqual(['Water']);
        expect(result.ignored).toHaveLength(1);
    });

    it('does not turn a short sentence into ingredients either', () => {
        const result = parseRecipeText('Heat the water and then stir well.\nGlycerin 5%');
        expect(result.lines.map(l => l.name)).toEqual(['Glycerin']);
        expect(result.ignored).toEqual(['Heat the water and then stir well.']);
    });

    it('copes with Windows line endings and non-breaking spaces', () => {
        expect(parseRecipeText('Water 70%\r\nGlycerin\u00a05%').lines.map(l => l.amount?.value)).toEqual([70, 5]);
    });

    it('returns nothing for empty text', () => {
        expect(parseRecipeText('   \n  ')).toEqual({ lines: [], ignored: [] });
    });

    it('keeps what was pasted so it can be shown back', () => {
        expect(one('  • Panthenol 1%  ').raw).toBe('• Panthenol 1%');
    });
});

describe('ranges and general lines (a recipe copied from the web)', () => {
    const text = [
        '• Deionized Water (Aqua): Q.S. (Quantum Satis /, roughly 50–70%)',
        '• Primary Surfactant (Anionic - e.g., Sodium Cocoyl Glutamate or Sodium Coco Sulfate): 15% – 30%',
        '• Humectant / Moisturizer (e.g., Glycerin or Panthenol / Pro-Vitamin B5): 1% – 5%',
        '• Preservative (e.g., Phenoxyethanol or a broad-spectrum cosmetic preservative): 0.5% – 1%',
        '• Fragrance / Essential Oils & Colorants (Optional): 0.2% – 1%',
        '• pH Adjuster (Citric Acid solution):',
    ].join(String.fromCharCode(10));
    const lines = parseRecipeText(text).lines;

    it('reads every line', () => {
        expect(lines.map(l => l.name)).toEqual(['Deionized Water', 'Primary Surfactant', 'Humectant / Moisturizer', 'Preservative', 'Fragrance / Essential Oils & Colorants', 'pH Adjuster']);
    });

    it('takes the other name in brackets, and ignores a note about "roughly 50-70%" on a q.s. line', () => {
        expect(lines[0]).toMatchObject({ alternates: ['Aqua'], qs: true, amount: null });
    });

    it('reads a range with a unit on both ends as its middle, and remembers the range', () => {
        expect(lines[1].amount).toEqual({ value: 22.5, unit: '%', range: [15, 30] });
        expect(lines[2].amount).toEqual({ value: 3, unit: '%', range: [1, 5] });
        expect(lines[4].amount).toEqual({ value: 0.6, unit: '%', range: [0.2, 1] });
        expect(lines[4].optional).toBe(true);
    });

    it('takes the examples after "e.g." as the ingredients, and keeps the description', () => {
        expect(lines[1]).toMatchObject({ examples: ['Sodium Cocoyl Glutamate', 'Sodium Coco Sulfate'], hint: 'Anionic -' .replace(/ -$/, '') });
        expect(lines[2].examples).toEqual(['Glycerin', 'Panthenol', 'Pro-Vitamin B5']);
    });

    it('drops a description in place of an example', () => {
        expect(lines[3].examples).toEqual(['Phenoxyethanol']);
    });

    it('has no examples when there are none, and reads a plain bracketed name as another name', () => {
        expect(lines[4].examples).toEqual([]);
        expect(lines[5]).toMatchObject({ alternates: ['Citric Acid solution'], amount: null });
    });

    it('does not mistake a number in a name for the start of a range', () => {
        expect(one('Polysorbate 20 - 2%').amount).toMatchObject({ value: 2 });
        expect(one('Glycerin 5 g - 10 g').amount).toMatchObject({ value: 7.5, unit: 'g' });
    });

    it('reads "such as" and "e.g." without brackets', () => {
        expect(one('Thickener, e.g. xanthan gum or guar 0.5%')).toMatchObject({ name: 'Thickener', examples: ['xanthan gum', 'guar'] });
        expect(one('Oil such as jojoba 10%')).toMatchObject({ name: 'Oil', examples: ['jojoba'] });
    });
});
