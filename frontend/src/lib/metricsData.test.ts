import { describe, expect, it, vi } from 'vitest';
import { countSharedRecipes, loadFavorites, loadFormulaSummaries, loadMetricBatches, loadMetricLines, loadMetricsInput } from './metricsData';


// Favourites, the stash and the ingredient rows come from the backend
const api = vi.hoisted(() => ({ fetchFavorites: vi.fn(), fetchStash: vi.fn(), fetchIngredientsByIds: vi.fn(), fetchFormulasWithLines: vi.fn() }));
const community = vi.hoisted(() => ({ fetchSharedCount: vi.fn() }));
vi.mock('./communityApi', () => community);
const batches = vi.hoisted(() => ({ listBatches: vi.fn(), listBatchLines: vi.fn() }));
vi.mock('./batches', () => batches);
vi.mock('./libraryApi', () => api);
vi.mock('./formulasApi', () => api);

describe('loadMetricBatches', () => {
    it('turns what the backend sends into plain numbers and lists, and keeps the check-ins', async () => {
        batches.listBatches.mockResolvedValue([{
            id: 'b1', formulation_id: null, name: 'Lotion', lot_number: 'L1', batch_size_g: '120.5', made_on: '2026-11-01', status: 'active',
            final_weight_g: '118', ingredient_cost: '4.25', unpriced_count: 1, container_name: 'Jar', container_volume_ml: '50', container_count: '2.5', container_unit_price: '0.4',
            batch_checks: [{ id: 'c1', label: '24 hours', due_on: '2026-11-02', checked_at: '2026-11-02T00:00:00Z', result: 'good', observations: null }],
        }, { id: 'b2', name: 'Bare', batch_size_g: 50, made_on: '2026-11-02', status: 'discarded', batch_checks: [] }]);
        const [a, b] = await loadMetricBatches();
        expect(a).toMatchObject({ batch_size_g: 120.5, final_weight_g: 118, ingredient_cost: 4.25, container_volume_ml: 50, container_count: 2.5, container_unit_price: 0.4, container_name: 'Jar' });
        expect(a.checks).toEqual([{ result: 'good', observations: [], checked_at: '2026-11-02T00:00:00Z' }]);
        expect(b).toMatchObject({ final_weight_g: null, ingredient_cost: null, container_name: null, unpriced_count: 0 });
    });

    it('says what could not be loaded', async () => {
        batches.listBatches.mockRejectedValue(new Error('boom'));
        await expect(loadMetricBatches()).rejects.toThrow('boom');
    });
});

describe('loadMetricLines', () => {
    it('converts the numbers of every line', async () => {
        batches.listBatchLines.mockResolvedValue([
            { batch_id: 'b', ingredient_id: 'i1', name: 'Item 1', actual_g: '1', cost: null },
            { batch_id: 'b', ingredient_id: null, name: 'Item 2', actual_g: 2, cost: '0.5' },
        ]);
        const lines = await loadMetricLines();
        expect(lines).toEqual([
            { batch_id: 'b', ingredient_id: 'i1', name: 'Item 1', actual_g: 1, cost: null },
            { batch_id: 'b', ingredient_id: null, name: 'Item 2', actual_g: 2, cost: 0.5 },
        ]);
    });

    it('gives nothing when there are no batches, and passes on a failure', async () => {
        batches.listBatchLines.mockResolvedValue([]);
        expect(await loadMetricLines()).toEqual([]);
        batches.listBatchLines.mockRejectedValue(new Error('Could not load what went into your batches.'));
        await expect(loadMetricLines()).rejects.toThrow('Could not load what went into your batches');
    });
});

describe('the rest', () => {
    it('reads favourites, naming them by trade name, then INCI, then a placeholder', async () => {
        api.fetchFavorites.mockResolvedValue([
            { id: 'a', trade_name: 'Shea Butter', inci_name: 'Butyrospermum' },
            { id: 'b', trade_name: '', inci_name: 'Glycerin' },
            { id: 'c', trade_name: '', inci_name: '' },
        ]);
        expect(await loadFavorites()).toEqual([{ id: 'a', name: 'Shea Butter' }, { id: 'b', name: 'Glycerin' }, { id: 'c', name: 'Unknown ingredient' }]);
    });

    it('says what could not be loaded', async () => {
        api.fetchFavorites.mockRejectedValue(new Error('down'));
        await expect(loadFavorites()).rejects.toThrow('Could not load your favourite ingredients: down');
    });

    it('counts the ingredients of each formula across its phases', async () => {
        api.fetchFormulasWithLines.mockResolvedValue([
            { id: 'f1', name: 'Lotion', created_at: 't', formulation_phases: [{ formulation_ingredients: [{ id: 1 }, { id: 2 }] }, { formulation_ingredients: [{ id: 3 }] }] },
            { id: 'f2', name: 'Empty', created_at: null, formulation_phases: [] },
        ]);
        expect((await loadFormulaSummaries()).map(f => [f.id, f.ingredientCount])).toEqual([['f1', 3], ['f2', 0]]);
    });

    it('counts the recipes you have shared', async () => {
        community.fetchSharedCount.mockResolvedValue(4);
        expect(await countSharedRecipes()).toBe(4);
        community.fetchSharedCount.mockRejectedValue(new Error('nope'));
        await expect(countSharedRecipes()).rejects.toThrow('Could not load your shared recipes');
    });
});

describe('loadMetricsInput', () => {
    it('brings it all together, naming what is in the stash', async () => {
        community.fetchSharedCount.mockResolvedValue(2);
        batches.listBatches.mockResolvedValue([{ id: 'b1', name: 'Lotion', batch_size_g: 100, made_on: '2026-11-01', status: 'active', batch_checks: [] }]);
        batches.listBatchLines.mockResolvedValue([{ batch_id: 'b1', ingredient_id: 'i1', name: 'Shea', actual_g: 10, cost: null }]);
        api.fetchFormulasWithLines.mockResolvedValue([]);
        api.fetchFavorites.mockResolvedValue([]);
        api.fetchStash.mockResolvedValue([{ id: 'l1', ingredient_id: 'i1', amount_left_g: 50 }]);
        api.fetchIngredientsByIds.mockResolvedValue([{ id: 'i1', trade_name: 'Shea Butter', inci_name: 'Butyrospermum' }]);
        const input = await loadMetricsInput();
        expect(input.batches).toHaveLength(1);
        expect(input.lines).toHaveLength(1);
        expect(input.sharedCount).toBe(2);
        expect(input.stashNames.get('i1')).toBe('Shea Butter');
        expect(input.stashMaxUsage?.has('i1')).toBe(true);
    });

    it('fails as a whole if any part fails', async () => {
        community.fetchSharedCount.mockResolvedValue(0);
        batches.listBatches.mockResolvedValue([]);
        batches.listBatchLines.mockResolvedValue([]);
        api.fetchFormulasWithLines.mockResolvedValue([]);
        api.fetchFavorites.mockRejectedValue(new Error('nope'));
        api.fetchStash.mockResolvedValue([]);
        await expect(loadMetricsInput()).rejects.toThrow('Could not load your favourite ingredients');
    });
});
