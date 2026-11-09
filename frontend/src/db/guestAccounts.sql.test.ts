// @vitest-environment node
//
// Runs the guest-accounts migration on a real Postgres engine (PGlite), with a stand-in app_users table: accounts that already exist stay real accounts
// (no expiry), the column is empty by default, the expiry index only covers guests, deleting expired guests takes only them (and what they own, through the
// cascade), and running the file again changes nothing. The file is read from supabase/migrations itself, not from a copy.

import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const MIGRATION_SQL = readFileSync(new URL('../../../supabase/migrations/20261110120000_guest_accounts.sql', import.meta.url), 'utf8');

describe('guest accounts (real Postgres)', () => {
    let db: PGlite;
    const count = async (sql: string) => Number((await db.query<{ n: number }>(sql)).rows[0].n);

    beforeAll(async () => {
        db = new PGlite();
        await db.exec(`
          create table public.app_users (id uuid primary key default gen_random_uuid(), email text not null, username text not null, created_at timestamptz not null default now());
          create table public.formulations (id uuid primary key default gen_random_uuid(), user_id uuid not null references public.app_users (id) on delete cascade);
          insert into public.app_users (email, username) values ('old@example.com', 'old');
        `);
        await db.exec(MIGRATION_SQL);
    }, 60_000);

    afterAll(async () => { await db?.close(); });

    it('leaves the accounts that already exist as real accounts', async () => {
        expect(await count(`select count(*)::int as n from public.app_users where guest_expires_at is null`)).toBe(1);
        expect(await count(`select count(*)::int as n from public.app_users where guest_expires_at is not null`)).toBe(0);
    });

    it('makes a new account a real one unless it is given an expiry', async () => {
        await db.exec(`insert into public.app_users (email, username) values ('new@example.com', 'new')`);
        expect(await count(`select count(*)::int as n from public.app_users where guest_expires_at is null`)).toBe(2);
    });

    it('deleting the expired guests takes only them, with what they own', async () => {
        await db.exec(`
          insert into public.app_users (email, username, guest_expires_at) values
            ('g1@guest.invalid', 'guest-1', now() - interval '1 minute'),
            ('g2@guest.invalid', 'guest-2', now() + interval '1 day');
          insert into public.formulations (user_id) select id from public.app_users;
        `);
        await db.exec(`delete from public.app_users where guest_expires_at is not null and guest_expires_at <= now()`);

        expect(await count(`select count(*)::int as n from public.app_users`)).toBe(3);   // the two real accounts and the guest whose day is not over
        expect(await count(`select count(*)::int as n from public.app_users where username = 'guest-1'`)).toBe(0);
        expect(await count(`select count(*)::int as n from public.formulations`)).toBe(3);   // the expired guest's formula went with it
    });

    it('indexes the expiry for guests only', async () => {
        const index = (await db.query<{ indexdef: string }>(`select indexdef from pg_indexes where indexname = 'app_users_guest_expiry_idx'`)).rows;
        expect(index).toHaveLength(1);
        expect(index[0].indexdef).toMatch(/where \(?guest_expires_at is not null\)?/i);
    });

    it('can be run again without error or change', async () => {
        const before = await count(`select count(*)::int as n from public.app_users`);
        await db.exec(MIGRATION_SQL);
        await db.exec(MIGRATION_SQL);
        expect(await count(`select count(*)::int as n from public.app_users`)).toBe(before);
        expect(await count(`select count(*)::int as n from pg_indexes where indexname = 'app_users_guest_expiry_idx'`)).toBe(1);
        expect(await count(`select count(*)::int as n from information_schema.columns where table_name = 'app_users' and column_name = 'guest_expires_at'`)).toBe(1);
    });
});
