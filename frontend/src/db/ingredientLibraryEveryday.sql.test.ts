// @vitest-environment node
//
// Runs the third ingredient-library expansion (everyday ingredients found by checking the EU glossary of ingredient names) on a
// real Postgres engine (PGlite, in-process) and checks what matters: every row is complete, every INCI name is an official
// EU label name, nothing is added twice, and the safety-relevant notes are there.

import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// A glob (rather than an import) so the test skips, instead of breaking the whole run, if the fixture is missing
const migrations = import.meta.glob('./fixtures/20261115000000_ingredient_library_everyday_additions.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const MIGRATION_SQL = Object.values(migrations)[0];

interface Row {
    inci_name: string; trade_name: string; function: string; min_usage_pct: number; max_usage_pct: number; default_min_usage: number; default_max_usage: number;
    cas_number: string; solubility: string; ionic_charge: string; physical_state: string; optimal_ph_min: number | null; optimal_ph_max: number | null;
    max_heating_temp_c: number; is_vegan: boolean; is_cosmos: boolean; cosmos_compliant: boolean; is_fragrance: boolean; is_sulfate: boolean;
    is_silicone: boolean; is_paraben: boolean; comedogenic_rating: number; cost_category: string; description: string; common_uses: string; notes: string | null;
}

describe.skipIf(!MIGRATION_SQL)('ingredient library: everyday additions (real Postgres)', () => {
    let db: PGlite;
    let added: Row[];
    const by = (inci: string) => added.find(r => r.inci_name === inci)!;
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
            -- already in the library under the same names: must not be added again
            ('00000000-0000-0000-0000-00000000f001', 'Hydroxyacetophenone', 'Hydroxyacetophenone (4-HAP)', 'Preservative Booster'),
            -- the same INCI under another trade name is a different product and is still added
            ('00000000-0000-0000-0000-00000000f002', 'Cocamide MEA', 'Some Other Cocamide MEA', 'Surfactant');
        `);
        await db.exec(MIGRATION_SQL);
        added = (await db.query<Row>(`select * from public.ingredients where id not in ('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-00000000f002')`)).rows;
    }, 60_000);

    afterAll(async () => { await db?.close(); });

    it('adds the ingredients, and skips one that is already there', async () => {
        expect(added.length).toBe(31); // 32 in the list, minus hydroxyacetophenone which already existed
        expect(await total()).toBe(2 + 31);
        expect(added.find(r => r.inci_name === 'Hydroxyacetophenone')).toBeUndefined();
        expect(by('Cocamide MEA').trade_name).toBe('Cocamide MEA (Flakes)');
    });

    it('adds nothing and changes nothing when run again', async () => {
        const before = (await db.query('select * from public.ingredients order by id')).rows;
        await db.exec(MIGRATION_SQL);
        expect(await total()).toBe(33);
        expect((await db.query('select * from public.ingredients order by id')).rows).toEqual(before);
    });

    it('fills in everything the claim checks and rules read', () => {
        for (const r of added) {
            for (const k of ['is_vegan', 'is_cosmos', 'cosmos_compliant', 'is_fragrance', 'is_sulfate', 'is_silicone', 'is_paraben', 'comedogenic_rating', 'cost_category',
                'solubility', 'ionic_charge', 'physical_state', 'max_heating_temp_c', 'function', 'description', 'common_uses', 'cas_number', 'notes'] as const) {
                expect(r[k], `${r.trade_name}: ${k}`).not.toBeNull();
            }
            expect(r.is_cosmos, `${r.trade_name}: the two COSMOS fields agree`).toBe(r.cosmos_compliant);
            expect([r.is_sulfate, r.is_paraben, r.is_fragrance], r.trade_name).toEqual([false, false, false]);
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
            expect(r.comedogenic_rating, r.trade_name).toBeGreaterThanOrEqual(0);
            expect(r.comedogenic_rating, r.trade_name).toBeLessThanOrEqual(5);
            expect(r.optimal_ph_min === null, r.trade_name).toBe(r.optimal_ph_max === null);
            if (r.optimal_ph_min !== null) expect(Number(r.optimal_ph_min), r.trade_name).toBeLessThan(Number(r.optimal_ph_max));
        }
    });

    it('marks exactly the two silicones as silicones', () => {
        expect(added.filter(r => r.is_silicone).map(r => r.inci_name).sort()).toEqual(['Cetyl Dimethicone', 'Phenyl Trimethicone']);
    });

    it('uses plain INCI names, each only once', () => {
        // Checked against the EU glossary (Decision (EU) 2025/1175) when this list was made; the glossary is not kept in the repo.
        const names = added.map(r => r.inci_name);
        expect(new Set(names).size, 'no INCI name twice').toBe(names.length);
        for (const name of names) expect(name, 'a plain INCI name, no brackets or blends').toMatch(/^[A-Z][A-Za-z0-9 ,'-]+$/);
        expect(names.every(n => n === n.trim())).toBe(true);
    });

    describe('the figures that matter for safety', () => {
        it('keeps chlorphenesin within its EU limit of 0.3%', () => {
            expect(Number(by('Chlorphenesin').max_usage_pct)).toBe(0.3);
        });

        it('keeps the antioxidant Lipochroman-6 to the supplier range of 0.01-0.05%', () => {
            const r = by('Dimethylmethoxy Chromanol');
            expect([Number(r.min_usage_pct), Number(r.max_usage_pct)]).toEqual([0.01, 0.05]);
            expect(r.notes).toMatch(/70°C/);
        });

        it('keeps octinoxate within the EU limit of 10% and says what to watch for', () => {
            const r = by('Ethylhexyl Methoxycinnamate');
            expect(Number(r.max_usage_pct)).toBeLessThanOrEqual(10);
            expect(Number(r.default_max_usage)).toBeLessThanOrEqual(7.5);   // the lower US limit
            expect(r.notes).toMatch(/avobenzone/);
            expect(r.notes).toMatch(/Hawaii/);
        });

        it('warns about the corrosive base, and about the nitrosamine risk of cocamide MEA', () => {
            expect(by('Potassium Hydroxide').notes).toMatch(/gloves and eye protection/);
            expect(by('Cocamide MEA').notes).toMatch(/nitrosamine/);
        });

        it('says how fragile the omega-3 oils are', () => {
            for (const inci of ['Borago Officinalis Seed Oil', 'Salvia Hispanica Seed Oil', 'Camelina Sativa Seed Oil', 'Plukenetia Volubilis Seed Oil']) {
                expect(Number(by(inci).max_heating_temp_c), inci).toBeLessThanOrEqual(40);
                expect(by(inci).notes, inci).toMatch(/cool|oxidiz/i);
            }
        });

        it('does not claim COSMOS for the extracts and the synthetic ingredients', () => {
            for (const inci of ['Arctium Lappa Root Extract', 'Echinacea Purpurea Extract', 'Ascophyllum Nodosum Extract', 'Ceteareth-20', 'Phenyl Trimethicone', 'Microcrystalline Wax']) {
                expect(by(inci).is_cosmos, inci).toBe(false);
            }
        });

        it('says where the vegetable origin has to be confirmed', () => {
            for (const inci of ['Sorbitan Stearate', 'Sorbitan Oleate', 'Glycol Distearate', 'Ceteareth-20', 'Magnesium Stearate']) {
                expect(by(inci).notes, inci).toMatch(/certificate/);
            }
        });
    });
});
