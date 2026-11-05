import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadCommunityRecipes, loadIngredients, loadOwnRecipes, loadStash } from './pantryData';

// Every test passes its own client; the real one is never used
vi.mock('./supabase', () => ({ supabase: {} }));

// The stash and the ingredient rows come from the backend
const api = vi.hoisted(() => ({ fetchStash: vi.fn(), fetchIngredientsByIds: vi.fn() }));
vi.mock('./libraryApi', () => api);
beforeEach(() => {
    api.fetchStash.mockReset();
    api.fetchIngredientsByIds.mockReset().mockResolvedValue([]);
});

type Rows = Record<string, unknown[] | { error: string }>;

/** A stand-in for the database: every query on a table answers with that table's rows, and is recorded. */
function fakeClient(tables: Rows) {
    const calls: { table: string; filters: [string, unknown][] }[] = [];
    const client = {
        from(table: string) {
            const call = { table, filters: [] as [string, unknown][] };
            calls.push(call);
            const b: Record<string, unknown> = {};
            for (const m of ['select', 'order', 'limit']) b[m] = () => b;
            for (const m of ['eq', 'in']) b[m] = (col: string, v: unknown) => { call.filters.push([`${m}:${col}`, v]); return b; };
            b.then = (resolve: (v: unknown) => void) => {
                const t = tables[table];
                resolve(t && !Array.isArray(t) ? { data: null, error: { message: t.error } } : { data: t ?? [], error: null });
            };
            return b;
        },
    };
    return { client: client as never, calls };
}

const ing = (id: string, extra: object = {}) => ({ id, inci_name: id.toUpperCase(), trade_name: id, function: 'Emollient', min_usage_pct: null, max_usage_pct: null, ...extra });

describe('loadStash', () => {
    it('gives the lots the batch planner reads, and nothing else about them', async () => {
        api.fetchStash.mockResolvedValue([{
            id: 'l1', user_id: 'u1', ingredient_id: 'a', supplier_name: 'S', batch_lot_number: 'B1', amount_left_g: 50, price_per_g: 0.1, expiration_date: '2027-01-01',
            notes: 'private', created_at: 't', ingredients: { id: 'a' },
        }]);
        expect(await loadStash()).toEqual([{ id: 'l1', ingredient_id: 'a', supplier_name: 'S', batch_lot_number: 'B1', amount_left_g: 50, price_per_g: 0.1, expiration_date: '2027-01-01' }]);
    });

    it('says what could not be loaded', async () => {
        api.fetchStash.mockRejectedValue(new Error('boom'));
        await expect(loadStash()).rejects.toThrow('Could not load your stash: boom');
    });
});

describe('loadIngredients', () => {
    it('asks for the ingredients by id', async () => {
        api.fetchIngredientsByIds.mockResolvedValue([ing('x')]);
        expect(await loadIngredients(['x', 'y'])).toEqual([ing('x')]);
        expect(api.fetchIngredientsByIds).toHaveBeenCalledWith(['x', 'y']);
    });

    it('says what could not be loaded', async () => {
        api.fetchIngredientsByIds.mockRejectedValue(new Error('down'));
        await expect(loadIngredients(['x'])).rejects.toThrow('Could not load ingredients: down');
    });
});

describe('loadOwnRecipes', () => {
    it('flattens phases into lines, converts numbers and skips empty formulas', async () => {
        const { client } = fakeClient({
            formulations: [
                { id: 'f1', name: 'Lotion', target_ph: 5.5, target_weight_g: '250', formulation_phases: [
                    { phase_letter: 'A', formulation_ingredients: [{ percentage: '70.5', is_qs: true, ingredients: ing('aqua') }] },
                    { phase_letter: 'B', formulation_ingredients: [{ percentage: 5, is_qs: false, ingredients: ing('oil') }, { percentage: 1, is_qs: false, ingredients: null }] },
                ] },
                { id: 'f2', name: 'Empty', target_ph: null, target_weight_g: null, formulation_phases: [] },
            ],
        });
        const recipes = await loadOwnRecipes('u1', client);
        expect(recipes).toHaveLength(1);
        expect(recipes[0]).toMatchObject({ id: 'f1', source: 'own', name: 'Lotion', targetPh: 5.5, targetWeightG: 250 });
        expect(recipes[0].lines.map(l => [l.ingredient.id, l.phase, l.percentage, l.isQS])).toEqual([['aqua', 'A', 70.5, true], ['oil', 'B', 5, false]]);
    });
});

describe('loadCommunityRecipes', () => {
    const posts = [
        { id: 'p1', title: 'Theirs', author_id: 'other', author_name: 'Ana' },
        { id: 'p2', title: 'Mine', author_id: 'u1', author_name: 'Me' },
        { id: 'p3', title: 'No versions', author_id: 'other', author_name: 'Bo' },
    ];

    it('uses the latest version, skips your own posts, and reads text-encoded recipes', async () => {
        const { client } = fakeClient({
            community_posts: posts,
            post_snapshots: [
                { post_id: 'p1', version: 1, formulation_data: [{ id: 'old', name: 'Old', percentage: 100, phase: 'A' }] },
                { post_id: 'p1', version: 2, formulation_data: JSON.stringify([{ id: 'a', name: 'A', percentage: '60', phase: 'B' }, { id: 'zero', percentage: 0 }]) },
                { post_id: 'p2', version: 1, formulation_data: [{ id: 'a', percentage: 100 }] },
            ],
        });
        api.fetchIngredientsByIds.mockResolvedValue([ing('a')]);
        const { recipes } = await loadCommunityRecipes('u1', [], client);
        expect(recipes.map(r => r.id)).toEqual(['p1']);
        expect(recipes[0]).toMatchObject({ source: 'community', name: 'Theirs', author: 'Ana' });
        expect(recipes[0].lines.map(l => [l.ingredient.id, l.phase, l.percentage])).toEqual([['a', 'B', 60]]);
    });

    it('does not fetch ingredients you already have, and falls back to the shared name when one cannot be found', async () => {
        const { client } = fakeClient({
            community_posts: [posts[0]],
            post_snapshots: [{ post_id: 'p1', version: 1, formulation_data: [{ id: 'mine', percentage: 10 }, { id: 'gone', name: 'Mystery oil', percentage: 5, phase: 'Z' }] }],
        });
        const { recipes } = await loadCommunityRecipes('u1', [ing('mine') as never], client);
        expect(api.fetchIngredientsByIds).toHaveBeenCalledTimes(1);
        expect(api.fetchIngredientsByIds).toHaveBeenCalledWith(['gone']);
        expect(recipes[0].lines[0].ingredient.id).toBe('mine');
        expect(recipes[0].lines[1]).toMatchObject({ phase: 'A', ingredient: { trade_name: 'Mystery oil' } });
    });

    it('says whether it stopped at the limit', async () => {
        const { client } = fakeClient({ community_posts: posts, post_snapshots: [] });
        expect((await loadCommunityRecipes('u1', [], client, 3)).limited).toBe(true);
        expect((await loadCommunityRecipes('u1', [], client, 10)).limited).toBe(false);
    });

    it('survives a recipe whose text cannot be read', async () => {
        const { client } = fakeClient({ community_posts: [posts[0]], post_snapshots: [{ post_id: 'p1', version: 1, formulation_data: '{not json' }] });
        expect((await loadCommunityRecipes('u1', [], client)).recipes).toEqual([]);
    });
});
