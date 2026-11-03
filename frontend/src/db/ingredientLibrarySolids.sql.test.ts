// @vitest-environment node
//
// Runs the second ingredient-library expansion (solid forms of solutions, peptides and extracts) on a real Postgres engine
// (PGlite, in-process) and checks what matters: every row is complete, each solid form is scaled to the solution it comes
// from, nothing is added twice, and the safety-relevant notes are there.

import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// A glob (rather than an import) so the test skips, instead of breaking the whole run, if the fixture is missing
const migrations = import.meta.glob('./fixtures/20261112000000_ingredient_library_solids_extracts_peptides.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const MIGRATION_SQL = Object.values(migrations)[0];

interface Row {
    inci_name: string; trade_name: string; function: string; min_usage_pct: number; max_usage_pct: number; default_min_usage: number; default_max_usage: number;
    cas_number: string; solubility: string; ionic_charge: string; physical_state: string; optimal_ph_min: number | null; optimal_ph_max: number | null;
    max_heating_temp_c: number; is_vegan: boolean; is_cosmos: boolean; cosmos_compliant: boolean; is_fragrance: boolean; is_sulfate: boolean;
    is_silicone: boolean; is_paraben: boolean; comedogenic_rating: number; cost_category: string; description: string; common_uses: string; notes: string | null;
}

/** The solid forms: the new trade name, the INCI of the solution it comes from, and that solution's strongest usage (%) */
const SOLID_FORMS: [string, string, number][] = [
    ['Glycolic Acid (Crystals, 99%)', 'Glycolic Acid', 10],
    ['Sodium PCA (Powder, 98%)', 'Sodium PCA', 5],
    ['Sorbitol (Powder, 98%)', 'Sorbitol', 10],
    ['Hydrolyzed Wheat Protein (Powder)', 'Hydrolyzed Wheat Protein', 5],
    ['Hydrolyzed Rice Protein (Powder)', 'Hydrolyzed Rice Protein', 5],
    ['Hydrolyzed Oat Protein (Powder)', 'Hydrolyzed Oat Protein', 5],
    ['Hydrolyzed Keratin (Powder)', 'Hydrolyzed Keratin', 5],
    ['Hydrolyzed Silk (Powder)', 'Hydrolyzed Silk', 5],
    ['Beta-Glucan (Oat, Powder)', 'Beta-Glucan', 5],
    ['Acetyl Hexapeptide-8 (Powder)', 'Acetyl Hexapeptide-8', 10],
    ['Hydroxypinacolone Retinoate (Powder)', 'Hydroxypinacolone Retinoate', 10],
    ['Green Tea Extract (Powder)', 'Camellia Sinensis Leaf Extract', 5],
];

describe.skipIf(!MIGRATION_SQL)('ingredient library: solid forms, peptides and extracts (real Postgres)', () => {
    let db: PGlite;
    let added: Row[];
    const by = (trade: string) => added.find(r => r.trade_name === trade)!;
    const total = async () => Number((await db.query<{ n: number }>('select count(*)::int as n from public.ingredients')).rows[0].n);

    beforeAll(async () => {
        db = new PGlite();
        await db.exec(`
          create table public.ingredients (
            id uuid primary key, inci_name text, trade_name text, function text, min_usage_pct numeric, max_usage_pct numeric, cas_number text,
            solubility text, ionic_charge text, physical_state text, optimal_ph_min numeric, optimal_ph_max numeric, max_heating_temp_c integer,
            is_vegan boolean, is_cosmos boolean, cost_category text, description text, common_uses text, is_sulfate boolean, is_silicone boolean,
            is_paraben boolean, is_fragrance boolean, cosmos_compliant boolean, comedogenic_rating integer, user_id uuid,
            default_min_usage numeric, default_max_usage numeric, notes text);
          insert into public.ingredients (id, inci_name, trade_name, function) values
            ('00000000-0000-0000-0000-00000000f001', 'Glycolic Acid', 'Glycolic Acid 70%', 'Active (AHA)'),
            -- already in the library under the same names: must not be added again
            ('00000000-0000-0000-0000-00000000f002', 'Carnosine', 'Carnosine (L-Carnosine)', 'Active (Antioxidant)');
        `);
        await db.exec(MIGRATION_SQL);
        added = (await db.query<Row>(`select * from public.ingredients where id not in ('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-00000000f002')`)).rows;
    }, 60_000);

    afterAll(async () => { await db?.close(); });

    it('adds the ingredients, and skips one that is already there', async () => {
        expect(added.length).toBe(33); // 34 in the list, minus carnosine which already existed
        expect(await total()).toBe(2 + 33);
        expect(added.find(r => r.trade_name === 'Carnosine (L-Carnosine)')).toBeUndefined();
    });

    it('adds nothing and changes nothing when run again', async () => {
        const before = (await db.query('select * from public.ingredients order by id')).rows;
        await db.exec(MIGRATION_SQL);
        expect(await total()).toBe(35);
        expect((await db.query('select * from public.ingredients order by id')).rows).toEqual(before);
    });

    it('fills in everything the claim checks and rules read', () => {
        for (const r of added) {
            for (const k of ['is_vegan', 'is_cosmos', 'cosmos_compliant', 'is_fragrance', 'is_sulfate', 'is_silicone', 'is_paraben', 'comedogenic_rating', 'cost_category',
                'solubility', 'ionic_charge', 'physical_state', 'max_heating_temp_c', 'function', 'description', 'common_uses', 'cas_number'] as const) {
                expect(r[k], `${r.trade_name}: ${k}`).not.toBeNull();
            }
            expect(r.is_cosmos, `${r.trade_name}: the two COSMOS fields agree`).toBe(r.cosmos_compliant);
            expect([r.is_sulfate, r.is_silicone, r.is_paraben, r.is_fragrance], r.trade_name).toEqual([false, false, false, false]);
        }
    });

    it('gives each a sensible allowed range, with the typical range inside it and not a 0-100 placeholder', () => {
        for (const r of added) {
            const [min, max, lo, hi] = [r.min_usage_pct, r.max_usage_pct, r.default_min_usage, r.default_max_usage].map(Number);
            expect(min, r.trade_name).toBeGreaterThan(0);
            expect(min, r.trade_name).toBeLessThanOrEqual(max);
            expect(lo, r.trade_name).toBeGreaterThanOrEqual(min);
            expect(hi, r.trade_name).toBeLessThanOrEqual(max);
            expect(lo, r.trade_name).toBeLessThanOrEqual(hi);
            expect([lo, hi], r.trade_name).not.toEqual([0, 100]);
        }
    });

    it('uses only the vocabulary the rest of the app understands, and a pH window only as an ordered pair', () => {
        for (const r of added) {
            expect(['water', 'oil', 'dispersible', 'alcohol'], r.trade_name).toContain(r.solubility);
            expect(['non-ionic', 'anionic', 'cationic', 'amphoteric'], r.trade_name).toContain(r.ionic_charge);
            expect(['powder', 'liquid', 'solid'], r.trade_name).toContain(r.physical_state);
            expect(['low', 'medium', 'high'], r.trade_name).toContain(r.cost_category);
            expect(r.optimal_ph_min === null, r.trade_name).toBe(r.optimal_ph_max === null);
            if (r.optimal_ph_min !== null) expect(Number(r.optimal_ph_min), r.trade_name).toBeLessThan(Number(r.optimal_ph_max));
        }
    });

    describe('the solid forms of solutions', () => {
        it.each(SOLID_FORMS)('%s is the same ingredient as its solution (%s), as a powder or crystal', (trade, inci) => {
            const r = by(trade);
            expect(r.inci_name).toBe(inci);
            expect(r.physical_state).toBe('powder');
        });

        it.each(SOLID_FORMS)('%s is used at less than its solution (strongest %s%%) because it is more concentrated', (trade, _inci, solutionMax) => {
            expect(Number(by(trade).max_usage_pct)).toBeLessThan(solutionMax);
        });

        it.each(SOLID_FORMS)('%s says how much to use compared with the solution', trade => {
            expect(by(trade).notes ?? '').toMatch(/as much|more concentrated|stronger|ten times/i);
        });

        it('keeps what does not change with the form: the keratin, silk and collagen powders are not vegan, the others are', () => {
            const notVegan = added.filter(r => !r.is_vegan).map(r => r.trade_name).sort();
            expect(notVegan).toEqual(['Hydrolyzed Collagen (Powder)', 'Hydrolyzed Keratin (Powder)', 'Hydrolyzed Silk (Powder)']);
        });

        it('gives the retinoid powder a solvent hint, since it must be dissolved first', () => {
            const hpr = by('Hydroxypinacolone Retinoate (Powder)');
            expect(hpr.solubility).toBe('alcohol');
            expect(hpr.notes).toMatch(/dissolved first/);
        });

        it('warns about the acid and gluten where they matter', () => {
            expect(by('Glycolic Acid (Crystals, 99%)').notes).toMatch(/gloves and eye protection/);
            expect(by('Hydrolyzed Wheat Protein (Powder)').notes).toMatch(/gluten/i);
        });
    });

    describe('the peptides', () => {
        const PEPTIDES = ['Palmitoyl Tripeptide-5 (Syn-Coll)', 'Acetyl Tetrapeptide-5 (Eyeseryl Solution)', 'Palmitoyl Pentapeptide-4 (Matrixyl Solution, 500 ppm)', 'GHK (Tripeptide-1)', 'Acetyl Hexapeptide-8 (Powder)'];

        it('are heat-sensitive: added in the cool-down, at 40°C or below', () => {
            for (const name of PEPTIDES) expect(by(name).max_heating_temp_c, name).toBeLessThanOrEqual(40);
        });

        it('have the pH window peptides need (acidic products break them down)', () => {
            for (const name of PEPTIDES) {
                const r = by(name);
                expect(Number(r.optimal_ph_min), name).toBeGreaterThanOrEqual(4);
                expect(Number(r.optimal_ph_max), name).toBeLessThanOrEqual(7);
            }
        });

        it('use the supplier\'s own dose for the solutions', () => {
            expect([by('Palmitoyl Tripeptide-5 (Syn-Coll)').min_usage_pct, by('Palmitoyl Tripeptide-5 (Syn-Coll)').max_usage_pct].map(Number)).toEqual([1, 3]);
            expect([by('Acetyl Tetrapeptide-5 (Eyeseryl Solution)').min_usage_pct, by('Acetyl Tetrapeptide-5 (Eyeseryl Solution)').max_usage_pct].map(Number)).toEqual([1, 10]);
            expect(by('Palmitoyl Pentapeptide-4 (Matrixyl Solution, 500 ppm)').notes).toMatch(/500 ppm/);
        });

        it('has a plant-based protein alongside the animal-derived one', () => {
            expect(by('Hydrolyzed Pea Protein (Powder)').is_vegan).toBe(true);
            expect(by('Hydrolyzed Collagen (Powder)').notes).toMatch(/Not vegan/);
        });
    });

    describe('the extracts', () => {
        const EXTRACTS = ['Ivy Extract', 'Horse Chestnut Extract', 'Capsicum Fruit Extract', "Butcher's Broom Extract", 'Ginkgo Leaf Extract', 'Arnica Flower Extract', 'Guarana Seed Extract',
            'Green Coffee Seed Extract', 'Bladderwrack (Fucus) Extract', 'Grape Seed Extract', 'Ginger Root Extract', 'Horsetail Extract', 'Nettle Leaf Extract', 'Mulberry Root Extract', 'Turmeric Root Extract'];

        it('are all there, as water-soluble liquids with a pH window, a heat limit for a cool-down addition, and an honest COSMOS flag', () => {
            for (const name of EXTRACTS) {
                const r = by(name);
                expect(r.solubility, name).toBe('water');
                expect(r.physical_state, name).toBe('liquid');
                expect(r.max_heating_temp_c, name).toBeLessThanOrEqual(50);
                expect(r.optimal_ph_min, name).not.toBeNull();
                expect(r.cosmos_compliant, `${name} asks you to check the certificate`).toBe(false);
                expect(r.notes, name).toMatch(/COSMOS certificate/);
            }
        });

        it('keep the irritating ones low, and tell you how to use them safely', () => {
            expect(Number(by('Capsicum Fruit Extract').max_usage_pct)).toBeLessThanOrEqual(1);
            expect(Number(by('Ginger Root Extract').max_usage_pct)).toBeLessThanOrEqual(2);
            for (const name of ['Capsicum Fruit Extract', 'Ginger Root Extract']) expect(by(name).notes, name).toMatch(/patch test/i);
            expect(by('Capsicum Fruit Extract').notes).toMatch(/Never use on the face/);
            expect(by('Arnica Flower Extract').notes).toMatch(/broken|open wounds/);
            expect(by('Ivy Extract').notes).toMatch(/patch test/i);
            expect(by('Horse Chestnut Extract').notes).toMatch(/patch test/i);
        });

        it('leaves out claims about results that are not proven', () => {
            expect(by('Ivy Extract').notes).toMatch(/do not promise results/);
            expect(by('Grape Seed Extract').notes).toMatch(/not grape seed oil/);
        });

        it('names the plant exactly as the rules expect, so they recognise it', () => {
            const inci = (name: string) => by(name).inci_name.toLowerCase();
            expect(inci('Ivy Extract')).toContain('hedera helix');
            expect(inci('Horse Chestnut Extract')).toContain('aesculus hippocastanum');
            expect(inci("Butcher's Broom Extract")).toContain('ruscus aculeatus');
            expect(inci('Capsicum Fruit Extract')).toContain('capsicum');
            expect(inci('Ginger Root Extract')).toContain('zingiber officinale');
            expect(inci('Arnica Flower Extract')).toContain('arnica');
            expect(inci('Guarana Seed Extract')).toContain('paullinia cupana');
            expect(inci('Green Coffee Seed Extract')).toContain('coffea arabica');
            expect(inci('Bladderwrack (Fucus) Extract')).toContain('fucus vesiculosus');
        });
    });
});
