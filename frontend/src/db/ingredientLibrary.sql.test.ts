// @vitest-environment node
//
// Runs the ingredient-library expansion on a real Postgres engine (PGlite, in-process) and checks what matters for
// the rest of the app: every new row is complete (the claim checks and rules read these fields), usage ranges are sane,
// nothing is added twice, and the Euxyl vegan fix only applies while it is still wrong.

import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// A glob (rather than an import) so the test skips, instead of breaking the whole run, if the fixture is missing
const migrations = import.meta.glob('./fixtures/20261111000000_ingredient_library_expansion.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const MIGRATION_SQL = Object.values(migrations)[0];

interface Row {
    inci_name: string; trade_name: string; function: string; min_usage_pct: number; max_usage_pct: number; default_min_usage: number; default_max_usage: number;
    cas_number: string; solubility: string; ionic_charge: string; physical_state: string; optimal_ph_min: number | null; optimal_ph_max: number | null;
    max_heating_temp_c: number; is_vegan: boolean; is_cosmos: boolean; cosmos_compliant: boolean; is_fragrance: boolean; is_sulfate: boolean;
    is_silicone: boolean; is_paraben: boolean; comedogenic_rating: number; cost_category: string; description: string; common_uses: string; notes: string | null;
}

const EUXYL_AND = '00000000-0000-0000-0000-00000000e001';
const EUXYL_COMMA = '00000000-0000-0000-0000-00000000e002';

describe.skipIf(!MIGRATION_SQL)('ingredient library expansion (real Postgres)', () => {
    let db: PGlite;
    let added: Row[];
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
          insert into public.ingredients (id, inci_name, trade_name, function, is_vegan) values
            ('${EUXYL_AND}', 'Phenoxyethanol (and) Ethylhexylglycerin', 'Euxyl PE 9010', 'Preservative', false),
            ('${EUXYL_COMMA}', 'Phenoxyethanol, Ethylhexylglycerin', 'Euxyl PE 9010', 'Preservative', true),
            ('00000000-0000-0000-0000-00000000e003', 'Glycerin', 'Vegetable Glycerin 99.5%', 'Humectant', true),
            -- already in the library under the same names: must not be added again
            ('00000000-0000-0000-0000-00000000e004', 'Xylitol', 'Xylitol', 'Humectant', true);
        `);
        await db.exec(MIGRATION_SQL);
        added = (await db.query<Row>(`select * from public.ingredients where id not in ('${EUXYL_AND}', '${EUXYL_COMMA}', '00000000-0000-0000-0000-00000000e003', '00000000-0000-0000-0000-00000000e004')`)).rows;
    }, 60_000);

    afterAll(async () => { await db?.close(); });

    it('adds the new ingredients, and skips one that is already there', async () => {
        expect(added.length).toBe(70); // 71 in the list, minus xylitol which already existed
        expect(await total()).toBe(4 + 70);
        expect(added.find(r => r.trade_name === 'Xylitol')).toBeUndefined();
    });

    it('adds nothing and changes nothing when run again', async () => {
        const before = (await db.query('select * from public.ingredients order by id')).rows;
        await db.exec(MIGRATION_SQL);
        expect(await total()).toBe(74);
        expect((await db.query('select * from public.ingredients order by id')).rows).toEqual(before);
    });

    it('gives every new row a unique pair of names', () => {
        expect(new Set(added.map(r => `${r.inci_name}|${r.trade_name}`.toLowerCase())).size).toBe(added.length);
    });

    it('fills in everything the claim checks and rules read', () => {
        for (const r of added) {
            for (const k of ['is_vegan', 'is_cosmos', 'cosmos_compliant', 'is_fragrance', 'is_sulfate', 'is_silicone', 'is_paraben', 'comedogenic_rating', 'cost_category',
                'solubility', 'ionic_charge', 'physical_state', 'max_heating_temp_c', 'function', 'description', 'common_uses', 'cas_number'] as const) {
                expect(r[k], `${r.trade_name}: ${k}`).not.toBeNull();
            }
            expect(r.is_cosmos, `${r.trade_name}: the two COSMOS fields agree`).toBe(r.cosmos_compliant);
        }
    });

    it('gives each a sensible allowed range, with the typical range inside it', () => {
        for (const r of added) {
            const [min, max, lo, hi] = [r.min_usage_pct, r.max_usage_pct, r.default_min_usage, r.default_max_usage].map(Number);
            expect(min, r.trade_name).toBeGreaterThan(0);
            expect(min, r.trade_name).toBeLessThanOrEqual(max);
            expect(lo, r.trade_name).toBeGreaterThanOrEqual(min);
            expect(hi, r.trade_name).toBeLessThanOrEqual(max);
            expect(lo, r.trade_name).toBeLessThanOrEqual(hi);
            // The balancer ignores a typical range of 0-100 as a placeholder
            expect([lo, hi], r.trade_name).not.toEqual([0, 100]);
        }
    });

    it('has a pH window only as a full, ordered pair', () => {
        for (const r of added) {
            expect(r.optimal_ph_min === null, r.trade_name).toBe(r.optimal_ph_max === null);
            if (r.optimal_ph_min !== null) expect(Number(r.optimal_ph_min), r.trade_name).toBeLessThan(Number(r.optimal_ph_max));
        }
    });

    it('uses only the vocabulary the rest of the app understands', () => {
        for (const r of added) {
            expect(['water', 'oil', 'dispersible', 'alcohol'], r.trade_name).toContain(r.solubility);
            expect(['non-ionic', 'anionic', 'cationic', 'amphoteric'], r.trade_name).toContain(r.ionic_charge);
            expect(['powder', 'liquid', 'solid'], r.trade_name).toContain(r.physical_state);
            expect(['low', 'medium', 'high'], r.trade_name).toContain(r.cost_category);
        }
    });

    it('marks animal-derived or uncertain claims honestly', () => {
        const by = (name: string) => added.find(r => r.trade_name === name)!;
        expect(by('Honey (Raw)').is_vegan).toBe(false);
        for (const r of added.filter(x => x.trade_name !== 'Honey (Raw)')) expect(r.is_vegan, r.trade_name).toBe(true);
        // None of the additions are sulfates, silicones or parabens
        for (const r of added) expect([r.is_sulfate, r.is_silicone, r.is_paraben], r.trade_name).toEqual([false, false, false]);
    });

    it('marks every essential oil and hydrosol as fragrance, and nothing else', () => {
        for (const r of added) {
            const scented = /essential oil/i.test(r.trade_name) || /hydrosol/i.test(r.trade_name);
            expect(r.is_fragrance, r.trade_name).toBe(scented);
        }
    });

    it('keeps the essential oil levels low enough not to trip the fragrance rule', () => {
        for (const r of added.filter(x => /essential oil/i.test(x.trade_name))) expect(Number(r.max_usage_pct), r.trade_name).toBeLessThanOrEqual(1);
    });

    it('names the phototoxic citrus oils so the app can warn about them, and gives the safe grade a name that says so', () => {
        const names = added.map(r => r.inci_name);
        expect(names).toEqual(expect.arrayContaining(['Citrus Limon (Lemon) Peel Oil', 'Citrus Paradisi (Grapefruit) Peel Oil']));
        expect(added.find(r => /Lime/.test(r.trade_name))!.trade_name).toMatch(/Furocoumarin-Free/);
        expect(added.find(r => r.trade_name.startsWith('Lemon'))!.notes).toMatch(/phototoxic/i);
    });

    it('describes every UV filter as such, with the regional approval caveat where it matters', () => {
        const filters = added.filter(r => /UV Filter/.test(r.function));
        expect(filters.map(r => r.trade_name).sort()).toEqual(['Octisalate', 'Uvinul A Plus', 'Uvinul T 150']);
        for (const name of ['Uvinul A Plus', 'Uvinul T 150']) expect(added.find(r => r.trade_name === name)!.notes).toMatch(/Not approved .* USA/);
    });

    it('sets the charge of each new thickener, since an anionic one clashes with cationic conditioners', () => {
        const charge = (name: string) => added.find(r => r.trade_name === name)!.ionic_charge;
        for (const name of ['Carboxymethylcellulose (CMC)', 'Sodium Alginate', 'Carrageenan (Kappa / Iota)', 'Pectin', 'Gum Arabic', 'Hectorite Clay']) expect(charge(name), name).toBe('anionic');
        for (const name of ['Konjac Glucomannan', 'Locust Bean Gum', 'Agar-Agar', 'Pullulan', 'Fumed Silica (Hydrophilic)']) expect(charge(name), name).toBe('non-ionic');
    });

    it('gives the organic-acid preservatives a pH window and a solvent hint', () => {
        for (const name of ['Sorbic Acid', 'Benzoic Acid']) {
            const r = added.find(x => x.trade_name === name)!;
            expect(Number(r.optimal_ph_max), name).toBeLessThanOrEqual(6);
            expect(r.solubility, name).toBe('alcohol');
        }
    });

    it('fixes the Euxyl vegan flag on the row that was wrong, and only that row', async () => {
        const rows = (await db.query<{ id: string; is_vegan: boolean }>(`select id, is_vegan from public.ingredients where id in ('${EUXYL_AND}', '${EUXYL_COMMA}')`)).rows;
        expect(Object.fromEntries(rows.map(r => [r.id, r.is_vegan]))).toEqual({ [EUXYL_AND]: true, [EUXYL_COMMA]: true });
    });

    it('does not undo a later hand edit of the Euxyl row when run again', async () => {
        await db.query(`update public.ingredients set is_vegan = false, trade_name = 'Euxyl PE 9010 (mine)' where id = '${EUXYL_AND}'`);
        await db.exec(MIGRATION_SQL);
        expect((await db.query<{ is_vegan: boolean }>(`select is_vegan from public.ingredients where id = '${EUXYL_AND}'`)).rows[0].is_vegan).toBe(false);
    });

    it('does not touch the existing ingredients otherwise', async () => {
        const row = (await db.query<{ trade_name: string; is_vegan: boolean }>(`select trade_name, is_vegan from public.ingredients where id = '00000000-0000-0000-0000-00000000e003'`)).rows[0];
        expect(row).toEqual({ trade_name: 'Vegetable Glycerin 99.5%', is_vegan: true });
    });
});
