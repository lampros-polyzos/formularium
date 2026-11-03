// Pure maths for the Tools page. Nothing here touches the screen or the database.

/** Parses a typed number. Returns NaN for empty or invalid input so callers can show "not yet". */
export function num(value: string): number {
    const trimmed = value.trim().replace(',', '.');
    return trimmed === '' ? NaN : Number(trimmed);
}

/** Friendly number: 123.4, 4.57, 0.031, never 4.570000001. */
export function fmt(value: number): string {
    if (!Number.isFinite(value)) return '-';
    const abs = Math.abs(value);
    const digits = abs >= 100 ? 1 : abs >= 1 ? 2 : abs >= 0.01 ? 3 : 4;
    return String(Number(value.toFixed(digits)));
}

const positive = (n: number) => Number.isFinite(n) && n > 0;

// ---------- HLB ----------

export interface Emulsifier { name: string; hlb: number }
export interface Oil { name: string; requiredHlb: number }

// Typical published values. Suppliers differ a little, so check the datasheet of what you buy.
export const EMULSIFIER_PRESETS: Emulsifier[] = [
    { name: 'Steareth-2', hlb: 4.9 },
    { name: 'Steareth-20', hlb: 15.3 },
    { name: 'Glyceryl Stearate', hlb: 3.8 },
    { name: 'Sorbitan Oleate (Span 80)', hlb: 4.3 },
    { name: 'Sorbitan Stearate (Span 60)', hlb: 4.7 },
    { name: 'Polysorbate 20 (Tween 20)', hlb: 16.7 },
    { name: 'Polysorbate 60 (Tween 60)', hlb: 14.9 },
    { name: 'Polysorbate 80 (Tween 80)', hlb: 15 },
    { name: 'Ceteareth-20', hlb: 15.7 },
];

// "Required HLB" of common oil-phase ingredients for an oil-in-water emulsion. Approximate: values vary by source.
export const OIL_PRESETS: Oil[] = [
    { name: 'Mineral oil', requiredHlb: 10.5 },
    { name: 'Sweet almond oil', requiredHlb: 7 },
    { name: 'Jojoba oil', requiredHlb: 6.5 },
    { name: 'Olive oil', requiredHlb: 7 },
    { name: 'Avocado oil', requiredHlb: 7 },
    { name: 'Coconut oil', requiredHlb: 8 },
    { name: 'Castor oil', requiredHlb: 14 },
    { name: 'Shea butter', requiredHlb: 8 },
    { name: 'Beeswax', requiredHlb: 9 },
    { name: 'Lanolin', requiredHlb: 10 },
    { name: 'Squalane', requiredHlb: 11 },
    { name: 'Isopropyl myristate', requiredHlb: 11.5 },
    { name: 'Dimethicone', requiredHlb: 5 },
    { name: 'Cetyl alcohol', requiredHlb: 15 },
    { name: 'Stearyl alcohol', requiredHlb: 15.5 },
];

function weightedAverage(items: { value: number; grams: number }[]): number | null {
    const valid = items.filter(i => Number.isFinite(i.value) && positive(i.grams));
    const total = valid.reduce((sum, i) => sum + i.grams, 0);
    if (total === 0) return null;
    return valid.reduce((sum, i) => sum + i.value * i.grams, 0) / total;
}

/** The HLB of a mix of emulsifiers: each one's HLB weighted by how much of it there is. */
export function blendHlb(items: { hlb: number; grams: number }[]): number | null {
    return weightedAverage(items.map(i => ({ value: i.hlb, grams: i.grams })));
}

/** The HLB the oil phase asks for, weighted by how much of each oil there is. */
export function requiredHlb(items: { requiredHlb: number; grams: number }[]): number | null {
    return weightedAverage(items.map(i => ({ value: i.requiredHlb, grams: i.grams })));
}

export interface TwoEmulsifierMix {
    /** Share of the emulsifier blend that is the low-HLB one, in percent. */
    lowPct: number;
    highPct: number;
    /** False when the target is outside what these two can make; the closest blend is returned. */
    reachable: boolean;
    achievedHlb: number;
}

export function twoEmulsifierMix(lowHlb: number, highHlb: number, target: number): TwoEmulsifierMix | null {
    if (![lowHlb, highHlb, target].every(Number.isFinite) || lowHlb >= highHlb) return null;
    const reachable = target >= lowHlb && target <= highHlb;
    const clamped = Math.min(Math.max(target, lowHlb), highHlb);
    const highShare = (clamped - lowHlb) / (highHlb - lowHlb);
    return { lowPct: (1 - highShare) * 100, highPct: highShare * 100, reachable, achievedHlb: clamped };
}

export function hlbMeaning(hlb: number): string {
    if (hlb < 3) return 'Anti-foaming agents';
    if (hlb < 6) return 'Water-in-oil (W/O) emulsifier';
    if (hlb < 8) return 'Wetting agent';
    if (hlb < 10) return 'Oil-in-water (O/W) emulsifier, light creams';
    if (hlb <= 16) return 'Oil-in-water (O/W) emulsifier';
    return 'Solubilizer';
}

// ---------- pH ----------

export interface Stock { soluteG: number; waterG: number }

/** How much to dissolve to make `totalG` of a `strengthPct` solution (by weight). */
export function stockSolution(totalG: number, strengthPct: number): Stock | null {
    if (!positive(totalG) || !positive(strengthPct) || strengthPct > 100) return null;
    const soluteG = (totalG * strengthPct) / 100;
    return { soluteG, waterG: totalG - soluteG };
}

/** About 20 drops make a millilitre, and a millilitre of a dilute water-based solution weighs about a gram. */
export const GRAMS_PER_DROP = 0.05;

export type AdjusterUnit = 'drops' | 'g' | 'ml';

export function toGrams(amount: number, unit: AdjusterUnit): number {
    return unit === 'drops' ? amount * GRAMS_PER_DROP : amount; // ml of a dilute solution is about 1 g
}

export interface TitrationInput {
    sampleG: number;
    /** Solution added to the sample in the test, in grams. */
    usedG: number;
    startPh: number;
    endPh: number;
    targetPh: number;
    batchG: number;
}

export type TitrationProblem = 'invalid' | 'no-change' | 'wrong-direction' | 'no-move-needed';

export interface TitrationResult {
    /** All the solution the batch needs, in grams. */
    totalG: number;
    /** A cautious first addition (about three quarters), then measure again. */
    firstAddG: number;
    /** True when the target is further than the test covered, so the estimate is rougher. */
    extrapolated: boolean;
}

/**
 * Scales a bench test up to the batch. How far pH moves per drop depends on how buffered the product is, so it
 * can't be worked out from the chemistry: add a little to a small sample, see what happened, and scale that.
 * This assumes the pH moves in proportion to what is added over the small range tested.
 */
export function scaleTitration(input: TitrationInput): TitrationResult | TitrationProblem {
    const { sampleG, usedG, startPh, endPh, targetPh, batchG } = input;
    if (![sampleG, usedG, batchG].every(positive) || ![startPh, endPh, targetPh].every(Number.isFinite)) return 'invalid';
    const moved = endPh - startPh;
    if (Math.abs(moved) < 0.01) return 'no-change';
    const needed = targetPh - startPh;
    if (Math.abs(needed) < 0.01) return 'no-move-needed';
    if (Math.sign(needed) !== Math.sign(moved)) return 'wrong-direction';

    const sampleDoseG = usedG * (needed / moved);
    const totalG = (sampleDoseG / sampleG) * batchG;
    return { totalG, firstAddG: totalG * 0.75, extrapolated: Math.abs(needed) > Math.abs(moved) * 1.5 };
}

// ---------- Dilution ----------

export interface Dilution { stockG: number; diluentG: number }

/**
 * Makes `targetG` of a `targetPct` solution from a `stockPct` stock (use 100 for a pure powder or liquid).
 * Strengths are by weight, so this is C1 x M1 = C2 x M2.
 */
export function dilution(targetG: number, stockPct: number, targetPct: number): Dilution | 'invalid' | 'too-strong' {
    if (![targetG, stockPct, targetPct].every(positive) || stockPct > 100) return 'invalid';
    if (targetPct > stockPct) return 'too-strong';
    const stockG = (targetG * targetPct) / stockPct;
    return { stockG, diluentG: targetG - stockG };
}

/** The strength you get when mixing `stockG` of a stock with `diluentG` of water. */
export function resultingStrength(stockG: number, stockPct: number, diluentG: number): number | null {
    if (!positive(stockG) || !positive(stockPct) || !Number.isFinite(diluentG) || diluentG < 0) return null;
    return (stockG * stockPct) / (stockG + diluentG);
}

// ---------- Preservative ----------

export type DoseBasis = 'total' | 'water';

export interface PreservativeDose {
    grams: number;
    /** The same dose expressed as a share of the whole batch, for comparing with the datasheet. */
    pctOfBatch: number;
}

export function preservativeDose(batchG: number, dosePct: number, basis: DoseBasis, waterPct: number): PreservativeDose | null {
    if (!positive(batchG) || !positive(dosePct)) return null;
    if (basis === 'water' && (!Number.isFinite(waterPct) || waterPct <= 0 || waterPct > 100)) return null;
    const baseG = basis === 'water' ? (batchG * waterPct) / 100 : batchG;
    const grams = (baseG * dosePct) / 100;
    return { grams, pctOfBatch: (grams / batchG) * 100 };
}

export type DoseStatus = 'low' | 'ok' | 'high';

export function doseStatus(dosePct: number, min: number, max: number): DoseStatus {
    if (dosePct < min - 1e-9) return 'low';
    if (dosePct > max + 1e-9) return 'high';
    return 'ok';
}

export interface PreservativePreset {
    name: string;
    min: number;
    max: number;
    /** Highest pH where it still works, when that matters. */
    maxPh?: number;
    note?: string;
}

// Ranges from the Formularium ingredient library: always follow your supplier's datasheet.
export const PRESERVATIVE_PRESETS: PreservativePreset[] = [
    { name: 'Euxyl PE 9010 (phenoxyethanol + ethylhexylglycerin)', min: 0.5, max: 1.1 },
    { name: 'Optiphen (phenoxyethanol + caprylyl glycol)', min: 0.5, max: 1.5 },
    { name: 'Geogard ECT', min: 0.6, max: 1, note: 'Add below 45 °C. Almond-like smell.' },
    { name: 'Geogard 221 / Cosgard', min: 0.6, max: 1, maxPh: 6, note: 'Only works below pH 6.' },
    { name: 'Geogard Ultra', min: 1, max: 2, maxPh: 6, note: 'Works best at pH 4 to 5.5.' },
    { name: 'Euxyl K712 (sodium benzoate + potassium sorbate)', min: 0.5, max: 1.5, maxPh: 5.5, note: 'Fails above pH 5.5.' },
    { name: 'Dermosoft 1388 Eco', min: 2, max: 4, maxPh: 5.5, note: 'Pair with a booster.' },
    { name: 'Leucidal Liquid', min: 2, max: 4, note: 'Weak against mold: pair with an antifungal.' },
    { name: 'Liquid Germall Plus', min: 0.1, max: 0.5, note: 'Add below 50 °C.' },
];

// ---------- Units ----------

export type Quantity = 'mass' | 'volume';

export const UNITS: Record<Quantity, Record<string, { label: string; factor: number }>> = {
    mass: {
        g: { label: 'grams (g)', factor: 1 },
        kg: { label: 'kilograms (kg)', factor: 1000 },
        mg: { label: 'milligrams (mg)', factor: 0.001 },
        oz: { label: 'ounces (oz)', factor: 28.349523125 },
        lb: { label: 'pounds (lb)', factor: 453.59237 },
    },
    volume: {
        ml: { label: 'millilitres (ml)', factor: 1 },
        l: { label: 'litres (l)', factor: 1000 },
        floz: { label: 'fluid ounces (US fl oz)', factor: 29.5735295625 },
        tsp: { label: 'teaspoons (US tsp)', factor: 4.92892159375 },
        tbsp: { label: 'tablespoons (US tbsp)', factor: 14.78676478125 },
        cup: { label: 'cups (US cup)', factor: 236.5882365 },
    },
};

export function convert(value: number, from: string, to: string, quantity: Quantity): number {
    const units = UNITS[quantity];
    if (!Number.isFinite(value) || !units[from] || !units[to]) return NaN;
    return (value * units[from].factor) / units[to].factor;
}

/** Typical densities in g/ml, for turning a weight into a volume and back. */
export const DENSITY_PRESETS: { name: string; density: number }[] = [
    { name: 'Water', density: 1 },
    { name: 'Glycerin', density: 1.26 },
    { name: 'Propanediol', density: 1.05 },
    { name: 'Sweet almond / olive / jojoba oil', density: 0.91 },
    { name: 'Coconut oil (liquid)', density: 0.92 },
    { name: 'Castor oil', density: 0.96 },
    { name: 'Squalane', density: 0.81 },
    { name: 'Isopropyl alcohol', density: 0.785 },
    { name: 'Honey', density: 1.42 },
];

export const gramsToMl = (grams: number, density: number) => (positive(density) ? grams / density : NaN);
export const mlToGrams = (ml: number, density: number) => (positive(density) ? ml * density : NaN);

export const celsiusToFahrenheit = (c: number) => (c * 9) / 5 + 32;
export const fahrenheitToCelsius = (f: number) => ((f - 32) * 5) / 9;
