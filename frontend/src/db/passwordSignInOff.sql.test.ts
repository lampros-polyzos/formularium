// @vitest-environment node
//
// Runs the "password sign-in off" migration on a real Postgres engine (PGlite), with a stand-in app_users table: every account that exists keeps password sign-in ON
// (the column is empty), it can be switched off by setting a date and on again by clearing it, and running the file again changes nothing. The file is read from
// supabase/migrations itself, not from a copy.

import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const MIGRATION_SQL = readFileSync(new URL('../../../supabase/migrations/20261110200000_password_sign_in_off.sql', import.meta.url), 'utf8');

describe('password sign-in off (real Postgres)', () => {
    let db: PGlite;
    const count = async (sql: string) => Number((await db.query<{ n: number }>(sql)).rows[0].n);

    beforeAll(async () => {
        db = new PGlite();
        await db.exec(`
          create table public.app_users (id uuid primary key default gen_random_uuid(), email text not null, username text not null, password_hash text);
          insert into public.app_users (email, username, password_hash) values ('old@example.com', 'old', 'hash');
        `);
        await db.exec(MIGRATION_SQL);
    }, 60_000);

    afterAll(async () => { await db?.close(); });

    it('leaves every existing account with password sign-in on', async () => {
        expect(await count(`select count(*)::int as n from public.app_users where password_login_disabled_at is null`)).toBe(1);
    });

    it('starts a new account with it on', async () => {
        await db.exec(`insert into public.app_users (email, username) values ('new@example.com', 'new')`);
        expect(await count(`select count(*)::int as n from public.app_users where password_login_disabled_at is null`)).toBe(2);
    });

    it('switches it off with a date and on again by clearing it, for one account only', async () => {
        await db.exec(`update public.app_users set password_login_disabled_at = now() where username = 'old'`);
        expect(await count(`select count(*)::int as n from public.app_users where password_login_disabled_at is not null`)).toBe(1);
        expect(await count(`select count(*)::int as n from public.app_users where username = 'new' and password_login_disabled_at is null`)).toBe(1);

        await db.exec(`update public.app_users set password_login_disabled_at = null where username = 'old'`);
        expect(await count(`select count(*)::int as n from public.app_users where password_login_disabled_at is not null`)).toBe(0);
    });

    it('can be run again without error or change, and does not touch a switch that is already set', async () => {
        await db.exec(`update public.app_users set password_login_disabled_at = now() where username = 'old'`);
        await db.exec(MIGRATION_SQL);
        await db.exec(MIGRATION_SQL);
        expect(await count(`select count(*)::int as n from public.app_users where password_login_disabled_at is not null`)).toBe(1);
        expect(await count(`select count(*)::int as n from information_schema.columns where table_name = 'app_users' and column_name = 'password_login_disabled_at'`)).toBe(1);
    });
});
