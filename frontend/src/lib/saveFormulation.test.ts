import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveFormulation, toFormulaBody, type SaveInput } from './saveFormulation';

// The backend saves a formula's details and contents together
const api = vi.hoisted(() => ({ createFormula: vi.fn(), saveFormula: vi.fn() }));
vi.mock('./formulasApi', () => api);

const input = (over: Partial<SaveInput> = {}): SaveInput => ({
    formulaId: null, name: 'Lotion', profileId: 'ow_lotion', targetWeight: 100, targetPh: 5.5,
    ingredients: [
        { id: 'water', phase: 'A', percentage: 70, isQS: true },
        { id: 'oil', phase: 'B', percentage: 20, isQS: false },
        { id: 'glycerin', phase: 'A', percentage: 5, isQS: false },
    ],
    ...over,
});

beforeEach(() => {
    api.createFormula.mockReset().mockResolvedValue({ id: 'new-formula-id' });
    api.saveFormula.mockReset().mockResolvedValue({ id: 'f1' });
});

describe('saveFormulation', () => {
    it('creates a formula that has none yet, in one request, and returns its id', async () => {
        const id = await saveFormulation(input());

        expect(id).toBe('new-formula-id');
        expect(api.saveFormula).not.toHaveBeenCalled();
        expect(api.createFormula).toHaveBeenCalledTimes(1);
        expect(api.createFormula.mock.calls[0][0]).toMatchObject({ name: 'Lotion', profile_id: 'ow_lotion', target_weight_g: 100, target_ph: 5.5 });
    });

    it('saves over an existing formula in one request, and keeps its id', async () => {
        const id = await saveFormulation(input({ formulaId: 'f1' }));

        expect(id).toBe('f1');
        expect(api.createFormula).not.toHaveBeenCalled();
        expect(api.saveFormula).toHaveBeenCalledTimes(1);
        expect(api.saveFormula.mock.calls[0][0]).toBe('f1');
    });

    it('sends the ingredients by phase and then largest first, with the rest-of-the-batch flag', async () => {
        await saveFormulation(input());
        expect(api.createFormula.mock.calls[0][0].ingredients).toEqual([
            { ingredient_id: 'water', phase_letter: 'A', percentage: 70, is_qs: true },
            { ingredient_id: 'glycerin', phase_letter: 'A', percentage: 5, is_qs: false },
            { ingredient_id: 'oil', phase_letter: 'B', percentage: 20, is_qs: false },
        ]);
    });

    it('treats a missing amount as zero', () => {
        const body = toFormulaBody({ name: 'x', profileId: 'p', targetWeight: 50, targetPh: null, ingredients: [{ id: 'a', phase: 'A', percentage: NaN, isQS: false }] });
        expect(body.ingredients[0].percentage).toBe(0);
        expect(body.target_ph).toBeNull();
    });

    it('passes on the backend\'s refusal, and writes nothing else', async () => {
        api.saveFormula.mockRejectedValue(new Error('An ingredient in this formula is not in your library.'));
        await expect(saveFormulation(input({ formulaId: 'f1' }))).rejects.toThrow('not in your library');
        expect(api.createFormula).not.toHaveBeenCalled();
    });
});
