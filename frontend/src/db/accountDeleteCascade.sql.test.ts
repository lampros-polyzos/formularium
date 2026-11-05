// @vitest-environment node
//
// Runs the "account deletion cascades" migration on a real Postgres engine (PGlite): a person who owns a stash, containers, favourites and a
// custom ingredient can be deleted in one statement, and nothing that does not belong to them goes with them.

import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const migrations = import.meta.glob('./fixtures/20261117000000_account_delete_cascade.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const MIGRATION_SQL = Object.values(migrations)[0];

const ALICE = '00000000-0000-0000-0000-0000000000a1';
const BOB = '00000000-0000-0000-0000-0000000000b1';

describe.skipIf(!MIGRATION_SQL)('account deletion cascades (real Postgres)', () => {
    let db: PGlite;
    const count = async (table: string) => Number((await db.query<{ n: number }>(`select count(*)::int as n from public.${table}`)).rows[0].n);

    beforeAll(async () => {
        db = new PGlite();
        await db.exec(`
          create table public.app_users (id uuid primary key, email text);
          create table public.ingredients (id uuid primary key default gen_random_uuid(), inci_name text unique, user_id uuid references public.app_users (id));
          create table public.user_stash (id serial primary key, user_id uuid not null references public.app_users (id), ingredient_id uuid not null references public.ingredients (id));
          create table public.user_containers (id serial primary key, user_id uuid not null);
          alter table public.user_containers add constraint user_containers_user_id_fkey foreign key (user_id) references public.app_users (id) not valid;
          create table public.favorite_ingredients (id serial primary key, user_id uuid not null references public.app_users (id), ingredient_id uuid not null references public.ingredients (id));
          create table public.batches (id serial primary key, user_id uuid not null references public.app_users (id) on delete cascade);
          create table public.content_reports (id serial primary key, resolved_by uuid references public.app_users (id) on delete set null);
          insert into public.app_users values ('${ALICE}', 'a@example.com'), ('${BOB}', 'b@example.com');
          insert into public.ingredients (inci_name, user_id) values ('Shared Water', null), ('Alice Extract', '${ALICE}');
          insert into public.user_stash (user_id, ingredient_id) select '${ALICE}', id from public.ingredients;
          insert into public.user_stash (user_id, ingredient_id) select '${BOB}', id from public.ingredients where user_id is null;
          insert into public.user_containers (user_id) values ('${ALICE}'), ('${BOB}');
          insert into public.favorite_ingredients (user_id, ingredient_id) select '${ALICE}', id from public.ingredients;
          insert into public.batches (user_id) values ('${ALICE}');
          insert into public.content_reports (resolved_by) values ('${ALICE}');
        `);
    }, 60_000);

    afterAll(async () => { await db?.close(); });

    it('is refused today: the account cannot be deleted while it still owns a stash', async () => {
        await expect(db.exec(`delete from public.app_users where id = '${ALICE}'`)).rejects.toThrow(/foreign key/i);
    });

    it('lets the account be deleted afterwards, with everything it owns, and only that', async () => {
        await db.exec(MIGRATION_SQL);
        await db.exec(`delete from public.app_users where id = '${ALICE}'`);

        expect(await count('app_users')).toBe(1);
        expect(await count('user_stash')).toBe(1);            // Bob's lot of the shared ingredient stays
        expect(await count('user_containers')).toBe(1);       // so does Bob's container
        expect(await count('favorite_ingredients')).toBe(0);
        expect(await count('batches')).toBe(0);
        expect((await db.query<{ inci_name: string }>('select inci_name from public.ingredients')).rows.map(r => r.inci_name)).toEqual(['Shared Water']);   // her custom ingredient went, the shared one stayed
        expect((await db.query<{ resolved_by: string | null }>('select resolved_by from public.content_reports')).rows[0].resolved_by).toBeNull();   // set null stays set null
    });

    it('keeps a key that was not validated not validated, and changes nothing when run again', async () => {
        const state = async () => (await db.query<{ tbl: string; on_delete: string; validated: boolean }>(`
            select c.conrelid::regclass::text as tbl, c.confdeltype as on_delete, c.convalidated as validated
              from pg_constraint c where c.contype = 'f' and c.confrelid = 'public.app_users'::regclass order by 1`)).rows;
        const before = await state();
        expect(before.find(r => r.tbl === 'user_containers')).toMatchObject({ on_delete: 'c', validated: false });
        expect(before.find(r => r.tbl === 'user_stash')).toMatchObject({ on_delete: 'c', validated: true });
        expect(before.find(r => r.tbl === 'content_reports')).toMatchObject({ on_delete: 'n' });

        await db.exec(MIGRATION_SQL);
        expect(await state()).toEqual(before);
    });
});
