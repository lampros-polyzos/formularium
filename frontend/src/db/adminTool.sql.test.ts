// @vitest-environment node
//
// Runs the admin-tool migration on a real Postgres engine (PGlite), with a stand-in app_users table: an administrator is one row per member that goes with the
// member, the audit log keeps the addresses of both people after either account is deleted, only the known actions can be recorded, the tables are closed to the
// browser roles through row-level security, and running the file again changes nothing. The file is read from supabase/migrations itself, not from a copy.

import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const MIGRATION_SQL = readFileSync(new URL('../../../supabase/migrations/20261110240000_admin_tool.sql', import.meta.url), 'utf8');

describe('the admin tool (real Postgres)', () => {
    let db: PGlite;
    let admin: string;
    let member: string;
    const count = async (sql: string) => Number((await db.query<{ n: number }>(sql)).rows[0].n);
    const record = (action: string) => db.query(
        `insert into public.admin_actions (admin_id, admin_email, target_user_id, target_email, action, reason) values ($1, 'admin@example.com', $2, 'member@example.com', $3, 'asked by email')`,
        [admin, member, action]);

    beforeAll(async () => {
        db = new PGlite();
        await db.exec(`create table public.app_users (id uuid primary key default gen_random_uuid(), email text not null, username text not null)`);
        await db.exec(`insert into public.app_users (email, username) values ('admin@example.com', 'admin'), ('member@example.com', 'member')`);
        admin = (await db.query<{ id: string }>(`select id from public.app_users where username = 'admin'`)).rows[0].id;
        member = (await db.query<{ id: string }>(`select id from public.app_users where username = 'member'`)).rows[0].id;
        await db.exec(MIGRATION_SQL);
    }, 60_000);

    afterAll(async () => { await db?.close(); });

    it('has nobody as an administrator until a row is added by hand, and only once per member', async () => {
        expect(await count(`select count(*)::int as n from public.app_admins`)).toBe(0);
        await db.query(`insert into public.app_admins (user_id) select id from public.app_users where email = 'admin@example.com'`);
        await expect(db.query(`insert into public.app_admins (user_id) values ($1)`, [admin])).rejects.toThrow();
        expect(await count(`select count(*)::int as n from public.app_admins`)).toBe(1);
    });

    it('records each known action, and refuses one it does not know', async () => {
        for (const action of ['view_member', 'grant_moderator', 'revoke_moderator', 'reset_two_step', 'remove_passkeys', 'restore_password_sign_in', 'sign_out_everywhere']) await record(action);
        await expect(record('delete_account')).rejects.toThrow();
        expect(await count(`select count(*)::int as n from public.admin_actions`)).toBe(7);
    });

    it('requires a reason and the addresses, and dates the record itself', async () => {
        await expect(db.query(`insert into public.admin_actions (admin_id, admin_email, target_email, action) values ($1, 'a@b.c', 'd@e.f', 'sign_out_everywhere')`, [admin])).rejects.toThrow();
        const row = (await db.query<{ ok: boolean }>(`select created_at > now() - interval '1 minute' as ok from public.admin_actions limit 1`)).rows[0];
        expect(row.ok).toBe(true);
    });

    it('keeps the record, with both addresses, after the member is deleted', async () => {
        await db.query(`delete from public.app_users where id = $1`, [member]);
        expect(await count(`select count(*)::int as n from public.admin_actions where target_user_id is null and target_email = 'member@example.com'`)).toBe(7);
        expect(await count(`select count(*)::int as n from public.admin_actions where admin_id = '${admin}'`)).toBe(7);
    });

    it('keeps the record after the administrator is deleted too, and removes the admin row', async () => {
        await db.query(`delete from public.app_users where id = $1`, [admin]);
        expect(await count(`select count(*)::int as n from public.app_admins`)).toBe(0);
        expect(await count(`select count(*)::int as n from public.admin_actions where admin_id is null and admin_email = 'admin@example.com'`)).toBe(7);
    });

    it('has the indexes the lookups and the purge use', async () => {
        for (const name of ['admin_actions_target_idx', 'admin_actions_admin_idx', 'admin_actions_created_idx']) {
            expect(await count(`select count(*)::int as n from pg_indexes where indexname = '${name}'`)).toBe(1);
        }
    });

    it('closes both tables to the browser roles through row-level security', async () => {
        const rows = (await db.query<{ relname: string; relrowsecurity: boolean }>(`select relname, relrowsecurity from pg_class where relname in ('app_admins', 'admin_actions')`)).rows;
        expect(rows).toHaveLength(2);
        expect(rows.every(r => r.relrowsecurity)).toBe(true);
    });

    it('can be run again without changing anything', async () => {
        await db.exec(MIGRATION_SQL);
        await db.exec(MIGRATION_SQL);
        expect(await count(`select count(*)::int as n from public.admin_actions`)).toBe(7);
    });
});
