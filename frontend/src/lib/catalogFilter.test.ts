import { describe, expect, it } from 'vitest';
import { filterMatches, matchesAny, toOrFilter, type CatalogFilter } from './catalogFilter';
import { CATEGORY_FILTERS, suggestIngredients } from './fixSuggestions';
import {
    ROLE_KEYWORDS, ROLE_PATTERNS, findSubstitutes, indexStash, linesNeedingSubstitutes, parseFunction, substituteFilters,
    type CatalogIngredient, type FormulaLine,
} from './substitutions';
import type { FixCategory } from '../types/fixes';

describe('toOrFilter', () => {
    it('writes quoted, comma-separated filters and drops repeats', () => {
        const a: CatalogFilter = { column: 'function', op: 'ilike', value: '%emulsifier%' };
        const b: CatalogFilter = { column: 'inci_name', op: 'eq', value: 'aqua' };
        expect(toOrFilter([a, b, a])).toBe('function.ilike."%emulsifier%",inci_name.eq."aqua"');
    });

    it('keeps names with commas, brackets and quotes from breaking the filter', () => {
        const odd: CatalogFilter = { column: 'inci_name', op: 'ilike', value: 'Aqua (and), "Glycerin" [Raw]%' };
        expect(toOrFilter([odd])).toBe('inci_name.ilike."Aqua (and), \\"Glycerin\\" [Raw]%"');
    });

    it('is empty for no filters', () => {
        expect(toOrFilter([])).toBe('');
    });
});

describe('filterMatches (the test twin of the database filter)', () => {
    it('ignores case and treats % as "anything"', () => {
        const f: CatalogFilter = { column: 'function', op: 'ilike', value: '%EMULSIF%' };
        expect(filterMatches(f, { function: 'Co-Emulsifier / Thickener' })).toBe(true);
        expect(filterMatches({ ...f, value: 'emulsif%' }, { function: 'Co-Emulsifier' })).toBe(false);
        expect(filterMatches({ ...f, value: 'co-%' }, { function: 'Co-Emulsifier' })).toBe(true);
    });

    it('does not treat regex characters in a name as special', () => {
        const f: CatalogFilter = { column: 'inci_name', op: 'ilike', value: 'Aqua (water)%' };
        expect(filterMatches(f, { inci_name: 'Aqua (Water) [Distilled]' })).toBe(true);
        expect(filterMatches(f, { inci_name: 'Aqua Water' })).toBe(false);
    });

    it('never matches a missing value, and eq is exact', () => {
        expect(filterMatches({ column: 'function', op: 'ilike', value: '%' }, { function: null })).toBe(false);
        expect(filterMatches({ column: 'inci_name', op: 'eq', value: 'aqua' }, { inci_name: 'Aqua' })).toBe(false);
    });
});

describe('role keywords', () => {
    it('cover every role, and every word in each role\'s pattern', () => {
        for (const [role, pattern] of ROLE_PATTERNS) {
            expect(ROLE_KEYWORDS[role], `keywords for ${role}`).toBeTruthy();
            if (pattern.source.includes('(')) continue; // lookaheads (the two pH adjusters) are checked below
            const words = pattern.source.split('|').map(w => w.replace(/\\/g, ''));
            for (const word of words) expect(ROLE_KEYWORDS[role], `${role} should search for "${word}"`).toContain(word);
        }
        expect(ROLE_KEYWORDS.ph_acid).toContain('ph adjuster');
        expect(ROLE_KEYWORDS.ph_base).toContain('ph adjuster');
    });

    it('only name roles that exist, and each keyword really triggers a role', () => {
        const roles = new Set(ROLE_PATTERNS.map(([role]) => role));
        for (const [role, words] of Object.entries(ROLE_KEYWORDS)) {
            expect(roles.has(role), role).toBe(true);
            for (const word of words) expect(parseFunction(word).all.size, `"${word}"`).toBeGreaterThan(0);
        }
    });
});

// ---------------------------------------------------------------------------------------------
// The property that matters: narrowing the catalog never changes what the app would have offered.
// ---------------------------------------------------------------------------------------------

let n = 0;
const ing = (inci_name: string, trade_name: string, fnText: string, extra: Partial<CatalogIngredient> = {}): CatalogIngredient => ({
    id: `i${++n}`, inci_name, trade_name, function: fnText, min_usage_pct: 0.5, max_usage_pct: 5, solubility: 'water', ...extra,
});

const CATALOG: CatalogIngredient[] = [
    ing('Aqua', 'Distilled Water', 'Solvent', { max_usage_pct: 100 }),
    ing('Aqua (Water) [Distilled]', 'Water Grade 2', 'Solvent', { max_usage_pct: 100 }),
    ing('Rosa Damascena Flower Water', 'Rose Hydrosol', 'Solvent / Soothing Active'),
    ing('Cucumis Sativus Fruit Juice', 'Cucumber Juice', 'Active (Hydrating)'),
    ing('Aloe Barbadensis Leaf Juice', 'Aloe Vera Juice', 'Active (Soothing / Hydrating)'),
    ing('Hamamelis Virginiana Distillate', 'Witch Hazel Distillate', 'Astringent'),
    ing('Glycerin', 'Glycerin 99%', 'Humectant', { max_usage_pct: 10 }),
    ing('Glycerin', 'Glycerin USP', 'Humectant', { max_usage_pct: 10 }),
    ing('Propanediol', 'Zemea', 'Humectant / Solvent'),
    ing('Sodium PCA', 'NaPCA', 'Humectant / Osmolyte'),
    ing('Panthenol', 'Provitamin B5', 'Active (Soothing / Hydrating)'),
    ing('Allantoin', 'Allantoin', 'Active (Soothing)'),
    ing('Bisabolol', 'Alpha-Bisabolol', 'Active (Soothing / Anti-inflammatory)'),
    ing('Niacinamide', 'Vitamin B3', 'Active (Brightening)', { optimal_ph_min: 5, optimal_ph_max: 7 }),
    ing('Tranexamic Acid', 'TXA', 'Active (Brightening)'),
    ing('Retinol', 'Retinol 50C', 'Active (Anti-aging)'),
    ing('Steareth-2', 'Brij S2', 'Emulsifier (W/O)', { solubility: 'oil' }),
    ing('Steareth-20', 'Brij S20', 'Emulsifier (O/W)'),
    ing('Cetearyl Olivate (and) Sorbitan Olivate', 'Olivem 1000', 'Emulsifier (O/W)'),
    ing('Polysorbate 20', 'Tween 20', 'Solubilizer / Emulsifier (O/W)'),
    ing('Cetrimonium Chloride', 'Dehyquart A', 'Emulsifier (Cationic) / Conditioning', { ionic_charge: 'cationic' }),
    ing('Glyceryl Stearate', 'Lexemul', 'Co-emulsifier / Thickener', { solubility: 'oil' }),
    ing('Cetyl Alcohol', 'Cetyl Alcohol NF', 'Co-emulsifier / Thickener', { solubility: 'oil' }),
    ing('Cetearyl Alcohol', 'Lanette O', 'Co-emulsifier / Thickener', { solubility: 'oil' }),
    ing('Sodium Cocoyl Isethionate', 'SCI', 'Surfactant (Anionic)', { ionic_charge: 'anionic' }),
    ing('Cocamidopropyl Betaine', 'CAPB', 'Surfactant (Amphoteric)'),
    ing('Xanthan Gum', 'Keltrol', 'Rheology Modifier / Thickener'),
    ing('Carbomer', 'Carbopol 940', 'Rheology Modifier (Gelling)'),
    ing('Hydroxyethylcellulose', 'Natrosol', 'Thickener'),
    ing('Prunus Amygdalus Dulcis Oil', 'Sweet Almond Oil', 'Carrier Oil (Emollient)', { solubility: 'oil' }),
    ing('Simmondsia Chinensis Seed Oil', 'Jojoba Oil', 'Carrier Oil', { solubility: 'oil' }),
    ing('Argania Spinosa Kernel Oil [Raw]', 'Argan Oil Raw', 'Carrier Oil', { solubility: 'oil' }),
    ing('Argania Spinosa Kernel Oil [Refined]', 'Argan Oil Refined', 'Carrier Oil', { solubility: 'oil' }),
    ing('Butyrospermum Parkii Butter', 'Shea Butter', 'Butter (Emollient)', { solubility: 'oil' }),
    ing('Squalane', 'Squalane (olive)', 'Emollient', { solubility: 'oil' }),
    ing('Caprylic/Capric Triglyceride', 'MCT Oil', 'Emollient', { solubility: 'oil' }),
    ing('Cera Alba', 'Beeswax', 'Wax / Thickener', { solubility: 'oil' }),
    ing('Dimethicone', 'DM 350', 'Skin Protectant', { solubility: 'oil', is_silicone: true }),
    ing('Tocopherol', 'Vitamin E', 'Antioxidant', { solubility: 'oil' }),
    ing('Tocopheryl Acetate', 'Vitamin E Acetate', 'Antioxidant', { solubility: 'oil' }),
    ing('Ascorbyl Glucoside', 'AA2G', 'Antioxidant / Active (Brightening)'),
    ing('Ferulic Acid', 'Ferulic Acid', 'Antioxidant (Stabilizer)'),
    ing('Disodium EDTA', 'Dissolvine', 'Chelating Agent'),
    ing('Sodium Phytate', 'Dermofeel PA-3', 'Chelating Agent'),
    ing('Phenoxyethanol (and) Ethylhexylglycerin', 'Euxyl PE 9010', 'Preservative'),
    ing('Sodium Benzoate (and) Potassium Sorbate', 'Euxyl K712', 'Preservative', { optimal_ph_min: 3, optimal_ph_max: 5.5 }),
    ing('Potassium Sorbate', 'Potassium Sorbate', 'Preservative'),
    ing('Sodium Dehydroacetate', 'Dehydroacetic Acid Salt', 'Preservative'),
    ing('Benzyl Alcohol (and) Salicylic Acid (and) Sorbic Acid', 'Geogard ECT', 'Preservative'),
    ing('Caprylyl Glycol', 'Lexgard O', 'Preservative Booster'),
    ing('Pentylene Glycol', 'Hydrolite 5', 'Preservative Booster / Humectant'),
    ing('Citric Acid', 'Citric Acid', 'pH Adjuster'),
    ing('Lactic Acid', 'Lactic Acid 80%', 'pH Adjuster / Active (Exfoliant)'),
    ing('Sodium Hydroxide', 'Lye 10% solution', 'pH Adjuster (Base)'),
    ing('Arginine', 'L-Arginine', 'pH Adjuster (Base)'),
    ing('Triethanolamine', 'TEA 99', 'pH Adjuster (Base)'),
    ing('Octocrylene', 'Uvinul N539', 'UV Filter (Photostabilizer)', { solubility: 'oil' }),
    ing('Bis-Ethylhexyloxyphenol Methoxyphenyl Triazine', 'Tinosorb S', 'UV Filter', { solubility: 'oil' }),
    ing('Zinc Oxide', 'Z-Cote', 'UV Filter (Physical)', { solubility: 'oil' }),
    ing('Parfum', 'Lavender Fragrance', 'Fragrance', { solubility: 'oil' }),
    ing('Mica', 'Pearl Mica', 'Colorant'),
    ing('Kaolin', 'White Clay', 'Absorbent'),
    ing('Sodium Chloride', 'Salt', 'Viscosity Builder'),
    ing('Unlabelled Thing', 'Mystery', null as unknown as string),
];

const formulaOf = (original: CatalogIngredient, others: CatalogIngredient[]): FormulaLine[] =>
    [original, ...others].map((ingredient, k) => ({ ingredient, phase: 'A' as const, percentage: k === 0 ? 3 : 5 }));

const key = (r: { stashOptions: { ingredient: { id: string }; score: number }[]; marketOptions: { ingredient: { id: string }; score: number }[] }) =>
    JSON.stringify([r.stashOptions.map(o => [o.ingredient.id, o.score]), r.marketOptions.map(o => [o.ingredient.id, o.score])]);

describe('narrowing the catalog for substitutes', () => {
    // A stash that holds a spread of ingredients, so stash options are exercised too
    const stashIds = CATALOG.filter((_, i) => i % 3 === 0).map(c => c.id);
    const stash = indexStash(stashIds.map(ingredient_id => ({ ingredient_id, amount_left_g: 500 })));

    it('offers exactly the same substitutes for every ingredient in the catalog', () => {
        let compared = 0;
        let withOptions = 0;
        for (const original of CATALOG) {
            const filters = substituteFilters(original);
            const subset = CATALOG.filter(c => matchesAny(filters, c));
            const line = formulaOf(original, [CATALOG[6]])[0];
            const full = findSubstitutes(line, formulaOf(original, [CATALOG[6]]), CATALOG, stash, 100, 5.5);
            const narrowed = findSubstitutes(line, formulaOf(original, [CATALOG[6]]), subset, stash, 100, 5.5);
            expect(key(narrowed), `${original.trade_name} (${original.function})`).toBe(key(full));
            compared++;
            if (key(full) !== '[[],[]]') withOptions++;
        }
        expect(compared).toBe(CATALOG.length);
        expect(withOptions, 'the fixture should produce real substitutes to compare').toBeGreaterThan(30);
    });

    it('is much smaller than the whole catalog for typical ingredients', () => {
        const emulsifier = CATALOG.find(c => c.trade_name === 'Brij S20')!;
        const subset = CATALOG.filter(c => matchesAny(substituteFilters(emulsifier), c));
        expect(subset.length).toBeLessThan(CATALOG.length / 3);
        const jojoba = CATALOG.find(c => c.trade_name === 'Jojoba Oil')!;
        expect(CATALOG.filter(c => matchesAny(substituteFilters(jojoba), c)).length).toBeLessThan(CATALOG.length / 2);
    });

    it('keeps other grades of the same ingredient, even with a bracket in the name', () => {
        const raw = CATALOG.find(c => c.trade_name === 'Argan Oil Raw')!;
        const subset = CATALOG.filter(c => matchesAny(substituteFilters(raw), c));
        expect(subset.map(c => c.trade_name)).toContain('Argan Oil Refined');
    });

    it('asks only for ingredients that share the qualifier when the roles are generic', () => {
        const soother = CATALOG.find(c => c.trade_name === 'Allantoin')!;
        const names = CATALOG.filter(c => matchesAny(substituteFilters(soother), c)).map(c => c.trade_name);
        expect(names).toContain('Alpha-Bisabolol');
        expect(names).not.toContain('Vitamin B3'); // an active, but a brightening one
    });

    it('finds nothing but its own grades for an ingredient with no function', () => {
        const mystery = CATALOG.find(c => c.trade_name === 'Mystery')!;
        expect(CATALOG.filter(c => matchesAny(substituteFilters(mystery), c)).map(c => c.trade_name)).toEqual(['Mystery']);
    });
});

describe('linesNeedingSubstitutes', () => {
    const [water, glycerin, shea] = [CATALOG[0], CATALOG[6], CATALOG.find(c => c.trade_name === 'Shea Butter')!];
    const lines: FormulaLine[] = [water, glycerin, shea].map((ingredient, k) => ({ ingredient, phase: 'A', percentage: [60, 5, 10][k] }));

    it('picks the lines that are missing or short, and never water', () => {
        const stash = [{ ingredient_id: glycerin.id, amount_left_g: 100 }, { ingredient_id: shea.id, amount_left_g: 5 }];
        // glycerin: need 5 g, have 100 (fine). Shea: need 10 g, have 5 (low). Water is assumed.
        expect(linesNeedingSubstitutes(lines, stash, 100).map(l => l.ingredient.trade_name)).toEqual(['Shea Butter']);
        expect(linesNeedingSubstitutes(lines, [], 100).map(l => l.ingredient.trade_name)).toEqual(['Glycerin 99%', 'Shea Butter']);
    });

    it('needs nothing when the stash covers the formula', () => {
        const stash = [glycerin, shea].map(i => ({ ingredient_id: i.id, amount_left_g: 1000 }));
        expect(linesNeedingSubstitutes(lines, stash, 100)).toEqual([]);
    });

    it('treats an untracked amount as enough', () => {
        expect(linesNeedingSubstitutes(lines, [{ ingredient_id: glycerin.id, amount_left_g: null }, { ingredient_id: shea.id, amount_left_g: null }], 100)).toEqual([]);
    });
});

describe('narrowing the catalog for fix suggestions', () => {
    const categories = Object.keys(CATEGORY_FILTERS) as FixCategory[];
    const stashIds = new Set(CATALOG.filter((_, i) => i % 4 === 1).map(c => c.id));
    const ctx = { targetPh: 5, claims: [] as string[], inFormulaIds: new Set<string>(), stashIds };

    it.each(categories)('%s: the same suggestions from the narrowed list as from the whole catalog', (category) => {
        const subset = CATALOG.filter(c => matchesAny(CATEGORY_FILTERS[category], c));
        const full = suggestIngredients(category, CATALOG, ctx, 100).map(s => s.ingredient.id);
        const narrowed = suggestIngredients(category, subset, ctx, 100).map(s => s.ingredient.id);
        expect(narrowed).toEqual(full);
    });

    it('has real suggestions to compare for the main categories', () => {
        for (const category of ['preservative', 'emulsifier', 'chelator', 'antioxidant', 'soother', 'neutralizer', 'photostabilizer', 'water', 'oil', 'ferulic'] as FixCategory[]) {
            expect(suggestIngredients(category, CATALOG, ctx, 100).length, category).toBeGreaterThan(0);
        }
    });

    it('is a small slice of the catalog for each category', () => {
        for (const category of categories) {
            expect(CATALOG.filter(c => matchesAny(CATEGORY_FILTERS[category], c)).length, category).toBeLessThan(CATALOG.length / 2);
        }
    });
});
