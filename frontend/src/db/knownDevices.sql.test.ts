// @vitest-environment node
//
// Runs the known-devices migration on a real Postgres engine (PGlite), with a stand-in app_users table: a browser is stored once per account (the same browser for
// two accounts is two rows), goes with its account, is found by its last-seen date for the purge, the table is closed to the browser roles through row-level
// security, and running the file again changes nothing. The file is read from supabase/migrations itself, not from a copy.

import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const MIGRATION_SQL = readFileSync(new URL('../../../supabase/migrations/20261110220000_known_devices.sql', import.meta.url), 'utf8');

describe('known devices (real Postgres)', () => {
    let db: PGlite;
    let alice: string;
    let bob: string;
    const count = async (sql: string) => Number((await db.query<{ n: number }>(sql)).rows[0].n);
    const add = (user: string, hash: string) => db.query(`insert into public.known_devices (user_id, device_hash, user_agent) values ($1, $2, 'Chrome')`, [user, hash]);

    beforeAll(async () => {
        db = new PGlite();
        await db.exec(`create table public.app_users (id uuid primary key default gen_random_uuid(), email text not null, username text not null)`);
        await db.exec(`insert into public.app_users (email, username) values ('alice@example.com', 'alice'), ('bob@example.com', 'bob')`);
        alice = (await db.query<{ id: string }>(`select id from public.app_users where username = 'alice'`)).rows[0].id;
        bob = (await db.query<{ id: string }>(`select id from public.app_users where username = 'bob'`)).rows[0].id;
        await db.exec(MIGRATION_SQL);
    }, 60_000);

    afterAll(async () => { await db?.close(); });

    it('keeps a browser once per account, but lets two accounts share one browser', async () => {
        await add(alice, 'hash-1');
        await expect(add(alice, 'hash-1')).rejects.toThrow();   // already known to this account
        await add(bob, 'hash-1');                               // the same browser, signed in to another account
        await add(alice, 'hash-2');
        expect(await count(`select count(*)::int as n from public.known_devices where user_id = '${alice}'`)).toBe(2);
        expect(await count(`select count(*)::int as n from public.known_devices where device_hash = 'hash-1'`)).toBe(2);
    });

    it('does nothing when a browser is added twice with "on conflict do nothing", as the backend does', async () => {
        const result = await db.query(`insert into public.known_devices (user_id, device_hash) values ($1, 'hash-1') on conflict (user_id, device_hash) do nothing`, [alice]);
        expect(result.affectedRows).toBe(0);
        expect(await count(`select count(*)::int as n from public.known_devices where user_id = '${alice}'`)).toBe(2);
    });

    it('records when a browser was first and last seen, and finds the ones not seen for long', async () => {
        const row = (await db.query<{ same: boolean }>(`select first_seen_at = last_seen_at as same from public.known_devices where device_hash = 'hash-2'`)).rows[0];
        expect(row.same).toBe(true);
        await db.exec(`update public.known_devices set last_seen_at = now() - interval '401 days' where device_hash = 'hash-2'`);
        expect(await count(`select count(*)::int as n from public.known_devices where last_seen_at < now() - interval '400 days'`)).toBe(1);
        expect(await count(`select count(*)::int as n from pg_indexes where indexname = 'known_devices_seen_idx'`)).toBe(1);
    });

    it('removes a member\'s browsers with the member, and nobody else\'s', async () => {
        await db.query(`delete from public.app_users where id = $1`, [alice]);
        expect(await count(`select count(*)::int as n from public.known_devices where user_id = '${alice}'`)).toBe(0);
        expect(await count(`select count(*)::int as n from public.known_devices where user_id = '${bob}'`)).toBe(1);
    });

    it('refuses a browser for a member who does not exist', async () => {
        await expect(add('00000000-0000-0000-0000-000000000001', 'hash-ghost')).rejects.toThrow();
    });

    it('keeps row-level security on, so only the backend reaches the table', async () => {
        expect(await count(`select count(*)::int as n from pg_class where relname = 'known_devices' and relrowsecurity`)).toBe(1);
    });

    it('can be run again without error or change', async () => {
        const before = await count(`select count(*)::int as n from public.known_devices`);
        await db.exec(MIGRATION_SQL);
        await db.exec(MIGRATION_SQL);
        expect(await count(`select count(*)::int as n from public.known_devices`)).toBe(before);
    });
});
