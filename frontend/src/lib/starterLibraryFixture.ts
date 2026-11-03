// A small ingredient library shaped like the real one, for tests of the starter templates.
import type { BalanceIngredient } from './autoBalance';
import type { TemplateRow } from './starterTemplates';

export type Row = TemplateRow & Omit<BalanceIngredient, 'percentage'> & { max_heating_temp_c?: number | null };
let n = 0;
export const row = (inci_name: string, trade_name: string, fn: string, min: number, max: number, solubility: string, extra: Partial<Row> = {}): Row =>
    ({ id: `i${++n}`, inci_name, trade_name, function: fn, min_usage_pct: min, max_usage_pct: max, solubility, ...extra });

export const LIBRARY: Row[] = [
    row('Aqua', 'Distilled Water', 'Solvent', 1, 100, 'water', { default_min_usage: 0, default_max_usage: 100 }),
    row('Glycerin', 'Vegetable Glycerin 99.5%', 'Humectant', 1, 10, 'water', { default_min_usage: 0, default_max_usage: 100 }),
    row('Propanediol', '1,3-Propanediol (Zemea)', 'Humectant / Solvent', 1, 10, 'water'),
    row('Panthenol', 'DL-Panthenol', 'Humectant / Active', 1, 5, 'water'),
    row('Sodium Hyaluronate', 'Hyaluronic Acid (Low MW)', 'Humectant / Active', 0.05, 1, 'water'),
    row('Cetearyl Olivate, Sorbitan Olivate', 'Olivem 1000', 'Emulsifier', 1.5, 5, 'oil'),
    row('Cetearyl Alcohol (and) Cetearyl Glucoside', 'Montanov 68', 'Emulsifier', 2, 5, 'oil'),
    row('Cetyl Alcohol', 'Cetyl Alcohol', 'Thickener / Emollient', 1, 5, 'oil'),
    row('Simmondsia Chinensis Seed Oil', 'Jojoba Oil (Cold Pressed)', 'Carrier Oil', 1, 100, 'oil'),
    row('Helianthus Annuus (Sunflower) Seed Oil [High Oleic]', 'Sunflower Oil (High Oleic)', 'Carrier Oil', 1, 100, 'oil'),
    row('Caprylic/Capric Triglyceride', 'MCT Oil', 'Emollient', 1, 100, 'oil'),
    row('Butyrospermum Parkii Butter', 'Shea Butter (Refined)', 'Butter', 1, 100, 'oil'),
    row('Butyrospermum Parkii Butter [Raw]', 'Shea Butter (Raw)', 'Butter', 1, 100, 'oil'),
    row('Theobroma Cacao Seed Butter', 'Cocoa Butter', 'Butter', 1, 100, 'oil'),
    row('Tocopherol', 'Vitamin E (Mixed Tocopherols 95%)', 'Antioxidant', 0.1, 1, 'oil', { max_heating_temp_c: 40 }),
    row('Disodium EDTA', 'Disodium EDTA', 'Chelating Agent', 0.05, 0.2, 'water', { default_min_usage: 0.1, default_max_usage: 0.2 }),
    row('Phenoxyethanol (and) Ethylhexylglycerin', 'Euxyl PE 9010', 'Preservative', 0.5, 1.1, 'dispersible', { max_heating_temp_c: 80 }),
    row('Sodium Lauroyl Methyl Isethionate', 'Iselux (SLMI)', 'Surfactant (Anionic)', 3, 20, 'water', { ionic_charge: 'anionic' }),
    row('Coco-Glucoside', 'Coco-Glucoside (50%)', 'Surfactant (Non-ionic)', 3, 25, 'water'),
    row('Cocamidopropyl Betaine', 'CAPB (30% Active)', 'Surfactant (Amphoteric)', 2, 40, 'water', { ionic_charge: 'amphoteric' }),
    row('Sodium Chloride', 'Sodium Chloride (Salt)', 'Thickener (Surfactant Systems)', 0.1, 3, 'water', { default_min_usage: 0.5, default_max_usage: 2 }),
];

/** The product types the templates use, as the formulation_profiles table describes them. */
export const PROFILES: Record<string, { id: string; name: string; max_oil_phase_percent: number | null; default_ph_min: number | null; default_ph_max: number | null }> = {
    ow_lotion: { id: 'ow_lotion', name: 'O/W Lotion', max_oil_phase_percent: 30, default_ph_min: 5, default_ph_max: 6 },
    toner_mist: { id: 'toner_mist', name: 'Toner', max_oil_phase_percent: 5, default_ph_min: 4.5, default_ph_max: 5.5 },
    body_butter: { id: 'body_butter', name: 'Body Butter', max_oil_phase_percent: null, default_ph_min: null, default_ph_max: null },
    shampoo: { id: 'shampoo', name: 'Shampoo', max_oil_phase_percent: 5, default_ph_min: 4.5, default_ph_max: 6 },
};
