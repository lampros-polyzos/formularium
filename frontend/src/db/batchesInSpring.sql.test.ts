// @vitest-environment node
//
// Runs the "batches move to Spring" migration on a real Postgres engine (PGlite): both versions of the old create function and the undo function are
// gone, the batch tables and their rows are untouched, and running it again (or on a database that never had them) changes nothing.

import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const migrations = import.meta.glob('./fixtures/20261120000000_batches_in_spring.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const MIGRATION_SQL = Object.values(migrations)[0];

describe.skipIf(!MIGRATION_SQL)('batches move to Spring (real Postgres)', () => {
    let db: PGlite;
    const functions = async () => (await db.query<{ sig: string }>(`select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as sig from pg_proc p where p.pronamespace = 'public'::regnamespace order by 1`)).rows.map(r => r.sig);

    beforeAll(async () => {
        db = new PGlite();
        await db.exec(`
          create table public.batches (id uuid primary key default gen_random_uuid(), name text);
          insert into public.batches (name) values ('Day Cream'), ('Night Cream');
          create function public.create_batch(p_formulation_id uuid, p_name text, p_lot_number text, p_batch_size_g numeric, p_target_ph numeric, p_notes text, p_lines jsonb, p_made_on date, p_container jsonb default null)
            returns uuid language sql as 'select gen_random_uuid()';
          create function public.void_batch(p_batch_id uuid) returns void language sql as 'select 1';
          create function public.unrelated() returns int language sql as 'select 1';
        `);
    }, 60_000);

    afterAll(async () => { await db?.close(); });

    it('removes the batch functions and nothing else', async () => {
        expect(await functions()).toContain('void_batch(p_batch_id uuid)');
        await db.exec(MIGRATION_SQL);
        expect(await functions()).toEqual(['unrelated()']);
    });

    it('keeps every batch', async () => {
        expect(Number((await db.query<{ n: number }>('select count(*)::int as n from public.batches')).rows[0].n)).toBe(2);
    });

    it('removes the older version of the create function too, and changes nothing when run again or on an empty database', async () => {
        await db.exec(`create function public.create_batch(p_formulation_id uuid, p_name text, p_lot_number text, p_batch_size_g numeric, p_target_ph numeric, p_notes text, p_lines jsonb, p_made_on date) returns uuid language sql as 'select gen_random_uuid()'`);
        await db.exec(MIGRATION_SQL);
        expect(await functions()).toEqual(['unrelated()']);

        const fresh = new PGlite();
        await fresh.exec(MIGRATION_SQL);
        await fresh.close();
    });
});
