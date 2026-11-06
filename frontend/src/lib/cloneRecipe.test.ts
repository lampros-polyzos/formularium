import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cloneRecipeToStudio } from './cloneRecipe';

const api = vi.hoisted(() => ({ createFormula: vi.fn() }));
vi.mock('./formulasApi', () => api);

const LINES = [
    { ingredient_id: 'aqua', percentage: 80, phase: 'A' },
    { ingredient_id: 'oil', percentage: '15', phase: 'B' },
    { ingredient_id: 'pres', percentage: 1, phase: 'B' },
];

beforeEach(() => { api.createFormula.mockReset().mockResolvedValue({ id: 'new1' }); });

describe('cloneRecipeToStudio', () => {
    it('makes a draft that remembers the recipe, with every line in its phase', async () => {
        const id = await cloneRecipeToStudio({ id: 'p1', title: 'Lotion' }, LINES);
        expect(id).toBe('new1');
        expect(api.createFormula).toHaveBeenCalledTimes(1);
        const [body] = api.createFormula.mock.calls[0];
        expect(body).toMatchObject({ name: 'Lotion (Clone)', target_weight_g: 100, remixed_from_post_id: 'p1' });
        expect(body.ingredients).toEqual([
            { ingredient_id: 'aqua', phase_letter: 'A', percentage: 80, is_qs: false },
            { ingredient_id: 'oil', phase_letter: 'B', percentage: 15, is_qs: false },   // a text amount becomes a number
            { ingredient_id: 'pres', phase_letter: 'B', percentage: 1, is_qs: false },
        ]);
    });

    it('asks the backend to leave out other members\' private ingredients instead of failing', async () => {
        await cloneRecipeToStudio({ id: 'p1', title: 'Lotion' }, LINES);
        expect(api.createFormula.mock.calls[0][1]).toEqual({ copy: true });
    });

    it('uses the name it is given', async () => {
        await cloneRecipeToStudio({ id: 'p1', title: 'Lotion' }, LINES, 'Lotion (Clone with swaps)');
        expect(api.createFormula.mock.calls[0][0].name).toBe('Lotion (Clone with swaps)');
    });

    it('reports a failure', async () => {
        api.createFormula.mockRejectedValue(new Error('formula failed'));
        await expect(cloneRecipeToStudio({ id: 'p1', title: 'x' }, LINES)).rejects.toMatchObject({ message: 'formula failed' });
    });
});
