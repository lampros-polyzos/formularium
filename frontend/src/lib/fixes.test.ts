import { describe, expect, it } from 'vitest';
import { applyImmediateFix, isFixApplicable, type FixRow } from './fixes';
import type { Fix } from '../types/fixes';

const row = (id: string, name: string, phase: 'A' | 'B' | 'C', percentage: number, isQS = false): FixRow =>
    ({ id, trade_name: name, phase, percentage, isQS });

const state = () => ({
    ingredients: [row('water', 'Distilled Water', 'A', 70, true), row('vitE', 'Vitamin E', 'B', 0.5), row('lav', 'Lavender Oil', 'B', 0.5), row('glycerin', 'Glycerin', 'A', 12)],
    targetPh: 4.5 as number | null,
});

describe('applyImmediateFix', () => {
    it('moves ingredients to a phase and names them', () => {
        const fix: Fix = { kind: 'move-phase', label: 'Move to Phase C', ingredientIds: ['vitE', 'lav'], phase: 'C' };
        const result = applyImmediateFix(fix, state())!;
        expect(result.state.ingredients.filter(i => i.phase === 'C').map(i => i.id)).toEqual(['vitE', 'lav']);
        expect(result.message).toBe('Moved Vitamin E and Lavender Oil to Phase C');
    });

    it('skips ingredients already in the phase and does nothing when all are', () => {
        const fix: Fix = { kind: 'move-phase', label: 'x', ingredientIds: ['water'], phase: 'A' };
        expect(applyImmediateFix(fix, state())).toBeNull();
    });

    it('sets a percentage, and can lock it so balancing keeps it', () => {
        const fix: Fix = { kind: 'set-percentage', label: 'Lower to 10%', ingredientIds: ['glycerin'], value: 10 };
        const result = applyImmediateFix(fix, state(), { lockEdited: true })!;
        const glycerin = result.state.ingredients.find(i => i.id === 'glycerin')!;
        expect(glycerin).toMatchObject({ percentage: 10, locked: true });
        expect(result.message).toBe('Glycerin set to 10%');
    });

    it('never sets the Q.S. ingredient, which is calculated', () => {
        const fix: Fix = { kind: 'set-percentage', label: 'x', ingredientIds: ['water'], value: 50 };
        expect(applyImmediateFix(fix, state())).toBeNull();
    });

    it('sets the target pH and ignores a pH that is already set', () => {
        const fix: Fix = { kind: 'set-ph', label: 'Set pH to 5.5', value: 5.5 };
        expect(applyImmediateFix(fix, state())!.state.targetPh).toBe(5.5);
        expect(applyImmediateFix(fix, { ...state(), targetPh: 5.5 })).toBeNull();
    });

    it('removes ingredients', () => {
        const fix: Fix = { kind: 'remove-ingredient', label: 'Remove', ingredientIds: ['lav'] };
        const result = applyImmediateFix(fix, state())!;
        expect(result.state.ingredients.map(i => i.id)).not.toContain('lav');
        expect(result.message).toBe('Removed Lavender Oil');
    });

    it('does not change the original state', () => {
        const original = state();
        applyImmediateFix({ kind: 'move-phase', label: 'x', ingredientIds: ['vitE'], phase: 'C' }, original);
        expect(original.ingredients[1].phase).toBe('B');
    });
});

describe('isFixApplicable', () => {
    it('shows balance only with ingredients, add only with a category, and hides fixes that are already done', () => {
        expect(isFixApplicable({ kind: 'balance', label: 'x' }, state())).toBe(true);
        expect(isFixApplicable({ kind: 'balance', label: 'x' }, { ingredients: [], targetPh: null })).toBe(false);
        expect(isFixApplicable({ kind: 'add-ingredient', label: 'x', category: 'preservative' }, state())).toBe(true);
        expect(isFixApplicable({ kind: 'add-ingredient', label: 'x' }, state())).toBe(false);
        expect(isFixApplicable({ kind: 'set-ph', label: 'x', value: 4.5 }, state())).toBe(false);
    });
});
