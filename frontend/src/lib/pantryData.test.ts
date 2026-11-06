import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadCommunityRecipes, loadIngredients, loadOwnRecipes, loadStash } from './pantryData';

// The stash and the ingredient rows come from the backend
const api = vi.hoisted(() => ({ fetchStash: vi.fn(), fetchIngredientsByIds: vi.fn(), fetchFormulasWithLines: vi.fn(), fetchCommunityRecipes: vi.fn() }));
vi.mock('./libraryApi', () => api);
vi.mock('./formulasApi', () => api);
vi.mock('./communityApi', () => api);
beforeEach(() => {
    api.fetchStash.mockReset();
    api.fetchIngredientsByIds.mockReset().mockResolvedValue([]);
});

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
        api.fetchFormulasWithLines.mockResolvedValue([
            { id: 'f1', name: 'Lotion', target_ph: 5.5, target_weight_g: '250', formulation_phases: [
                { phase_letter: 'A', formulation_ingredients: [{ percentage: '70.5', is_qs: true, ingredients: ing('aqua') }] },
                { phase_letter: 'B', formulation_ingredients: [{ percentage: 5, is_qs: false, ingredients: ing('oil') }, { percentage: 1, is_qs: false, ingredients: null }] },
            ] },
            { id: 'f2', name: 'Empty', target_ph: null, target_weight_g: null, formulation_phases: [] },
        ]);
        const recipes = await loadOwnRecipes();
        expect(recipes).toHaveLength(1);
        expect(recipes[0]).toMatchObject({ id: 'f1', source: 'own', name: 'Lotion', targetPh: 5.5, targetWeightG: 250 });
        expect(recipes[0].lines.map(l => [l.ingredient.id, l.phase, l.percentage, l.isQS])).toEqual([['aqua', 'A', 70.5, true], ['oil', 'B', 5, false]]);
    });
});

describe('loadCommunityRecipes', () => {
    // The backend sends other members' newest recipes, each as of its latest version
    const found = (recipes: object[], limited = false) => api.fetchCommunityRecipes.mockResolvedValue({ recipes, limited });
    const theirs = (formulation_data: unknown) => ({ id: 'p1', title: 'Theirs', author_name: 'Ana', formulation_data });

    it('reads recipes, including text-encoded ones, and leaves out lines with no amount', async () => {
        found([theirs(JSON.stringify([{ id: 'a', name: 'A', percentage: '60', phase: 'B' }, { id: 'zero', percentage: 0 }]))]);
        api.fetchIngredientsByIds.mockResolvedValue([ing('a')]);
        const { recipes } = await loadCommunityRecipes([]);
        expect(recipes.map(r => r.id)).toEqual(['p1']);
        expect(recipes[0]).toMatchObject({ source: 'community', name: 'Theirs', author: 'Ana' });
        expect(recipes[0].lines.map(l => [l.ingredient.id, l.phase, l.percentage])).toEqual([['a', 'B', 60]]);
    });

    it('does not fetch ingredients you already have, and falls back to the shared name when one cannot be found', async () => {
        found([theirs([{ id: 'mine', percentage: 10 }, { id: 'gone', name: 'Mystery oil', percentage: 5, phase: 'Z' }])]);
        const { recipes } = await loadCommunityRecipes([ing('mine') as never]);
        expect(api.fetchIngredientsByIds).toHaveBeenCalledTimes(1);
        expect(api.fetchIngredientsByIds).toHaveBeenCalledWith(['gone']);
        expect(recipes[0].lines[0].ingredient.id).toBe('mine');
        expect(recipes[0].lines[1]).toMatchObject({ phase: 'A', ingredient: { trade_name: 'Mystery oil' } });
    });

    it('asks for the newest recipes up to the limit, and says whether the backend stopped there', async () => {
        found([], true);
        expect((await loadCommunityRecipes([], 3)).limited).toBe(true);
        expect(api.fetchCommunityRecipes).toHaveBeenCalledWith(3);
        found([], false);
        expect((await loadCommunityRecipes([], 10)).limited).toBe(false);
    });

    it('survives a recipe whose text cannot be read', async () => {
        found([theirs('{not json')]);
        expect((await loadCommunityRecipes([])).recipes).toEqual([]);
    });

    it('says what could not be loaded', async () => {
        api.fetchCommunityRecipes.mockRejectedValue(new Error('down'));
        await expect(loadCommunityRecipes([])).rejects.toThrow('Could not load community recipes: down');
    });
});
