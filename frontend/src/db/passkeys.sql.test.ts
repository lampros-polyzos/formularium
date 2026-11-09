// @vitest-environment node
//
// Runs the passkeys migration on a real Postgres engine (PGlite), with a stand-in app_users table: a passkey belongs to a member and goes with them, a
// credential id can be registered once (to anyone), a name has to be present and short, a challenge is either for registering (and then says who) or for
// signing in (and then says nobody), both tables are closed to the browser roles through row-level security, and running the file again changes nothing.
// The file is read from supabase/migrations itself, not from a copy.

import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const MIGRATION_SQL = readFileSync(new URL('../../../supabase/migrations/20261110180000_passkeys.sql', import.meta.url), 'utf8');

describe('passkeys (real Postgres)', () => {
    let db: PGlite;
    let alice: string;
    let bob: string;
    const count = async (sql: string) => Number((await db.query<{ n: number }>(sql)).rows[0].n);
    const addPasskey = (user: string, credential: string, name = 'My phone') =>
        db.query(`insert into public.passkeys (user_id, credential_id, public_key, name) values ($1, $2, 'cHVibGljLWtleQ', $3)`, [user, credential, name]);
    const addChallenge = (purpose: string, user: string | null) =>
        db.query(`insert into public.webauthn_challenges (purpose, user_id, request_json, expires_at) values ($1, $2, '{}', now() + interval '5 minutes')`, [purpose, user]);

    beforeAll(async () => {
        db = new PGlite();
        await db.exec(`create table public.app_users (id uuid primary key default gen_random_uuid(), email text not null, username text not null)`);
        await db.exec(`insert into public.app_users (email, username) values ('alice@example.com', 'alice'), ('bob@example.com', 'bob')`);
        alice = (await db.query<{ id: string }>(`select id from public.app_users where username = 'alice'`)).rows[0].id;
        bob = (await db.query<{ id: string }>(`select id from public.app_users where username = 'bob'`)).rows[0].id;
        await db.exec(MIGRATION_SQL);
    }, 60_000);

    afterAll(async () => { await db?.close(); });

    it('keeps several passkeys per member, starting with a counter of zero and a clean history', async () => {
        await addPasskey(alice, 'cred-a1', 'Phone');
        await addPasskey(alice, 'cred-a2', 'Laptop');
        const row = (await db.query<{ sign_count: string; last_used_at: string | null; backup_eligible: boolean; backup_state: boolean }>(`select sign_count, last_used_at, backup_eligible, backup_state from public.passkeys where credential_id = 'cred-a1'`)).rows[0];
        expect(Number(row.sign_count)).toBe(0);
        expect(row.last_used_at).toBeNull();
        expect(row.backup_eligible).toBe(false);
        expect(row.backup_state).toBe(false);
        expect(await count(`select count(*)::int as n from public.passkeys where user_id = '${alice}'`)).toBe(2);
    });

    it('registers a credential id only once, even for a different member', async () => {
        await expect(addPasskey(bob, 'cred-a1')).rejects.toThrow();
        expect(await count(`select count(*)::int as n from public.passkeys where user_id = '${bob}'`)).toBe(0);
    });

    it('needs a name, and not a long one', async () => {
        await expect(addPasskey(bob, 'cred-b1', '')).rejects.toThrow();
        await expect(addPasskey(bob, 'cred-b2', 'x'.repeat(61))).rejects.toThrow();
        await addPasskey(bob, 'cred-b3', 'x'.repeat(60));
    });

    it('knows two kinds of challenge, and only those', async () => {
        await addChallenge('register', alice);
        await addChallenge('login', null);   // a sign-in does not know who is asking
        await expect(addChallenge('anything-else', alice)).rejects.toThrow();
        expect(await count(`select count(*)::int as n from public.webauthn_challenges`)).toBe(2);
    });

    it('removes a member\'s passkeys and open challenges with the member, and nobody else\'s', async () => {
        await db.query(`delete from public.app_users where id = $1`, [alice]);
        expect(await count(`select count(*)::int as n from public.passkeys where user_id = '${alice}'`)).toBe(0);
        expect(await count(`select count(*)::int as n from public.webauthn_challenges where purpose = 'register'`)).toBe(0);
        expect(await count(`select count(*)::int as n from public.passkeys`)).toBe(1);                                   // bob's
        expect(await count(`select count(*)::int as n from public.webauthn_challenges where purpose = 'login'`)).toBe(1);   // the anonymous one
    });

    it('refuses a passkey for a member who does not exist', async () => {
        await expect(addPasskey('00000000-0000-0000-0000-000000000001', 'cred-ghost')).rejects.toThrow();
    });

    it('finds expired challenges by an index on the expiry', async () => {
        expect(await count(`select count(*)::int as n from pg_indexes where indexname = 'webauthn_challenges_expiry_idx'`)).toBe(1);
        expect(await count(`select count(*)::int as n from pg_indexes where indexname = 'passkeys_user_idx'`)).toBe(1);
    });

    it('keeps row-level security on both tables, so only the backend reaches them', async () => {
        expect(await count(`select count(*)::int as n from pg_class where relname in ('passkeys', 'webauthn_challenges') and relrowsecurity`)).toBe(2);
    });

    it('can be run again without error or change', async () => {
        const before = await count(`select count(*)::int as n from public.passkeys`);
        await db.exec(MIGRATION_SQL);
        await db.exec(MIGRATION_SQL);
        expect(await count(`select count(*)::int as n from public.passkeys`)).toBe(before);
        expect(await count(`select count(*)::int as n from pg_indexes where indexname in ('passkeys_user_idx', 'webauthn_challenges_expiry_idx')`)).toBe(2);
    });
});
