import { describe, expect, it } from 'vitest';
import {
    EMULSIFIER_PRESETS, GRAMS_PER_DROP, PRESERVATIVE_PRESETS, blendHlb, celsiusToFahrenheit, convert, dilution, doseStatus, fahrenheitToCelsius,
    fmt, gramsToMl, hlbMeaning, mlToGrams, num, preservativeDose, requiredHlb, resultingStrength, scaleTitration, stockSolution, toGrams, twoEmulsifierMix,
    type TitrationResult,
} from './calculators';

describe('num and fmt', () => {
    it('parses typed numbers, including a decimal comma, and rejects empty or invalid text', () => {
        expect(num('12.5')).toBe(12.5);
        expect(num(' 3,5 ')).toBe(3.5);
        expect(num('')).toBeNaN();
        expect(num('abc')).toBeNaN();
    });

    it('formats without floating-point crumbs', () => {
        expect(fmt(4.570000001)).toBe('4.57');
        expect(fmt(0.031234)).toBe('0.031');
        expect(fmt(0.0004567)).toBe('0.0005');
        expect(fmt(123.456)).toBe('123.5');
        expect(fmt(NaN)).toBe('-');
    });
});

describe('HLB', () => {
    it('blends emulsifiers by weight', () => {
        // 6 g of Steareth-2 (4.9) + 4 g of Steareth-20 (15.3) = 9.06
        expect(blendHlb([{ hlb: 4.9, grams: 6 }, { hlb: 15.3, grams: 4 }])).toBeCloseTo(9.06, 2);
        expect(blendHlb([{ hlb: 10, grams: 5 }])).toBe(10);
    });

    it('ignores empty rows and gives nothing when there is no amount', () => {
        expect(blendHlb([{ hlb: 4.9, grams: 0 }, { hlb: NaN, grams: 5 }])).toBeNull();
        expect(blendHlb([{ hlb: 4.9, grams: 6 }, { hlb: 15.3, grams: 0 }])).toBe(4.9);
    });

    it('works out the HLB the oil phase needs', () => {
        // 10 g jojoba (6.5) + 5 g shea (8) + 5 g cetyl alcohol (15) = 180 / 20 = 9
        expect(requiredHlb([{ requiredHlb: 6.5, grams: 10 }, { requiredHlb: 8, grams: 5 }, { requiredHlb: 15, grams: 5 }])).toBeCloseTo(9, 6);
    });

    it('finds the ratio of a low and a high emulsifier that hits the target', () => {
        const mix = twoEmulsifierMix(4.9, 15.3, 10.1)!;
        expect(mix.reachable).toBe(true);
        expect(mix.highPct).toBeCloseTo(50, 1);
        expect(mix.lowPct + mix.highPct).toBeCloseTo(100, 6);
        // and the blend really comes out at the target
        expect(blendHlb([{ hlb: 4.9, grams: mix.lowPct }, { hlb: 15.3, grams: mix.highPct }])).toBeCloseTo(10.1, 6);
    });

    it('returns the closest blend when the target is out of reach, and refuses a bad pair', () => {
        const mix = twoEmulsifierMix(4.9, 15.3, 18)!;
        expect(mix).toMatchObject({ reachable: false, highPct: 100, achievedHlb: 15.3 });
        expect(twoEmulsifierMix(15.3, 4.9, 10)).toBeNull();
        expect(twoEmulsifierMix(5, 5, 5)).toBeNull();
    });

    it('describes what an HLB is good for', () => {
        expect(hlbMeaning(4.9)).toMatch(/W\/O/);
        expect(hlbMeaning(12)).toMatch(/O\/W/);
        expect(hlbMeaning(18)).toMatch(/Solubilizer/);
    });

    it('has the library values for Steareth-2 and Steareth-20', () => {
        expect(EMULSIFIER_PRESETS.find(e => e.name === 'Steareth-2')?.hlb).toBe(4.9);
        expect(EMULSIFIER_PRESETS.find(e => e.name === 'Steareth-20')?.hlb).toBe(15.3);
    });
});

describe('pH adjuster', () => {
    it('makes a stock solution by weight', () => {
        expect(stockSolution(100, 50)).toEqual({ soluteG: 50, waterG: 50 });
        const naoh = stockSolution(250, 10)!;
        expect(naoh.soluteG).toBeCloseTo(25, 6);
        expect(naoh.waterG).toBeCloseTo(225, 6);
        expect(stockSolution(100, 0)).toBeNull();
        expect(stockSolution(100, 120)).toBeNull();
    });

    it('converts drops, grams and millilitres', () => {
        expect(toGrams(20, 'drops')).toBeCloseTo(1, 6);
        expect(toGrams(2, 'g')).toBe(2);
        expect(toGrams(2, 'ml')).toBe(2);
        expect(GRAMS_PER_DROP).toBe(0.05);
    });

    const test = { sampleG: 20, usedG: 0.1, startPh: 6.4, endPh: 6.0, targetPh: 5.4, batchG: 400 };

    it('scales a bench test up to the batch', () => {
        // 0.1 g moved 20 g by 0.4, so 1.0 pH needs 0.25 g per 20 g. For 400 g that is 5 g
        const r = scaleTitration({ ...test, targetPh: 5.8 }) as TitrationResult;
        expect(r.totalG).toBeCloseTo(3, 6); // 0.6 pH needs 0.15 g per 20 g
        expect(r.firstAddG).toBeCloseTo(2.25, 6);
        expect(r.extrapolated).toBe(false);
    });

    it('works for raising pH just as well', () => {
        const r = scaleTitration({ ...test, startPh: 4.2, endPh: 4.6, targetPh: 5.2 }) as TitrationResult;
        expect(r.totalG).toBeCloseTo(5, 6);
    });

    it('warns when the target is well beyond what the test covered', () => {
        expect((scaleTitration(test) as TitrationResult).extrapolated).toBe(true); // 1.0 wanted, 0.4 tested
        expect((scaleTitration({ ...test, targetPh: 4.5 }) as TitrationResult).extrapolated).toBe(true);
    });

    it('explains why it cannot give an answer', () => {
        expect(scaleTitration({ ...test, endPh: 6.4 })).toBe('no-change');
        expect(scaleTitration({ ...test, targetPh: 6.4 })).toBe('no-move-needed');
        expect(scaleTitration({ ...test, targetPh: 7 })).toBe('wrong-direction');
        expect(scaleTitration({ ...test, sampleG: NaN })).toBe('invalid');
        expect(scaleTitration({ ...test, batchG: 0 })).toBe('invalid');
    });
});

describe('dilution', () => {
    it('makes a weaker solution from a stronger one', () => {
        // 100 g of 10% from a 50% stock: 20 g of stock + 80 g of water
        const d = dilution(100, 50, 10);
        expect(d).toEqual({ stockG: 20, diluentG: 80 });
    });

    it('treats 100% stock as a pure powder or liquid', () => {
        const d = dilution(250, 100, 10);
        expect(d).toEqual({ stockG: 25, diluentG: 225 });
    });

    it('refuses what is impossible', () => {
        expect(dilution(100, 10, 50)).toBe('too-strong');
        expect(dilution(0, 50, 10)).toBe('invalid');
        expect(dilution(100, 150, 10)).toBe('invalid');
        expect(dilution(100, 50, NaN)).toBe('invalid');
    });

    it('works backwards: the strength of a mix', () => {
        expect(resultingStrength(20, 50, 80)).toBeCloseTo(10, 6);
        expect(resultingStrength(0, 50, 80)).toBeNull();
    });
});

describe('preservative dose', () => {
    it('is a share of the whole batch by default', () => {
        const d = preservativeDose(250, 1, 'total', NaN)!;
        expect(d.grams).toBeCloseTo(2.5, 6);
        expect(d.pctOfBatch).toBeCloseTo(1, 6);
    });

    it('can be a share of the water in the batch', () => {
        // 1% of the water phase of a 250 g batch that is 70% water = 1.75 g, 0.7% of the batch
        const d = preservativeDose(250, 1, 'water', 70)!;
        expect(d.grams).toBeCloseTo(1.75, 6);
        expect(d.pctOfBatch).toBeCloseTo(0.7, 6);
    });

    it('needs the water share when dosed on water, and sensible numbers', () => {
        expect(preservativeDose(250, 1, 'water', NaN)).toBeNull();
        expect(preservativeDose(250, 1, 'water', 0)).toBeNull();
        expect(preservativeDose(0, 1, 'total', NaN)).toBeNull();
        expect(preservativeDose(250, 0, 'total', NaN)).toBeNull();
    });

    it('compares a dose with the datasheet range', () => {
        expect(doseStatus(0.3, 0.5, 1.1)).toBe('low');
        expect(doseStatus(0.5, 0.5, 1.1)).toBe('ok');
        expect(doseStatus(1.1, 0.5, 1.1)).toBe('ok');
        expect(doseStatus(1.5, 0.5, 1.1)).toBe('high');
    });

    it('uses the library ranges for presets', () => {
        const k712 = PRESERVATIVE_PRESETS.find(p => p.name.startsWith('Euxyl K712'))!;
        expect([k712.min, k712.max, k712.maxPh]).toEqual([0.5, 1.5, 5.5]);
    });
});

describe('unit conversion', () => {
    it('converts mass', () => {
        expect(convert(1, 'oz', 'g', 'mass')).toBeCloseTo(28.3495, 4);
        expect(convert(1, 'lb', 'oz', 'mass')).toBeCloseTo(16, 4);
        expect(convert(500, 'g', 'kg', 'mass')).toBe(0.5);
        expect(convert(250, 'mg', 'g', 'mass')).toBe(0.25);
    });

    it('converts volume', () => {
        expect(convert(1, 'tbsp', 'tsp', 'volume')).toBeCloseTo(3, 4);
        expect(convert(1, 'floz', 'ml', 'volume')).toBeCloseTo(29.5735, 4);
        expect(convert(1, 'cup', 'floz', 'volume')).toBeCloseTo(8, 4);
        expect(convert(2, 'l', 'ml', 'volume')).toBe(2000);
    });

    it('round-trips', () => {
        expect(convert(convert(12.3, 'oz', 'g', 'mass'), 'g', 'oz', 'mass')).toBeCloseTo(12.3, 8);
    });

    it('gives NaN for unknown units or bad input', () => {
        expect(convert(1, 'x', 'g', 'mass')).toBeNaN();
        expect(convert(NaN, 'g', 'oz', 'mass')).toBeNaN();
        expect(convert(1, 'g', 'ml', 'mass')).toBeNaN(); // ml is not a mass
    });

    it('turns a weight into a volume with the density, and back', () => {
        expect(gramsToMl(126, 1.26)).toBeCloseTo(100, 6); // glycerin
        expect(mlToGrams(100, 0.91)).toBeCloseTo(91, 6);
        expect(gramsToMl(10, 0)).toBeNaN();
    });

    it('converts temperature', () => {
        expect(celsiusToFahrenheit(75)).toBe(167);
        expect(fahrenheitToCelsius(167)).toBeCloseTo(75, 6);
        expect(celsiusToFahrenheit(0)).toBe(32);
    });
});
