import { describe, expect, it } from 'vitest';
import { determinePhase } from './phases';

describe('determinePhase', () => {
    it('puts heat-sensitive ingredients in the cool-down phase, even oil-soluble ones', () => {
        expect(determinePhase({ max_heating_temp_c: 40, solubility: 'oil' })).toBe('C');
        expect(determinePhase({ max_heating_temp_c: 50, solubility: 'water' })).toBe('C');
    });

    it('puts oil-soluble ingredients in the oil phase', () => {
        expect(determinePhase({ max_heating_temp_c: 85, solubility: 'oil' })).toBe('B');
        expect(determinePhase({ solubility: 'oil' })).toBe('B');
    });

    it('puts everything else in the water phase', () => {
        expect(determinePhase({ max_heating_temp_c: 90, solubility: 'water' })).toBe('A');
        expect(determinePhase({ max_heating_temp_c: null, solubility: 'dispersible' })).toBe('A');
        expect(determinePhase({})).toBe('A');
    });
});
