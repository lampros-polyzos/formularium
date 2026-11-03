import { describe, expect, it } from 'vitest';
import { matchesAny } from './catalogFilter';
import { LIBRARY, PROFILES, row, type Row } from './starterLibraryFixture';
import { STARTER_TEMPLATES, buildStarterFormula, getTemplate, normalizeName, resolveTemplate, templateFilters, type StarterTemplate } from './starterTemplates';

const find = (trade: string) => LIBRARY.find(r => r.trade_name === trade)!;
const without = (...trades: string[]) => LIBRARY.filter(r => !trades.includes(r.trade_name));
const build = (id: string, rows: Row[] = LIBRARY, stash: string[] = []) => {
    const template = getTemplate(id)!;
    return buildStarterFormula(template, rows, PROFILES[template.profileId], new Set(stash.map(t => find(t).id)));
};
const pct = (formula: ReturnType<typeof build>, trade: string) => formula.ingredients.find(i => i.trade_name === trade)?.percentage;
const names = (formula: ReturnType<typeof build>) => formula.ingredients.map(i => i.trade_name);

describe('template data', () => {
    it('has the four starter products, each with a unique id and a known product type', () => {
        expect(STARTER_TEMPLATES.map(t => t.id)).toEqual(['light-lotion', 'toner', 'body-butter', 'shampoo']);
        expect(new Set(STARTER_TEMPLATES.map(t => t.id)).size).toBe(4);
        for (const t of STARTER_TEMPLATES) expect(Object.keys(PROFILES), t.id).toContain(t.profileId);
    });

    it('gives every template water (unless waterless) and a preservative (unless waterless), and something to do next', () => {
        for (const t of STARTER_TEMPLATES) {
            const labels = t.lines.map(l => l.label);
            const waterless = t.profileId === 'body_butter';
            expect(labels.includes('Water'), t.id).toBe(!waterless);
            expect(labels.includes('Preservative'), t.id).toBe(!waterless);
            expect(t.nextSteps.length, t.id).toBeGreaterThan(1);
            expect(t.includes.length, t.id).toBeGreaterThan(2);
            for (const line of t.lines) expect(line.options.length, `${t.id}/${line.label}`).toBeGreaterThan(0);
        }
    });

    it('looks up templates by id', () => {
        expect(getTemplate('toner')?.name).toBe('Hydrating toner');
        expect(getTemplate('nope')).toBeUndefined();
        expect(getTemplate(null)).toBeUndefined();
    });
});

describe('finding ingredients', () => {
    it('treats differently written names of the same ingredient as equal', () => {
        expect(normalizeName('Cetearyl Olivate (and) Sorbitan Olivate')).toBe(normalizeName('Cetearyl Olivate, Sorbitan Olivate'));
        expect(normalizeName('Helianthus Annuus (Sunflower) Seed Oil [High Oleic]')).toBe('helianthus annuus seed oil');
        expect(normalizeName('Aqua (Water) [Distilled]')).toBe('aqua');
        expect(normalizeName('Caprylic/Capric Triglyceride')).toBe('caprylic capric triglyceride');
        expect(normalizeName(null)).toBe('');
    });

    it('finds the emulsifier by brand name or by INCI, whichever way the library writes it', () => {
        const lotion = getTemplate('light-lotion')!;
        const { resolved } = resolveTemplate(lotion, LIBRARY);
        expect(resolved.find(r => r.line.label === 'Emulsifier')?.row.trade_name).toBe('Olivem 1000');
        const asInci = [{ ...find('Olivem 1000'), trade_name: 'Some Brand', inci_name: 'Cetearyl Olivate (and) Sorbitan Olivate' }];
        expect(resolveTemplate(lotion, asInci).resolved.map(r => r.line.label)).toEqual(['Emulsifier']);
    });

    it('does not mistake a blend that merely contains an ingredient for the ingredient itself', () => {
        const blend = row('Glycerin (and) Aqua (and) Sodium Levulinate (and) Sodium Anisate', 'Dermosoft 1388 Eco', 'Preservative (Natural)', 2, 4, 'water');
        const { resolved } = resolveTemplate(getTemplate('toner')!, [blend]);
        expect(resolved).toEqual([]);
    });

    it('falls back to the next option when the first is not in the library', () => {
        const f = build('toner', without('Hyaluronic Acid (Low MW)'));
        expect(names(f)).toContain('1,3-Propanediol (Zemea)');
        const noPropanediol = build('toner', without('1,3-Propanediol (Zemea)'));
        expect(names(noPropanediol)).toContain('Vegetable Glycerin 99.5%');
    });

    it('prefers the option the user already owns', () => {
        expect(names(build('toner'))).toContain('1,3-Propanediol (Zemea)'); // first choice
        expect(names(build('toner', LIBRARY, ['Vegetable Glycerin 99.5%']))).toContain('Vegetable Glycerin 99.5%');
        expect(names(build('toner', LIBRARY, ['Vegetable Glycerin 99.5%']))).not.toContain('1,3-Propanediol (Zemea)');
    });

    it('prefers the grade the user owns, then the plain one over [Raw]', () => {
        expect(names(build('body-butter'))).toContain('Shea Butter (Refined)');
        expect(names(build('body-butter', LIBRARY, ['Shea Butter (Raw)']))).toContain('Shea Butter (Raw)');
        expect(names(build('body-butter', LIBRARY, ['Shea Butter (Raw)']))).not.toContain('Shea Butter (Refined)');
    });

    it('uses an ingredient only once', () => {
        for (const t of STARTER_TEMPLATES) {
            const ids = build(t.id).ingredients.map(i => i.id);
            expect(new Set(ids).size, t.id).toBe(ids.length);
        }
    });

    it('asks the database for every ingredient it might pick, whatever the library calls it', () => {
        for (const t of STARTER_TEMPLATES) {
            const filters = templateFilters(t);
            for (const ingredient of build(t.id).ingredients) {
                expect(matchesAny(filters, ingredient), `${t.id}: ${ingredient.trade_name}`).toBe(true);
            }
        }
        // and not for the whole library
        const lotionFilters = templateFilters(getTemplate('light-lotion')!);
        expect(LIBRARY.filter(r => matchesAny(lotionFilters, r)).length).toBeLessThan(LIBRARY.length);
    });
});

describe('the balanced starting formulas', () => {
    it.each(STARTER_TEMPLATES.map(t => t.id))('%s adds up to exactly 100% with nothing for the balancer to complain about', (id) => {
        const f = build(id);
        expect(f.balance.total).toBe(100);
        expect(f.ingredients.reduce((s, i) => s + i.percentage, 0)).toBeCloseTo(100, 2);
        expect(f.balance.warnings).toEqual([]);
        expect(f.missing).toEqual([]);
        for (const i of f.ingredients) {
            expect(i.percentage, i.trade_name).toBeGreaterThan(0);
            if (!i.isQS) {
                expect(i.percentage, i.trade_name).toBeGreaterThanOrEqual(i.min_usage_pct ?? 0);
                expect(i.percentage, i.trade_name).toBeLessThanOrEqual(i.max_usage_pct ?? 100);
            }
        }
    });

    it('light lotion: about 18% oils, an emulsifier sized to them, fatty alcohol, preservative, and water making up the rest', () => {
        const f = build('light-lotion');
        expect(f.balance.kind).toBe('ow');
        const oils = (pct(f, 'Jojoba Oil (Cold Pressed)') ?? 0) + (pct(f, 'MCT Oil') ?? 0);
        expect(oils).toBeCloseTo(18, 0);
        expect(pct(f, 'Jojoba Oil (Cold Pressed)')).toBeGreaterThan(pct(f, 'MCT Oil')!); // the 10:8 split
        expect(pct(f, 'Olivem 1000')).toBeCloseTo(4, 0);
        expect(pct(f, 'Cetyl Alcohol')).toBeGreaterThan(0);
        expect(pct(f, 'Euxyl PE 9010')).toBeGreaterThanOrEqual(0.5);
        const water = f.ingredients.find(i => i.isQS)!;
        expect(water.trade_name).toBe('Distilled Water');
        expect(water.percentage).toBeGreaterThan(60);
    });

    it('light lotion: oils go in the oil phase, water-soluble in the water phase, the antioxidant in the cool-down', () => {
        const f = build('light-lotion');
        const phase = (trade: string) => f.ingredients.find(i => i.trade_name === trade)!.phase;
        expect(phase('Jojoba Oil (Cold Pressed)')).toBe('B');
        expect(phase('Olivem 1000')).toBe('B');
        expect(phase('Vegetable Glycerin 99.5%')).toBe('A');
        expect(phase('Euxyl PE 9010')).toBe('C'); // the preservative always goes in last
        expect(phase('Vitamin E (Mixed Tocopherols 95%)')).toBe('C');
    });

    it('light lotion still works with Montanov 68 as the only emulsifier (a fatty alcohol in its name)', () => {
        const f = build('light-lotion', without('Olivem 1000'));
        expect(names(f)).toContain('Montanov 68');
        expect(f.balance.warnings).toEqual([]);
        expect(pct(f, 'Montanov 68')).toBeGreaterThanOrEqual(2);
    });

    it('toner: mostly water with a little humectant, panthenol, a preservative, and no oils or emulsifier', () => {
        const f = build('toner');
        expect(f.balance.kind).toBe('aqueous');
        expect(f.ingredients.find(i => i.isQS)!.percentage).toBeGreaterThan(85);
        expect(names(f)).not.toContain('Olivem 1000');
        expect(f.ingredients.every(i => i.phase !== 'B')).toBe(true);
    });

    it('body butter: waterless, butters and oil in the template\'s proportions, no water, no preservative', () => {
        const f = build('body-butter');
        expect(f.balance.kind).toBe('anhydrous');
        expect(f.balance.total).toBe(100);
        expect(f.ingredients.some(i => i.isQS)).toBe(false);
        expect(names(f)).not.toContain('Euxyl PE 9010');
        const shea = pct(f, 'Shea Butter (Refined)')!, oil = pct(f, 'Jojoba Oil (Cold Pressed)')!, cocoa = pct(f, 'Cocoa Butter')!;
        expect(shea).toBeGreaterThan(oil);
        expect(oil).toBeGreaterThan(cocoa);
        expect(shea / oil).toBeCloseTo(55 / 30, 0);
        expect(shea + oil + cocoa).toBeGreaterThan(98);
    });

    it('body butter without cocoa butter still balances to 100%', () => {
        const f = build('body-butter', without('Cocoa Butter'));
        expect(f.balance.total).toBe(100);
        expect(f.missing).toEqual([]); // the second butter is optional
        expect(names(f)).not.toContain('Cocoa Butter');
    });

    it('shampoo: about 15% surfactants split across the cleansers and the betaine, salt kept low, water making up the rest', () => {
        const f = build('shampoo');
        expect(f.balance.kind).toBe('surfactant');
        const surfactants = (pct(f, 'Iselux (SLMI)') ?? 0) + (pct(f, 'Coco-Glucoside (50%)') ?? 0) + (pct(f, 'CAPB (30% Active)') ?? 0);
        expect(surfactants).toBeCloseTo(15, 0);
        expect(pct(f, 'Sodium Chloride (Salt)')).toBeLessThanOrEqual(1);
        expect(f.ingredients.find(i => i.isQS)!.percentage).toBeGreaterThan(70);
    });
});

describe('when the library is missing something', () => {
    it('still builds, and reports what was needed but not found', () => {
        const f = build('light-lotion', without('Euxyl PE 9010', 'Olivem 1000', 'Montanov 68'));
        expect(f.missing.sort()).toEqual(['Emulsifier', 'Preservative']);
        expect(f.ingredients.length).toBeGreaterThan(5);
        expect(f.balance.total).toBeGreaterThan(0);
    });

    it('does not report optional ingredients as missing', () => {
        const f = build('light-lotion', without('DL-Panthenol', 'MCT Oil', 'Disodium EDTA'));
        expect(f.missing).toEqual([]);
        expect(names(f)).not.toContain('DL-Panthenol');
    });

    it('builds an empty formula, with everything required reported, from an empty library', () => {
        const t: StarterTemplate = getTemplate('toner')!;
        const f = build(t.id, []);
        expect(f.ingredients).toEqual([]);
        expect(f.missing).toEqual(['Water', 'Humectant', 'Soothing active', 'Preservative']);
    });
});
