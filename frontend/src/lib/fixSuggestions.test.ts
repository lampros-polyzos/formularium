import { describe, expect, it } from 'vitest';
import { suggestIngredients, type SuggestionContext } from './fixSuggestions';
import type { CatalogIngredient } from './substitutions';

// Rows mirror the Formularium ingredient library
const ing = (id: string, inci: string, trade: string, fn: string, extra: Partial<CatalogIngredient> = {}): CatalogIngredient => ({
    id, inci_name: inci, trade_name: trade, function: fn, min_usage_pct: null, max_usage_pct: null, ...extra,
});

const CATALOG: CatalogIngredient[] = [
    ing('pe', 'Phenoxyethanol (and) Ethylhexylglycerin', 'Euxyl PE 9010', 'Preservative', { min_usage_pct: 0.5, max_usage_pct: 1.1, optimal_ph_min: 3, optimal_ph_max: 12, cost_category: 'medium', is_vegan: true, cosmos_compliant: false }),
    ing('k712', 'Sodium Benzoate (and) Potassium Sorbate', 'Euxyl K712', 'Preservative', { min_usage_pct: 0.5, max_usage_pct: 1.5, optimal_ph_min: 3, optimal_ph_max: 5.5, cost_category: 'low', is_vegan: true, cosmos_compliant: true }),
    ing('geo', 'Benzyl Alcohol, Salicylic Acid, Glycerin, Sorbic Acid', 'Geogard ECT', 'Preservative', { min_usage_pct: 0.6, max_usage_pct: 1, optimal_ph_min: 3, optimal_ph_max: 8, cost_category: 'medium', is_vegan: true, cosmos_compliant: true }),
    ing('sorb', 'Potassium Sorbate', 'Potassium Sorbate', 'Preservative (Antifungal)', { optimal_ph_min: 3, optimal_ph_max: 5.5, cost_category: 'low', is_vegan: true, cosmos_compliant: true }),
    ing('dha', 'Sodium Dehydroacetate', 'Sodium Dehydroacetate', 'Preservative (Antifungal)', { optimal_ph_min: 3, optimal_ph_max: 6.5, cost_category: 'low' }),
    ing('pent', 'Pentylene Glycol', 'Pentylene Glycol', 'Solvent / Preservative Booster', { cost_category: 'medium' }),
    ing('olivem', 'Cetearyl Olivate, Sorbitan Olivate', 'Olivem 1000', 'Emulsifier', { ionic_charge: 'non-ionic', cost_category: 'medium', is_vegan: true }),
    ing('btms', 'Behentrimonium Methosulfate', 'BTMS-50', 'Cationic Emulsifier', { ionic_charge: 'cationic' }),
    ing('cetyl', 'Cetyl Alcohol', 'Cetyl Alcohol', 'Co-emulsifier / Thickener'),
    ing('edta', 'Disodium EDTA', 'Disodium EDTA', 'Chelating Agent', { cost_category: 'low', is_vegan: true, cosmos_compliant: false }),
    ing('phytate', 'Sodium Phytate', 'Sodium Phytate', 'Chelating Agent', { cost_category: 'low', is_vegan: true, cosmos_compliant: true }),
    ing('toco', 'Tocopherol', 'Vitamin E', 'Antioxidant', { cost_category: 'medium' }),
    ing('tocoac', 'Tocopheryl Acetate', 'Vitamin E Acetate', 'Antioxidant / Active'),
    ing('aqua', 'Aqua', 'Distilled Water', 'Solvent', { solubility: 'water', cost_category: 'low' }),
    ing('jojoba', 'Simmondsia Chinensis Seed Oil', 'Jojoba Oil', 'Carrier Oil', { solubility: 'oil' }),
];

// Ingredients added to the library later on; only the tests about them use these
const ADDED: CatalogIngredient[] = [
    ing('phenoxy', 'Phenoxyethanol', 'Phenoxyethanol', 'Preservative', { min_usage_pct: 0.3, max_usage_pct: 1, optimal_ph_min: 3, optimal_ph_max: 10, cost_category: 'low', is_vegan: true, cosmos_compliant: false }),
    ing('benzyl', 'Benzyl Alcohol', 'Benzyl Alcohol', 'Preservative', { optimal_ph_min: 3, optimal_ph_max: 8, cost_category: 'low' }),
    ing('sorbic', 'Sorbic Acid', 'Sorbic Acid', 'Preservative (Antifungal)', { optimal_ph_min: 3, optimal_ph_max: 6, cost_category: 'low' }),
    ing('benzoic', 'Benzoic Acid', 'Benzoic Acid', 'Preservative', { optimal_ph_min: 3, optimal_ph_max: 5, cost_category: 'low' }),
    ing('gcap', 'Glyceryl Caprylate', 'Glyceryl Caprylate', 'Preservative Booster / Emollient', { cost_category: 'medium' }),
    ing('pgpr', 'Polyglyceryl-3 Polyricinoleate', 'Polyglyceryl-3 Polyricinoleate (PGPR)', 'Emulsifier (W/O)', { ionic_charge: 'non-ionic', cost_category: 'low' }),
    ing('ssl', 'Sodium Stearoyl Lactylate', 'Sodium Stearoyl Lactylate (SSL)', 'Emulsifier', { ionic_charge: 'anionic', cost_category: 'low' }),
];
const WITH_ADDED = [...CATALOG, ...ADDED];

const ctx = (over: Partial<SuggestionContext> = {}): SuggestionContext => ({
    targetPh: 5.5, claims: [], inFormulaIds: new Set(), stashIds: new Set(), ...over,
});
const ids = (list: ReturnType<typeof suggestIngredients>) => list.map(s => s.ingredient.id);

describe('suggestIngredients', () => {
    it('suggests plain phenoxyethanol as a broad-spectrum preservative, but not benzyl alcohol, sorbic acid or a booster on their own', () => {
        const list = ids(suggestIngredients('preservative', WITH_ADDED, ctx({ targetPh: 5 }), 20));
        expect(list).toContain('phenoxy');
        expect(list).not.toContain('benzyl'); // covers bacteria far better than mold
        expect(list).not.toContain('sorbic'); // mold and yeast only
        expect(list).not.toContain('gcap'); // a booster
    });

    it('offers benzoic acid only where the pH is low enough for it', () => {
        expect(ids(suggestIngredients('preservative', WITH_ADDED, ctx({ targetPh: 4.5 }), 20))).toContain('benzoic');
        expect(ids(suggestIngredients('preservative', WITH_ADDED, ctx({ targetPh: 5.5 }), 20))).not.toContain('benzoic');
    });

    it('suggests ordinary emulsifiers for a lotion, never a water-in-oil emulsifier', () => {
        const list = ids(suggestIngredients('emulsifier', WITH_ADDED, ctx(), 20));
        expect(list).toEqual(expect.arrayContaining(['olivem', 'ssl']));
        expect(list).not.toContain('pgpr');
        expect(list).not.toContain('btms');
    });

    it('offers only broad-spectrum preservatives, never boosters or single-sided ones', () => {
        const list = ids(suggestIngredients('preservative', CATALOG, ctx({ targetPh: 5 })));
        expect(list).toEqual(expect.arrayContaining(['pe', 'k712', 'geo']));
        expect(list).not.toContain('sorb');
        expect(list).not.toContain('dha');
        expect(list).not.toContain('pent');
    });

    it('drops preservatives that stop working at the target pH', () => {
        const list = ids(suggestIngredients('preservative', CATALOG, ctx({ targetPh: 6.5 })));
        expect(list).not.toContain('k712'); // benzoate/sorbate fails above pH 5.5
        expect(list).toContain('pe');
    });

    it('ranks what is in your stash first, then cheaper ones', () => {
        const stash = ids(suggestIngredients('preservative', CATALOG, ctx({ targetPh: 5, stashIds: new Set(['pe']) })));
        expect(stash[0]).toBe('pe');
        const byCost = ids(suggestIngredients('preservative', CATALOG, ctx({ targetPh: 5 })));
        expect(byCost[0]).toBe('k712'); // the only low-cost broad option
    });

    it('respects the claims the formula targets', () => {
        const cosmos = ids(suggestIngredients('chelator', CATALOG, ctx({ claims: ['COSMOS'] })));
        expect(cosmos).toEqual(['phytate']);
        const both = ids(suggestIngredients('chelator', CATALOG, ctx()));
        expect(both).toEqual(expect.arrayContaining(['edta', 'phytate']));
    });

    it('never suggests what is already in the formula', () => {
        const list = ids(suggestIngredients('chelator', CATALOG, ctx({ inFormulaIds: new Set(['edta']) })));
        expect(list).toEqual(['phytate']);
    });

    it('skips cationic emulsifiers and co-emulsifiers when an emulsifier is missing', () => {
        expect(ids(suggestIngredients('emulsifier', CATALOG, ctx()))).toEqual(['olivem']);
    });

    it('treats vitamin E as an antioxidant but not its acetate, which does not protect oils', () => {
        expect(ids(suggestIngredients('antioxidant', CATALOG, ctx()))).toEqual(['toco']);
    });

    it('finds water and oils', () => {
        expect(ids(suggestIngredients('water', CATALOG, ctx()))).toEqual(['aqua']);
        expect(ids(suggestIngredients('oil', CATALOG, ctx()))).toEqual(['jojoba']);
    });

    it('explains each suggestion', () => {
        const [first] = suggestIngredients('preservative', CATALOG, ctx({ targetPh: 5, stashIds: new Set(['pe']), claims: ['VEGAN'] }));
        expect(first.reasons).toEqual(expect.arrayContaining(['In your stash', 'Vegan', 'Works at pH 5']));
    });

    it('limits the list and merges duplicate grades of the same ingredient', () => {
        const many = Array.from({ length: 8 }, (_, n) => ing(`p${n}`, `Phenoxyethanol ${n}`, `Grade ${n}`, 'Preservative'));
        expect(suggestIngredients('preservative', many, ctx(), 3)).toHaveLength(3);
        const grades = [ing('a', 'Disodium EDTA', 'EDTA A', 'Chelating Agent'), ing('b', 'Disodium EDTA', 'EDTA B', 'Chelating Agent')];
        expect(suggestIngredients('chelator', grades, ctx())).toHaveLength(1);
    });

    it('returns nothing, rather than failing, when the catalog has no match', () => {
        expect(suggestIngredients('photostabilizer', CATALOG, ctx())).toEqual([]);
        expect(suggestIngredients('preservative', [], ctx())).toEqual([]);
    });
});
