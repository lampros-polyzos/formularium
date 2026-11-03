// @vitest-environment node
//
// Runs the ingredient-usage cleanup on a real Postgres engine (PGlite, in-process) against a copy of the 41
// placeholder rows as they were in the library (id and allowed range), and checks the guarantees that matter:
// every one gets a believable typical range inside its allowed range, nothing else changes, and hand edits and
// reruns are left alone.

import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// A glob (rather than an import) so the test skips, instead of breaking the whole run, if the fixture is missing
const migrations = import.meta.glob('./fixtures/20261110000000_ingredient_usage_defaults.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const MIGRATION_SQL = Object.values(migrations)[0];

/** id, allowed minimum, allowed maximum, name: the library as it was before the cleanup */
const PLACEHOLDERS: [string, number, number, string][] = [
    ['3e2e23b8-323d-4305-b315-21e9aa49cdc9', 5, 20, "L-Ascorbic Acid"],
    ['55bbc69e-f41d-4694-af71-a1f6f2a8a19a', 2, 5, "Niacinamide USP"],
    ['067b33df-2bde-4e81-9b33-f1e93b4cf86f', 0.5, 10, "Lactic Acid 80%"],
    ['578ee98d-925d-45ee-8c08-31beedee3299', 0.5, 2, "Salicylic Acid USP"],
    ['b84a9617-6594-43e6-a56b-34986655cd93', 0.1, 0.5, "Allantoin"],
    ['8720eb2d-1813-464c-9c9c-8073ce672e75', 0.1, 1, "Vitamin E (Mixed Tocopherols 95%)"],
    ['8c43a84a-4aa1-4292-bc4b-f10fe2f88a88', 1, 100, "Shea Butter (Refined)"],
    ['b37e89c4-22dc-4706-827c-5a9b2a3af1c2', 1, 100, "Fractionated Coconut Oil"],
    ['64b04b0e-53ca-4683-a39e-a6e9f40a7d94', 1, 100, "Jojoba Oil (Cold Pressed)"],
    ['b5085f05-bb2b-4735-93d9-1237ed26d3d3', 1, 100, "Wheat Germ Oil (Refined)"],
    ['da8e041e-1b14-4c9a-bd9d-97254a1ee974', 1, 10, "Rosehip Seed Oil (Cold Pressed)"],
    ['ba799c2e-b6b5-4277-bec5-10664437e5a3', 1, 10, "BTMS-50"],
    ['5bfcc64b-aecd-4895-b20b-256eac8c8510', 1, 5, "Cetearyl Alcohol 30/70"],
    ['a77a54ad-becb-4776-a4c9-9583d00239c2', 1, 100, "Olive Squalane"],
    ['ff9c44a3-e3b3-47d0-9000-a80f05763ea1', 0.5, 10, "Dimethicone 350"],
    ['2f5f42e8-65e0-4459-a634-3a2f00f614e7', 1, 100, "Anhydrous Lanolin"],
    ['32877f37-c1dc-446c-a063-a71a9448b20b', 2, 10, "Emulsifying Wax NF"],
    ['eeef8f3c-309a-4a90-add8-fa068584497a', 1.5, 5, "Olivem 1000"],
    ['308ac19c-a87b-4790-b117-a50ba5f25a23', 0.1, 1, "Lavender Essential Oil"],
    ['1569a421-a538-4f77-97e1-56e6e0afcd0b', 0.1, 2, "Hyaluronic Acid (High Molecular Weight)"],
    ['2595ba67-e0e0-42da-ad6f-c111e3af0118', 1, 10, "Vegetable Glycerin 99.5%"],
    ['0f9098c9-2390-4b22-b456-65401454f0af', 1, 100, "Aloe Vera Juice (1X)"],
    ['6bc48252-a1a3-4839-9f41-e732d0bf1550', 1, 5, "DL-Panthenol (Pro-Vitamin B5)"],
    ['4e3b13a0-8257-43df-b7cd-7f0e7ba1d89a', 1, 10, "1,3-Propanediol (Zemea)"],
    ['7a8f2f85-1abb-4753-b2f7-fb126fc517ae', 0.01, 1.5, "Citric Acid Anhydrous"],
    ['e575acf9-0663-4aad-b8c2-45ed641cdafe', 0.01, 1.5, "L-Arginine"],
    ['c6849374-903a-415f-b0b6-032380ece9a9', 0.5, 1.1, "Euxyl PE 9010"],
    ['e327aed4-9eea-4842-81ba-8c6181c0bddc', 0.5, 1.1, "Euxyl PE 9010"],
    ['8ecd26c8-e83a-4005-a595-66f7fadc615f', 0.6, 1, "Geogard ECT (Preservative Eco)"],
    ['9d26c5e2-84cc-4794-b94b-cd0d1d99a3af', 0.1, 0.5, "Liquid Germall Plus"],
    ['5b2dcc9e-3925-45cc-8651-041a0faad94d', 0.1, 0.4, "Methylparaben"],
    ['a3d5cfb4-b587-4fd7-ae7b-2dabc0dbcda8', 0.5, 2, "HEC"],
    ['ccb3f53d-3ddf-4cd8-9429-152dce8e3704', 0.1, 1, "Xanthan Gum Soft"],
    ['ad90eb63-7bab-4d09-a061-489465e7ce6e', 1, 10, "PEG-40 HCO"],
    ['2530a463-a9df-42ac-a228-bcc84f9109e7', 1, 10, "Polysorbate 20 (Tween 20)"],
    ['2d5b291a-1d35-4cb2-b6be-e24f72097b07', 1, 100, "Distilled Water"],
    ['9e52d27b-2b32-41fb-b9b9-6d82feac6e3b', 2, 40, "CAPB (30% Active)"],
    ['79fd2eae-bed0-4eeb-b9ed-a1c778815e69', 5, 60, "SCI (Baby Foam)"],
    ['415f0fdb-705b-4131-a4bd-6c3bcaf3f9d5', 1, 20, "SLS Needles"],
    ['f38ee4fa-8d23-4d94-b796-e0da92b4491f', 2, 40, "Decyl Glucoside"],
    ['e297d8ee-68d6-4d0d-9181-aa0e5fd2541b', 1, 5, "Cetyl Alcohol"],
];

const EDITED = '00000000-0000-0000-0000-0000000000e1';
const REAL = '00000000-0000-0000-0000-0000000000e2';
const OUTSIDE = '00000000-0000-0000-0000-0000000000e3';

describe.skipIf(!MIGRATION_SQL)('ingredient usage cleanup (real Postgres)', () => {
    let db: PGlite;
    const usage = async (id: string) => (await db.query<{ lo: number; hi: number }>(
        'select default_min_usage::float8 as lo, default_max_usage::float8 as hi from public.ingredients where id = $1', [id])).rows[0];

    beforeAll(async () => {
        db = new PGlite();
        await db.exec(`
          create table public.ingredients (
            id uuid primary key, trade_name text,
            min_usage_pct numeric, max_usage_pct numeric, default_min_usage numeric, default_max_usage numeric);
        `);
        for (const [id, min, max, name] of PLACEHOLDERS) {
            await db.query('insert into public.ingredients values ($1, $2, $3, $4, 0, 100)', [id, name, min, max]);
        }
        // Someone already set this one by hand; this one was never a placeholder; this one's allowed range is narrower than the cleanup assumes
        await db.query(`insert into public.ingredients values ('${EDITED}', 'Edited', 1, 10, 4, 6)`);
        await db.query(`insert into public.ingredients values ('${REAL}', 'Real', 0.5, 5, 1, 3)`);
        await db.query(`insert into public.ingredients values ('${OUTSIDE}', 'Unlisted', 1, 10, 0, 100)`);
        await db.exec(MIGRATION_SQL);
    }, 60_000);

    afterAll(async () => { await db?.close(); });

    it('covers exactly the 41 placeholder rows', () => {
        expect(PLACEHOLDERS).toHaveLength(41);
        expect(new Set(PLACEHOLDERS.map(p => p[0])).size).toBe(41);
    });

    it('leaves no placeholder behind among them', async () => {
        const { rows } = await db.query<{ n: number }>(
            `select count(*)::int as n from public.ingredients where default_min_usage = 0 and default_max_usage = 100 and id <> '${OUTSIDE}'`);
        expect(rows[0].n).toBe(0);
    });

    it.each(PLACEHOLDERS)('%s: a typical range that sits inside the allowed %s-%s (%s)', async (id, min, max) => {
        const { lo, hi } = await usage(id);
        expect(lo).toBeGreaterThanOrEqual(min);
        expect(hi).toBeLessThanOrEqual(max);
        expect(lo).toBeLessThanOrEqual(hi);
        expect(hi).toBeGreaterThan(0);
    });

    it('leaves the allowed range of every ingredient alone', async () => {
        for (const [id, min, max] of PLACEHOLDERS) {
            const { rows } = await db.query<{ a: number; b: number }>('select min_usage_pct::float8 as a, max_usage_pct::float8 as b from public.ingredients where id = $1', [id]);
            expect([rows[0].a, rows[0].b]).toEqual([min, max]);
        }
    });

    it('does not touch ingredients that were edited by hand, were never placeholders, or are not on the list', async () => {
        expect(await usage(EDITED)).toEqual({ lo: 4, hi: 6 });
        expect(await usage(REAL)).toEqual({ lo: 1, hi: 3 });
        expect(await usage(OUTSIDE)).toEqual({ lo: 0, hi: 100 });
    });

    it('gives water its full allowed range, since it fills whatever is left', async () => {
        const water = PLACEHOLDERS.find(p => p[3] === 'Distilled Water')!;
        expect(await usage(water[0])).toEqual({ lo: water[1], hi: water[2] });
    });

    it('changes nothing when run again, even over a hand edit made in between', async () => {
        const [id] = PLACEHOLDERS[0];
        await db.query('update public.ingredients set default_min_usage = 11, default_max_usage = 12 where id = $1', [id]);
        const before = (await db.query('select id, default_min_usage, default_max_usage from public.ingredients order by id')).rows;
        await db.exec(MIGRATION_SQL);
        expect((await db.query('select id, default_min_usage, default_max_usage from public.ingredients order by id')).rows).toEqual(before);
        expect(await usage(id)).toEqual({ lo: 11, hi: 12 });
    });
});
