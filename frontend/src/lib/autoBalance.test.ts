import { describe, expect, it } from 'vitest';
import { balanceFormula, distribute, niceRound, startingPercentage, usageRange, type BalanceIngredient } from './autoBalance';

// Rows mirror the Formularium ingredient library
const row = (
    inci_name: string, trade_name: string, fn: string, min: number, max: number, solubility: string,
    extra: Partial<BalanceIngredient> = {},
): BalanceIngredient => ({
    inci_name, trade_name, function: fn, min_usage_pct: min, max_usage_pct: max, solubility, percentage: 0, ...extra,
});

const WATER = row('Aqua', 'Distilled Water', 'Solvent', 1, 100, 'water', { default_min_usage: 0, default_max_usage: 100 });
const ALOE_JUICE = row('Aloe Barbadensis Leaf Juice', 'Aloe Vera Juice (1X)', 'Humectant / Active', 1, 100, 'water');
const GLYCERIN = row('Glycerin', 'Vegetable Glycerin 99.5%', 'Humectant', 1, 10, 'water', { default_min_usage: 0, default_max_usage: 100 });
const PROPANEDIOL = row('Propanediol', '1,3-Propanediol (Zemea)', 'Humectant / Solvent', 1, 10, 'water');
const XANTHAN = row('Xanthan Gum', 'Xanthan Gum Soft', 'Rheology Modifier', 0.1, 1, 'water');
const EDTA = row('Disodium EDTA', 'Disodium EDTA', 'Chelating Agent', 0.05, 0.2, 'water', { default_min_usage: 0.1, default_max_usage: 0.2 });
const OLIVEM = row('Cetearyl Olivate, Sorbitan Olivate', 'Olivem 1000', 'Emulsifier', 1.5, 5, 'oil');
const CETYL = row('Cetyl Alcohol', 'Cetyl Alcohol', 'Thickener / Emollient', 1, 5, 'oil');
const SHEA = row('Butyrospermum Parkii Butter', 'Shea Butter (Refined)', 'Butter', 1, 100, 'oil');
const JOJOBA = row('Simmondsia Chinensis Seed Oil', 'Jojoba Oil (Cold Pressed)', 'Carrier Oil', 1, 100, 'oil');
const ROSEHIP = row('Rosa Canina Seed Oil', 'Rosehip Seed Oil (Cold Pressed)', 'Carrier Oil / Active Lipid', 1, 10, 'oil');
const TOCOPHEROL = row('Tocopherol', 'Vitamin E (Mixed Tocopherols 95%)', 'Antioxidant', 0.1, 1, 'oil');
const PE9010 = row('Phenoxyethanol (and) Ethylhexylglycerin', 'Euxyl PE 9010', 'Preservative', 0.5, 1.1, 'dispersible');
const NIACINAMIDE = row('Niacinamide', 'Niacinamide USP', 'Active (Brightening)', 2, 5, 'water');
const PANTHENOL = row('Panthenol', 'DL-Panthenol', 'Humectant / Active', 1, 5, 'water');
const LAVENDER = row('Lavandula Angustifolia (Lavender) Oil', 'Lavender Essential Oil', 'Fragrance / Active', 0.1, 1, 'oil', { is_fragrance: true });
const POLYSORBATE20 = row('Polysorbate 20', 'Polysorbate 20 (Tween 20)', 'Solubilizer', 1, 10, 'water');
const SLES = row('Sodium Laureth Sulfate', 'SLES', 'Surfactant (Anionic)', 5, 20, 'water', { ionic_charge: 'anionic' });
const CAPB = row('Cocamidopropyl Betaine', 'CAPB (30% Active)', 'Surfactant (Amphoteric)', 2, 40, 'water', { ionic_charge: 'amphoteric' });
const SALT = row('Sodium Chloride', 'Sodium Chloride (Salt)', 'Thickener (Surfactant Systems)', 0.1, 3, 'water', { default_min_usage: 0.5, default_max_usage: 2 });
const CITRIC = row('Citric Acid', 'Citric Acid Anhydrous', 'pH Adjuster (Acid)', 0.01, 1.5, 'water');
const CANDELILLA = row('Euphorbia Cerifera (Candelilla) Wax', 'Candelilla Wax', 'Thickener / Wax', 1, 20, 'oil', { default_min_usage: 5, default_max_usage: 15 });
const DEHYMULS = row('Polyglyceryl-2 Dipolyhydroxystearate', 'Dehymuls PGPH', 'Emulsifier', 2, 5, 'oil');
const MGSO4 = row('Magnesium Sulfate', 'Epsom Salt', 'Bath Salt', 1, 100, 'water');

const after = (result: ReturnType<typeof balanceFormula>, ing: BalanceIngredient, list: BalanceIngredient[]) =>
    result.lines[list.indexOf(ing)].after;

describe('helpers', () => {
    it('ignores 0-100 placeholder defaults and uses the usage range instead', () => {
        expect(usageRange(GLYCERIN)).toEqual({ min: 1, max: 10, lo: 1, hi: 10 });
        expect(usageRange(EDTA)).toEqual({ min: 0.05, max: 0.2, lo: 0.1, hi: 0.2 });
    });

    it('rounds to weighable steps', () => {
        expect(niceRound(0.037)).toBe(0.04);
        expect(niceRound(0.83)).toBe(0.85);
        expect(niceRound(4.36)).toBe(4.4);
    });

    it('distributes a total by weight within min/max limits', () => {
        const split = distribute(30, [{ weight: 1, min: 1, max: 10 }, { weight: 1, min: 1, max: 100 }]);
        expect(split[0]).toBe(10);
        expect(split[1]).toBeCloseTo(20);
    });

    it('gives a sensible starting % to a newly added ingredient', () => {
        expect(startingPercentage(PE9010)).toBe(0.95);
        expect(startingPercentage(GLYCERIN)).toBe(3.3);
        expect(startingPercentage(NIACINAMIDE)).toBe(3.5);
    });
});

describe('balanceFormula', () => {
    it('builds an O/W lotion: fixed items, median actives, oils, emulsifier from the oil load, water to 100%', () => {
        const list = [WATER, GLYCERIN, XANTHAN, EDTA, OLIVEM, CETYL, SHEA, JOJOBA, PE9010, NIACINAMIDE, TOCOPHEROL];
        const r = balanceFormula(list, { id: 'ow_lotion', max_oil_phase_percent: 30 });

        expect(r.kind).toBe('ow');
        expect(r.total).toBe(100);
        expect(after(r, PE9010, list)).toBe(0.95);
        expect(after(r, NIACINAMIDE, list)).toBe(3.5);
        expect(after(r, EDTA, list)).toBe(0.15);
        expect(after(r, SHEA, list) + after(r, JOJOBA, list)).toBeCloseTo(18, 0);
        // emulsifier ≈ 22% of the oils (18% oils + 0.5% vitamin E is not counted, fragrance would be)
        expect(after(r, OLIVEM, list)).toBeCloseTo(4, 0);
        expect(r.fillerIndex).toBe(0);
        expect(after(r, WATER, list)).toBeGreaterThan(60);
        expect(r.warnings).toEqual([]);
    });

    it('keeps the current oil load when asked and respects locked rows', () => {
        const list = [WATER, OLIVEM, { ...SHEA, percentage: 8 }, { ...JOJOBA, percentage: 16 }, { ...PE9010, percentage: 0.6, locked: true }];
        const r = balanceFormula(list, { id: 'ow_lotion', max_oil_phase_percent: 30 }, { keepLipidLoad: true });
        expect(r.lines[2].after + r.lines[3].after).toBeCloseTo(24, 0);
        expect(r.lines[2].after / r.lines[3].after).toBeCloseTo(0.5, 1); // proportions kept
        expect(r.lines[4].after).toBe(0.6);
        expect(r.lines[4].role).toBe('locked');
        expect(r.total).toBe(100);
    });

    it('caps oils to the profile oil-phase limit and says so', () => {
        const list = [WATER, OLIVEM, CETYL, { ...JOJOBA, percentage: 40 }, PE9010];
        const r = balanceFormula(list, { id: 'ow_lotion', max_oil_phase_percent: 25 }, { keepLipidLoad: true });
        const oilPhase = r.lines[1].after + r.lines[2].after + r.lines[3].after;
        expect(oilPhase).toBeLessThanOrEqual(25.2);
        expect(r.warnings.join(' ')).toMatch(/oil-phase limit/);
    });

    it('scales humectants down so a cream is not sticky', () => {
        const list = [WATER, OLIVEM, JOJOBA, GLYCERIN, PROPANEDIOL, PANTHENOL, PE9010];
        const r = balanceFormula(list, { id: 'ow_lotion' });
        expect(after(r, GLYCERIN, list) + after(r, PROPANEDIOL, list)).toBeLessThanOrEqual(5.05);
    });

    it('warns when an emulsion has oils but no emulsifier', () => {
        const r = balanceFormula([WATER, JOJOBA, PE9010], { id: 'ow_lotion' });
        expect(r.warnings.join(' ')).toMatch(/no emulsifier/i);
    });

    it('makes a toner: minimal oil, solubilizer at 4x the oils, water fills', () => {
        const list = [WATER, GLYCERIN, LAVENDER, POLYSORBATE20, PE9010];
        const r = balanceFormula(list, { id: 'toner_mist' });
        expect(r.kind).toBe('aqueous');
        const lavender = after(r, LAVENDER, list);
        expect(after(r, POLYSORBATE20, list)).toBeCloseTo(Math.max(lavender * 4, 1), 1);
        expect(r.total).toBe(100);
    });

    it('splits a body wash 3:1 anionic to amphoteric and starts salt low', () => {
        const list = [WATER, SLES, CAPB, SALT, PE9010, CITRIC];
        const r = balanceFormula(list, { id: 'body_wash' });
        expect(after(r, SLES, list)).toBeCloseTo(11.3, 1);
        expect(after(r, CAPB, list)).toBeCloseTo(3.8, 1);
        expect(after(r, SALT, list)).toBe(0.5);
        expect(after(r, CITRIC, list)).toBe(0.01);
        expect(r.total).toBe(100);
    });

    it('lets oils fill an anhydrous balm, with wax for structure', () => {
        const list = [CANDELILLA, SHEA, JOJOBA, TOCOPHEROL, LAVENDER];
        const r = balanceFormula(list, { id: 'body_butter' });
        expect(r.kind).toBe('anhydrous');
        expect(r.fillerIndex).toBeNull();
        expect(after(r, CANDELILLA, list)).toBe(7.5);
        expect(r.total).toBe(100);
    });

    it('warns when the oils in a facial oil cannot reach 100% within their limits', () => {
        const r = balanceFormula([ROSEHIP, TOCOPHEROL], { id: 'facial_oil' });
        expect(r.warnings.join(' ')).toMatch(/can only reach/);
    });

    it('stabilizes a W/O cream with magnesium sulfate', () => {
        const list = [WATER, DEHYMULS, JOJOBA, SHEA, MGSO4, PE9010];
        const r = balanceFormula(list, { id: 'wo_cream' });
        expect(after(r, MGSO4, list)).toBe(0.7);
        expect(after(r, JOJOBA, list) + after(r, SHEA, list)).toBeCloseTo(30, 0);
    });

    it('uses the Q.S. ingredient as the filler even when it is aloe juice', () => {
        const list = [WATER, { ...ALOE_JUICE, isQS: true }, GLYCERIN, PE9010];
        const r = balanceFormula(list, { id: 'water_serum' });
        expect(r.fillerIndex).toBe(1);
        expect(r.lines[1].reason).toMatch(/Q\.S\./);
        expect(r.total).toBe(100);
    });

    it('asks for a base liquid when a water-based product has none', () => {
        const r = balanceFormula([GLYCERIN, NIACINAMIDE, PE9010], { id: 'water_serum' });
        expect(r.warnings.join(' ')).toMatch(/Add water/);
    });

    it('infers the product type when no profile is chosen', () => {
        expect(balanceFormula([WATER, OLIVEM, JOJOBA, PE9010]).kind).toBe('ow');
        expect(balanceFormula([SHEA, JOJOBA]).kind).toBe('anhydrous');
        expect(balanceFormula([WATER, SLES, CAPB]).kind).toBe('surfactant');
        expect(balanceFormula([WATER, GLYCERIN, PE9010]).kind).toBe('aqueous');
    });
});

describe('emulsifiers that contain a fatty alcohol', () => {
    // Montanov 68 is cetearyl alcohol + cetearyl glucoside, sold as an emulsifier
    const MONTANOV = row('Cetearyl Alcohol (and) Cetearyl Glucoside', 'Montanov 68', 'Emulsifier', 2, 5, 'oil');

    it('are treated as the emulsifier, not as a fatty alcohol', () => {
        const list = [WATER, MONTANOV, JOJOBA, PE9010];
        const r = balanceFormula(list, { id: 'ow_lotion', max_oil_phase_percent: 30 });
        expect(r.lines[1].role).toBe('emulsifier');
        expect(r.warnings.join(' ')).not.toMatch(/no emulsifier/);
        expect(r.lines[1].after).toBeGreaterThan(2);
    });

    it('still treats plain fatty alcohols as co-emulsifiers', () => {
        const r = balanceFormula([WATER, OLIVEM, CETYL, JOJOBA, PE9010], { id: 'ow_lotion' });
        expect(r.lines[2].role).toBe('co-emulsifier');
    });
});
