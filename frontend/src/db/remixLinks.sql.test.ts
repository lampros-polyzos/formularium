// @vitest-environment node
//
// Runs the "remixed from" migration on a real Postgres engine (PGlite, in-process) and checks what matters:
// copies keep working when the original is deleted, a recipe cannot be its own original, and applying the
// migration twice is harmless.

import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// A glob (rather than an import) so the test skips, instead of breaking the whole run, if the file was removed
const migrations = import.meta.glob('./fixtures/20261107000000_remix_links.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const MIGRATION_SQL = Object.values(migrations)[0];

const ID = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

describe.skipIf(!MIGRATION_SQL)('remix links migration (real Postgres)', () => {
    let db: PGlite;
    const one = async <T,>(sql: string) => (await db.query<T>(sql)).rows[0];

    beforeAll(async () => {
        db = new PGlite();
        await db.exec(`
          create table public.community_posts (id uuid primary key default gen_random_uuid(), title text);
          create table public.formulations (id uuid primary key default gen_random_uuid(), name text, community_post_id uuid);
        `);
        await db.exec(MIGRATION_SQL);
    });
    afterAll(async () => { await db.close(); });

    async function seed() {
        await db.exec(`
          truncate public.formulations, public.community_posts cascade;
          insert into public.community_posts (id, title) values ('${ID(1)}', 'Original');
          insert into public.community_posts (id, title, remixed_from_post_id) values ('${ID(2)}', 'Remix A', '${ID(1)}'), ('${ID(3)}', 'Remix B', '${ID(1)}');
          insert into public.formulations (id, name) values ('${ID(10)}', 'My base');
          insert into public.formulations (id, name, cloned_from_formulation_id, remixed_from_post_id) values ('${ID(11)}', 'My copy', '${ID(10)}', '${ID(1)}');
        `);
    }

    it('can be applied twice without error', async () => {
        await expect(db.exec(MIGRATION_SQL)).resolves.not.toThrow();
    });

    it('lists the remixes of a recipe', async () => {
        await seed();
        const { rows } = await db.query<{ title: string }>(`select title from public.community_posts where remixed_from_post_id = '${ID(1)}' order by title`);
        expect(rows.map(r => r.title)).toEqual(['Remix A', 'Remix B']);
    });

    it('keeps every copy, and only clears the link, when the original post is deleted', async () => {
        await seed();
        await db.exec(`delete from public.community_posts where id = '${ID(1)}'`);

        const posts = (await db.query<{ title: string; remixed_from_post_id: string | null }>('select title, remixed_from_post_id from public.community_posts order by title')).rows;
        expect(posts).toEqual([{ title: 'Remix A', remixed_from_post_id: null }, { title: 'Remix B', remixed_from_post_id: null }]);
        const copy = await one<{ remixed_from_post_id: string | null; cloned_from_formulation_id: string | null }>(`select remixed_from_post_id, cloned_from_formulation_id from public.formulations where id = '${ID(11)}'`);
        expect(copy).toEqual({ remixed_from_post_id: null, cloned_from_formulation_id: ID(10) }); // the other link is untouched
    });

    it('keeps the copy, and only clears the link, when the original formula is deleted', async () => {
        await seed();
        await db.exec(`delete from public.formulations where id = '${ID(10)}'`);
        const copy = await one<{ name: string; cloned_from_formulation_id: string | null; remixed_from_post_id: string | null }>(`select name, cloned_from_formulation_id, remixed_from_post_id from public.formulations where id = '${ID(11)}'`);
        expect(copy).toEqual({ name: 'My copy', cloned_from_formulation_id: null, remixed_from_post_id: ID(1) });
    });

    it('does not let a user delete their account, or an original, get blocked by remixes of it', async () => {
        await seed();
        // Deleting a remix does not touch the original or its other remixes
        await db.exec(`delete from public.community_posts where id = '${ID(2)}'`);
        expect(Number((await one<{ n: number }>('select count(*)::int as n from public.community_posts')).n)).toBe(2);
        // Deleting the original and a remix in one statement (as deleting an account's posts does)
        await db.exec(`delete from public.community_posts where id in ('${ID(1)}', '${ID(3)}')`);
        expect(Number((await one<{ n: number }>('select count(*)::int as n from public.community_posts')).n)).toBe(0);
    });

    it('refuses a recipe that is its own original, and a link to something that does not exist', async () => {
        await seed();
        await expect(db.exec(`update public.community_posts set remixed_from_post_id = id where id = '${ID(1)}'`)).rejects.toThrow(/no_self_remix/);
        await expect(db.exec(`update public.formulations set cloned_from_formulation_id = id where id = '${ID(10)}'`)).rejects.toThrow(/no_self_clone/);
        await expect(db.exec(`update public.community_posts set remixed_from_post_id = '${ID(99)}' where id = '${ID(1)}'`)).rejects.toThrow(/foreign key/i);
    });

    it('leaves existing rows without a link', async () => {
        await db.exec(`truncate public.formulations, public.community_posts cascade; insert into public.community_posts (title) values ('Old post'); insert into public.formulations (name) values ('Old formula');`);
        expect((await one<{ remixed_from_post_id: string | null }>('select remixed_from_post_id from public.community_posts')).remixed_from_post_id).toBeNull();
        expect((await one<{ cloned_from_formulation_id: string | null }>('select cloned_from_formulation_id from public.formulations')).cloned_from_formulation_id).toBeNull();
    });
});
