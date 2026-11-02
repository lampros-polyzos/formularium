import { describe, expect, it } from 'vitest';
import { settleQS } from './qs';

const row = (percentage: number, isQS = false) => ({ percentage, isQS });

describe('settleQS', () => {
    it('makes the Q.S. ingredient fill the remainder', () => {
        const [water, glycerin, oil] = settleQS([row(50, true), row(5), row(20)]);
        expect(water.percentage).toBe(75);
        expect([glycerin.percentage, oil.percentage]).toEqual([5, 20]);
    });

    it('returns the very same list when it already adds up, so nothing re-renders', () => {
        const list = [row(75, true), row(5), row(20)];
        expect(settleQS(list)).toBe(list);
    });

    it('does nothing without a Q.S. ingredient', () => {
        const list = [row(50), row(20)];
        expect(settleQS(list)).toBe(list);
    });

    it('never goes below zero, and does not mutate its input', () => {
        const list = [row(10, true), row(70), row(60)];
        const settled = settleQS(list);
        expect(settled[0].percentage).toBe(0);
        expect(list[0].percentage).toBe(10);
    });

    it('rounds like the editor does', () => {
        expect(settleQS([row(0, true), row(33.333), row(33.333)])[0].percentage).toBe(33.33);
    });
});
