// @vitest-environment node
//
// Runs the email-confirmation migration on a real Postgres engine (PGlite): existing accounts are marked confirmed once, links are stored per account and
// removed with it, a link's hash is unique, only the two known purposes are accepted, and running the file again changes nothing.

import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const migrations = import.meta.glob('./fixtures/20261123000000_email_verification_and_reset.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const MIGRATION_SQL = Object.values(migrations)[0];

describe.skipIf(!MIGRATION_SQL)('email confirmation and password reset (real Postgres)', () => {
    let db: PGlite;
    const count = async (sql: string) => Number((await db.query<{ n: number }>(sql)).rows[0].n);

    beforeAll(async () => {
        db = new PGlite();
        await db.exec(`
          create table public.app_users (id uuid primary key default gen_random_uuid(), email text not null, username text not null, created_at timestamptz not null default now());
          insert into public.app_users (email, username) values ('old@example.com', 'old');
        `);
        await db.exec(MIGRATION_SQL);
    }, 60_000);

    afterAll(async () => { await db?.close(); });

    it('marks the accounts that already exist as confirmed', async () => {
        expect(await count(`select count(*)::int as n from public.app_users where email_verified_at is not null`)).toBe(1);
    });

    it('leaves a new account unconfirmed, and never confirms it when the file is run again', async () => {
        await db.exec(`insert into public.app_users (email, username) values ('new@example.com', 'new')`);
        await db.exec(MIGRATION_SQL);
        expect(await count(`select count(*)::int as n from public.app_users where email_verified_at is null`)).toBe(1);
    });

    it('keeps a link per account and removes it with the account', async () => {
        const id = (await db.query<{ id: string }>(`select id from public.app_users where username = 'new'`)).rows[0].id;
        await db.query(`insert into public.email_tokens (user_id, purpose, token_hash, expires_at) values ($1, 'verify', 'hash-1', now() + interval '1 day')`, [id]);
        expect(await count(`select count(*)::int as n from public.email_tokens`)).toBe(1);
        await db.query(`delete from public.app_users where id = $1`, [id]);
        expect(await count(`select count(*)::int as n from public.email_tokens`)).toBe(0);
    });

    it('refuses a repeated hash and an unknown purpose', async () => {
        const id = (await db.query<{ id: string }>(`select id from public.app_users limit 1`)).rows[0].id;
        await db.query(`insert into public.email_tokens (user_id, purpose, token_hash, expires_at) values ($1, 'reset', 'hash-2', now())`, [id]);
        await expect(db.query(`insert into public.email_tokens (user_id, purpose, token_hash, expires_at) values ($1, 'reset', 'hash-2', now())`, [id])).rejects.toThrow();
        await expect(db.query(`insert into public.email_tokens (user_id, purpose, token_hash, expires_at) values ($1, 'other', 'hash-3', now())`, [id])).rejects.toThrow();
    });

    it('keeps row-level security on so only the backend reaches the table', async () => {
        expect(await count(`select count(*)::int as n from pg_class where relname = 'email_tokens' and relrowsecurity`)).toBe(1);
    });
});
