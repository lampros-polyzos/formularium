import { describe, expect, it } from 'vitest';
import { analyzeFormula, parseFunction, type CatalogIngredient, type FormulaLine } from './substitutions';

const ing = (id: string, overrides: Partial<CatalogIngredient>): CatalogIngredient => ({
    id,
    inci_name: id,
    trade_name: id,
    function: 'Emollient',
    min_usage_pct: 1,
    max_usage_pct: 100,
    solubility: 'oil',
    ionic_charge: 'non-ionic',
    physical_state: 'liquid',
    is_vegan: true,
    ...overrides,
});

const water = ing('water', { inci_name: 'Aqua', function: 'Solvent', solubility: 'water' });
const sheaRaw = ing('shea-raw', { inci_name: 'Butyrospermum Parkii Butter [Raw]', function: 'Butter', physical_state: 'solid' });
const sheaRefined = ing('shea-refined', { inci_name: 'Butyrospermum Parkii Butter [Refined]', function: 'Butter', physical_state: 'solid' });
const mango = ing('mango', { inci_name: 'Mangifera Indica Seed Butter', function: 'Butter', physical_state: 'solid' });
const jojoba = ing('jojoba', { inci_name: 'Simmondsia Chinensis Seed Oil', function: 'Carrier Oil' });
const lanolin = ing('lanolin', { inci_name: 'Lanolin', function: 'Emollient / Skin Protectant', is_vegan: false, physical_state: 'solid' });
const citric = ing('citric', { function: 'pH Adjuster (Acid)', solubility: 'water', physical_state: 'powder', min_usage_pct: 0.01, max_usage_pct: 1.5 });
const arginine = ing('arginine', { function: 'pH Adjuster (Base)', solubility: 'water', physical_state: 'powder', min_usage_pct: 0.01, max_usage_pct: 1.5 });
const lactic = ing('lactic', { function: 'Active (AHA) / pH Adjuster', solubility: 'water', min_usage_pct: 0.5, max_usage_pct: 10 });
const sci = ing('sci', { function: 'Surfactant (Anionic)', solubility: 'water', ionic_charge: 'anionic', min_usage_pct: 5, max_usage_pct: 60 });
const pq7 = ing('pq7', { function: 'Conditioning Agent', solubility: 'water', ionic_charge: 'cationic' });
const pq10 = ing('pq10', { function: 'Conditioning Polymer', solubility: 'water', ionic_charge: 'non-ionic' });

const catalog = [water, sheaRaw, sheaRefined, mango, jojoba, lanolin, citric, arginine, lactic, sci, pq7, pq10];

const line = (ingredient: CatalogIngredient, percentage: number, phase: FormulaLine['phase'] = 'B'): FormulaLine =>
    ({ ingredient, percentage, phase });

describe('parseFunction', () => {
    it('separates roles and qualifiers', () => {
        const parsed = parseFunction('Surfactant (Anionic)');
        expect([...parsed.primary]).toEqual(['surfactant']);
        expect(parsed.qualifiers.has('anionic')).toBe(true);
    });

    it('does not treat a preservative booster as a preservative', () => {
        const parsed = parseFunction('Solvent / Preservative Booster');
        expect(parsed.all.has('preservative')).toBe(false);
        expect(parsed.all.has('preservative_booster')).toBe(true);
    });
});

describe('analyzeFormula', () => {
    it('classifies stock and computes the shortfall with overage', () => {
        const formula = [line(water, 80, 'A'), line(sheaRaw, 10), line(jojoba, 10)];
        const stash = [
            { ingredient_id: 'jojoba', amount_left_g: 4 },
            { ingredient_id: 'jojoba', amount_left_g: 2 },
        ];
        const [w, shea, jo] = analyzeFormula(formula, catalog, stash, 100, null);

        expect(w.status).toBe('assumed');
        expect(shea.status).toBe('missing');
        expect(shea.buyG).toBe(11.5);
        expect(jo.status).toBe('low');
        expect(jo.haveG).toBe(6);
        expect(jo.buyG).toBe(4.6); // (10 - 6) g + 15%
    });

    it('ranks another grade of the same ingredient first', () => {
        const [item] = analyzeFormula([line(sheaRaw, 10)], catalog, [], 100, null);
        expect(item.marketOptions[0].ingredient.id).toBe('shea-refined');
        expect(item.marketOptions[0].matchLabel).toBe('Same ingredient, different grade');
    });

    it('does not call a blend the same ingredient as one of its parts just because they share a CAS number', () => {
        const pure = ing('phenoxy', { inci_name: 'Phenoxyethanol', trade_name: 'Phenoxyethanol', function: 'Preservative', cas_number: '122-99-6' });
        const blend = ing('optiphen', { inci_name: 'Phenoxyethanol (and) Caprylyl Glycol', trade_name: 'Optiphen', function: 'Preservative', cas_number: '122-99-6, 1117-86-8' });
        const other = ing('phenoxy2', { inci_name: 'Phenoxyethanol', trade_name: 'Phenoxyethanol (Other Supplier)', function: 'Preservative', cas_number: '122-99-6' });
        const [item] = analyzeFormula([line(pure, 1)], [pure, blend, other], [], 100, null);
        const byId = Object.fromEntries(item.marketOptions.map(o => [o.ingredient.id, o]));
        expect(byId.phenoxy2.matchLabel).toBe('Same ingredient, different grade');
        expect(byId.optiphen?.matchLabel).not.toBe('Same ingredient, different grade');
    });

    it('offers stash substitutes only when there is enough of them', () => {
        const stash = [{ ingredient_id: 'mango', amount_left_g: 50 }, { ingredient_id: 'jojoba', amount_left_g: 2 }];
        const [item] = analyzeFormula([line(sheaRaw, 10)], catalog, stash, 100, null);
        expect(item.stashOptions.map(o => o.ingredient.id)).toEqual(['mango']);
        expect(item.marketOptions.some(o => o.ingredient.id === 'mango')).toBe(false);
    });

    it('warns when a substitute breaks a vegan formula', () => {
        const [item] = analyzeFormula([line(jojoba, 10)], catalog, [], 100, null);
        const lanolinOption = item.marketOptions.find(o => o.ingredient.id === 'lanolin');
        expect(lanolinOption?.warnings).toContain('Not vegan');
    });

    it('never swaps an acidic pH adjuster for a basic one', () => {
        const [item] = analyzeFormula([line(citric, 0.5, 'C')], catalog, [], 100, null);
        const ids = item.marketOptions.map(o => o.ingredient.id);
        expect(ids).not.toContain('arginine');
        expect(ids).toContain('lactic');
    });

    it('clamps the suggested percentage to the substitute usage range', () => {
        const [item] = analyzeFormula([line(citric, 0.2, 'C')], catalog, [], 100, null);
        const lacticOption = item.marketOptions.find(o => o.ingredient.id === 'lactic');
        expect(lacticOption?.percentage).toBe(0.5);
    });

    it('flags cationic substitutes in formulas with anionic surfactants', () => {
        const formula = [line(sci, 15, 'A'), line(pq10, 0.5, 'A')];
        const [, item] = analyzeFormula(formula, catalog, [], 100, null);
        const pq7Option = item.marketOptions.find(o => o.ingredient.id === 'pq7');
        expect(pq7Option?.warnings.some(w => w.includes('clash with sci'))).toBe(true);
    });
});
