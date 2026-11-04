import { describe, expect, it, vi } from 'vitest';
import { fitsRole, matchLine, roleSearch, suggestByRole } from './lineMatching';
import { importFilters, loadImportCandidates, roleFilters } from './importCandidates';
import { buildImportedFormula, type ImportLine } from './importFormula';
import { parseRecipeText } from './recipeParser';
import { LIBRARY, row, type Row } from './starterLibraryFixture';

vi.mock('./supabase', () => ({ supabase: {} }));

// A shampoo-ish library: the fixture plus the ingredients a copied sulfate-free shampoo recipe talks about
const EXTRA: Row[] = [
    row('Sodium Cocoyl Glutamate', 'SCG (Sodium Cocoyl Glutamate)', 'Surfactant (Anionic)', 5, 25, 'water', { ionic_charge: 'anionic' }),
    row('Sodium Coco-Sulfate', 'Sodium Coco Sulfate', 'Surfactant (Anionic)', 5, 25, 'water', { ionic_charge: 'anionic' }),
    row('Guar Hydroxypropyltrimonium Chloride', 'Guar HPTC', 'Conditioning Agent', 0.1, 1, 'water'),
    row('Polyquaternium-10', 'Polyquaternium-10', 'Conditioning Agent', 0.1, 1, 'water'),
    row('Tetrasodium EDTA', 'Tetrasodium EDTA', 'Chelating Agent', 0.05, 0.2, 'water'),
    row('Citric Acid', 'Citric Acid (50% solution)', 'pH Adjuster', 0.01, 1, 'water'),
    row('Phenoxyethanol', 'Phenoxyethanol', 'Preservative', 0.5, 1, 'water'),
    row('Lavandula Angustifolia Oil', 'Lavender Essential Oil', 'Fragrance / Active', 0.1, 1, 'oil'),
    row('Citrus Limon Peel Oil', 'Lemon Essential Oil (Cold-Pressed)', 'Fragrance / Active', 0.1, 1, 'oil'),
    row('Parfum', 'Fragrance Oil (Fresh Linen)', 'Fragrance', 0.1, 1, 'oil'),
];
const RICH = [...LIBRARY, ...EXTRA];

const RECIPE = [
    '• Deionized Water (Aqua): Q.S. (Quantum Satis /, roughly 50–70%)',
    '• Primary Surfactant (Anionic - e.g., Sodium Cocoyl Glutamate or Sodium Coco Sulfate): 15% – 30%',
    '• Secondary / Amphoteric Surfactant (e.g., Cocamidopropyl Betaine): 5% – 15%',
    '• Non-Ionic Surfactant / Foam Booster (e.g., Coco-Glucoside): 2% – 5%',
    '• Humectant / Moisturizer (e.g., Glycerin or Panthenol / Pro-Vitamin B5): 1% – 5%',
    '• Conditioning Agent / Thickener (e.g., Guar Hydroxypropyltrimonium Chloride or Polyquaternium-10): 0.2% – 1%',
    '• Chelating Agent (e.g., Tetrasodium EDTA or Sodium Phytate): 0.05% – 0.2%',
    '• Preservative (e.g., Phenoxyethanol or a broad-spectrum cosmetic preservative): 0.5% – 1%',
    '• Fragrance / Essential Oils & Colorants (Optional): 0.2% – 1%',
    '• pH Adjuster (Citric Acid solution):',
].join(String.fromCharCode(10));

const parsed = parseRecipeText(RECIPE).lines;
const best = (i: number) => matchLine(parsed[i], RICH)[0]?.row.inci_name;

describe('matching the lines of a recipe copied from the web', () => {
    it('finds the ingredients named in brackets and after "e.g."', () => {
        expect(best(0)).toBe('Aqua');
        expect(best(1)).toBe('Sodium Cocoyl Glutamate');
        expect(best(2)).toBe('Cocamidopropyl Betaine');
        expect(best(3)).toBe('Coco-Glucoside');
        expect(best(4)).toBe('Glycerin');
        expect(best(5)).toBe('Guar Hydroxypropyltrimonium Chloride');
        expect(best(6)).toBe('Tetrasodium EDTA');
        expect(best(7)).toBe('Phenoxyethanol');
        expect(best(9)).toBe('Citric Acid');
    });

    it('offers every example that exists in the library, so any can be picked', () => {
        const first = matchLine(parsed[1], RICH).map(c => c.row.inci_name);
        expect(first).toContain('Sodium Cocoyl Glutamate');
        expect(first).toContain('Sodium Coco-Sulfate');
        expect(matchLine(parsed[4], RICH).map(c => c.row.inci_name)).toEqual(expect.arrayContaining(['Glycerin', 'Panthenol']));
    });

    it('does not guess for a line that names no ingredient', () => {
        const fragrance = matchLine(parsed[8], RICH);
        expect(fragrance.filter(c => c.confidence !== 'possible')).toEqual([]);
    });
});

describe('suggesting by kind of ingredient', () => {
    it('knows what kind of ingredient a line asks for', () => {
        expect(roleSearch(parsed[8])?.labels).toEqual(['fragrance or essential oil']);
        expect(roleSearch(parsed[4])?.labels).toEqual(['humectant']);
        expect(roleSearch(parsed[5])?.labels).toEqual(['conditioning agent', 'thickener']);
        expect(roleSearch(parsed[1])?.labels).toEqual(['anionic surfactant']);
        expect(roleSearch(parsed[3])?.labels).toEqual(['non-ionic surfactant']);
        expect(roleSearch({ name: 'Glycerin' })).toBeNull();
        expect(roleSearch({ name: 'Water' })).toBeNull();
    });

    it('suggests fragrances and essential oils for a fragrance line', () => {
        const names = suggestByRole(parsed[8], RICH).map(s => s.row.trade_name);
        expect(names).toEqual(expect.arrayContaining(['Lavender Essential Oil', 'Lemon Essential Oil (Cold-Pressed)', 'Fragrance Oil (Fresh Linen)']));
        expect(names).not.toContain('Phenoxyethanol');
        expect(suggestByRole(parsed[8], RICH).every(s => s.confidence === 'possible' && s.suggestedFor === 'fragrance or essential oil')).toBe(true);
    });

    it('puts the ingredients you own first, and never offers more than the limit', () => {
        const lemon = RICH.find(r => r.trade_name?.startsWith('Lemon Essential Oil'))!;
        expect(suggestByRole(parsed[8], RICH, { stashIds: new Set([lemon.id]) })[0].row.id).toBe(lemon.id);
        expect(suggestByRole(parsed[8], RICH, { limit: 2 })).toHaveLength(2);
    });

    it('keeps an anionic surfactant line to anionic surfactants', () => {
        const names = suggestByRole({ name: 'Primary Surfactant', hint: 'Anionic' }, RICH).map(s => s.row.inci_name);
        expect(names).toEqual(expect.arrayContaining(['Sodium Cocoyl Glutamate']));
        expect(names).not.toContain('Coco-Glucoside');
        expect(names).not.toContain('Cocamidopropyl Betaine');
    });

    it('suggests nothing for an ordinary ingredient name', () => {
        expect(suggestByRole({ name: 'Glycerin' }, RICH)).toEqual([]);
    });

    it('recognises what fits a kind by function or by name', () => {
        const search = roleSearch({ name: 'Essential oil' })!;
        expect(fitsRole(row('X', 'Rose Essential Oil', 'Other', 0, 1, 'oil'), search)).toBe(true);
        expect(fitsRole(row('X', 'Rose Water', 'Hydrosol', 0, 1, 'water'), search)).toBe(false);
    });
});

describe('from the recipe to a formula', () => {
    const lines: ImportLine<Row>[] = parsed.map((p, i) => ({
        parsed: p,
        row: i === 8 ? null : (matchLine(p, RICH).find(c => c.confidence !== 'possible')?.row ?? null),
    }));
    const formula = buildImportedFormula(lines);

    it('uses the middle of each range, and lets water take the rest', () => {
        const by = Object.fromEntries(formula.ingredients.map(i => [i.inci_name, i.percentage]));
        expect(by['Sodium Cocoyl Glutamate']).toBe(22.5);
        expect(by['Cocamidopropyl Betaine']).toBe(10);
        expect(by['Coco-Glucoside']).toBe(3.5);
        expect(by.Glycerin).toBe(3);
        expect(by.Phenoxyethanol).toBe(0.75);
        expect(by.Aqua).toBeGreaterThan(50);
        expect(Math.round(formula.ingredients.reduce((s, i) => s + i.percentage, 0) * 100) / 100).toBe(100);
    });

    it('says where each number came from', () => {
        const at = (inci: string) => formula.sources[formula.ingredients.findIndex(i => i.inci_name === inci)];
        expect(at('Sodium Cocoyl Glutamate')).toBe('range');
        expect(at('Aqua')).toBe('remainder');
        expect(at('Citric Acid')).toBe('suggested');
    });
});

describe('what is asked of the library', () => {
    it('searches for the examples, not for the description', () => {
        const values = importFilters(parsed[1]).map(f => f.value);
        expect(values).toContain('Sodium Cocoyl Glutamate');
        expect(values.some(v => /primary|surfactant/i.test(v))).toBe(false);
    });

    it('asks for fragrances by function and essential oils by name', () => {
        const filters = roleFilters(roleSearch(parsed[8])!);
        expect(filters.map(f => `${f.column}:${f.value}`)).toEqual(expect.arrayContaining(['function:%fragrance%', 'trade_name:%essential oil%']));
    });

    it('fetches the kind once however many lines ask for it, plus what you own', async () => {
        const asked: string[] = [];
        const client = {
            from: (table: string) => {
                const b: Record<string, unknown> = {};
                for (const m of ['select', 'order', 'limit', 'eq']) b[m] = () => b;
                b.or = (f: string) => { asked.push(f); return b; };
                b.in = (_col: string, ids: string[]) => { asked.push(`owned:${ids.length}`); return b; };
                b.then = (resolve: (v: unknown) => void) => resolve({ data: table === 'user_stash' ? [{ ingredient_id: 'owned-1' }] : [], error: null });
                return b;
            },
        };
        const lines = parseRecipeText('Fragrance 0.5%\nEssential oil 0.2%').lines;
        await loadImportCandidates(lines, 'u1', client as never);
        const roleAsks = asked.filter(a => a.includes('function.ilike'));
        expect(roleAsks).toHaveLength(2);       // one for the kind: the first few by name, and the ones you own
        expect(asked).toContain('owned:1');
    });
});
