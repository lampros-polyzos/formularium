// @vitest-environment node
//
// Runs the post-type rename on a real Postgres engine (PGlite, in-process) for each way the column could be defined in
// your database, and checks that existing posts are renamed and nothing else changes.

import { PGlite } from '@electric-sql/pglite';
import { afterEach, describe, expect, it } from 'vitest';

// A glob (rather than an import) so the test skips, instead of breaking the whole run, if the fixture is missing
const migrations = import.meta.glob('./fixtures/20261113000000_community_post_types.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const MIGRATION_SQL = Object.values(migrations)[0];

const POSTS: [string, string][] = [['a', 'request'], ['b', 'education'], ['c', 'discussion'], ['d', 'formulation'], ['e', 'request']];

async function database(columnSql: string, extraSql = '') {
    const db = new PGlite();
    await db.exec(`${extraSql}
      create table public.community_posts (id text primary key, title text, post_type ${columnSql});
      ${POSTS.map(([id, type]) => `insert into public.community_posts values ('${id}', 'Post ${id}', '${type}');`).join('\n')}
    `);
    return db;
}
const types = async (db: PGlite) => Object.fromEntries((await db.query<{ id: string; post_type: string }>('select id, post_type::text from public.community_posts order by id')).rows.map(r => [r.id, r.post_type]));
const EXPECTED = { a: 'advice', b: 'information', c: 'discussion', d: 'formulation', e: 'advice' };

describe.skipIf(!MIGRATION_SQL)('renaming the community post types (real Postgres)', () => {
    let db: PGlite | undefined;
    afterEach(async () => { await db?.close(); db = undefined; });

    describe('when post_type is text with a CHECK rule', () => {
        const RULE = `text not null constraint community_posts_post_type_check check (post_type in ('formulation', 'discussion', 'request', 'education'))`;

        it('renames existing posts, and leaves the others alone', async () => {
            db = await database(RULE);
            await db.exec(MIGRATION_SQL);
            expect(await types(db)).toEqual(EXPECTED);
        });

        it('now accepts the new names and refuses the old ones and anything else', async () => {
            db = await database(RULE);
            await db.exec(MIGRATION_SQL);
            await db.exec(`insert into public.community_posts values ('n1', 'New', 'advice'), ('n2', 'New', 'information')`);
            await expect(db.exec(`insert into public.community_posts values ('o1', 'Old', 'request')`)).rejects.toThrow(/check constraint/);
            await expect(db.exec(`insert into public.community_posts values ('o2', 'Old', 'education')`)).rejects.toThrow(/check constraint/);
            await expect(db.exec(`insert into public.community_posts values ('o3', 'Odd', 'poll')`)).rejects.toThrow(/check constraint/);
        });

        it('copes with a rule the app named differently', async () => {
            db = await database(`text not null constraint my_odd_rule check (post_type = any (array['formulation', 'discussion', 'request', 'education']))`);
            await db.exec(MIGRATION_SQL);
            expect(await types(db)).toEqual(EXPECTED);
            const rules = (await db.query<{ conname: string }>(`select conname from pg_constraint where conrelid = 'public.community_posts'::regclass and contype = 'c'`)).rows.map(r => r.conname);
            expect(rules).toEqual(['community_posts_post_type_check']); // the old one is gone, not left to refuse the new names
        });

        it('leaves other rules on the table alone', async () => {
            db = await database(`text not null check (post_type in ('formulation', 'discussion', 'request', 'education'))`);
            await db.exec(`alter table public.community_posts add constraint title_not_empty check (length(title) > 0)`);
            await db.exec(MIGRATION_SQL);
            const rules = (await db.query<{ conname: string }>(`select conname from pg_constraint where conrelid = 'public.community_posts'::regclass and contype = 'c' order by 1`)).rows.map(r => r.conname);
            expect(rules).toEqual(['community_posts_post_type_check', 'title_not_empty']);
            await expect(db.exec(`insert into public.community_posts values ('x', '', 'advice')`)).rejects.toThrow(/title_not_empty/);
        });
    });

    describe('when post_type is text with no rule', () => {
        it('renames existing posts and does not start restricting values', async () => {
            db = await database('text not null');
            await db.exec(MIGRATION_SQL);
            expect(await types(db)).toEqual(EXPECTED);
            await db.exec(`insert into public.community_posts values ('z', 'Anything', 'poll')`); // as before: no rule was added
        });
    });

    describe('when post_type is an enum', () => {
        const ENUM = `create type public.post_kind as enum ('formulation', 'discussion', 'request', 'education');`;

        it('renames the two values in place, so existing posts follow', async () => {
            db = await database('public.post_kind not null', ENUM);
            await db.exec(MIGRATION_SQL);
            expect(await types(db)).toEqual(EXPECTED);
            const labels = (await db.query<{ enumlabel: string }>(`select enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'post_kind' order by e.enumsortorder`)).rows.map(r => r.enumlabel);
            expect(labels).toEqual(['formulation', 'discussion', 'advice', 'information']);
        });

        it('then accepts the new names and refuses the old ones', async () => {
            db = await database('public.post_kind not null', ENUM);
            await db.exec(MIGRATION_SQL);
            await db.exec(`insert into public.community_posts values ('n1', 'New', 'advice'), ('n2', 'New', 'information')`);
            await expect(db.exec(`insert into public.community_posts values ('o1', 'Old', 'request')`)).rejects.toThrow(/invalid input value for enum/);
        });
    });

    it.each([
        ['a text column with a rule', `text not null constraint community_posts_post_type_check check (post_type in ('formulation', 'discussion', 'request', 'education'))`, ''],
        ['a text column with no rule', 'text not null', ''],
        ['an enum', 'public.post_kind not null', `create type public.post_kind as enum ('formulation', 'discussion', 'request', 'education');`],
    ])('can be run twice on %s, changing nothing the second time', async (_name, column, extra) => {
        db = await database(column, extra);
        await db.exec(MIGRATION_SQL);
        const once = await types(db);
        await db.exec(MIGRATION_SQL);
        expect(await types(db)).toEqual(once);
        expect(once).toEqual(EXPECTED);
    });

    it('does not touch other columns of the posts', async () => {
        db = await database(`text not null check (post_type in ('formulation', 'discussion', 'request', 'education'))`);
        await db.exec(MIGRATION_SQL);
        const titles = (await db.query<{ title: string }>('select title from public.community_posts order by id')).rows.map(r => r.title);
        expect(titles).toEqual(POSTS.map(([id]) => `Post ${id}`));
    });

    it('stops with a clear message if the column does not exist', async () => {
        db = new PGlite();
        await db.exec(`create table public.community_posts (id text primary key)`);
        await expect(db.exec(MIGRATION_SQL)).rejects.toThrow(/post_type was not found/);
    });
});
