import { describe, expect, it } from 'vitest';
import {
    allocateFromStash, availability, buildPlan, checkState, describeDue, plannedGrams, summarizePlan, suggestLotNumber,
    type PlanRow, type StashLot,
} from './batchPlan';

const TODAY = new Date(2026, 10, 3); // 3 Nov 2026

const lot = (id: string, ingredient: string, grams: number | null, expires: string | null = null, label?: string): StashLot =>
    ({ id, ingredient_id: ingredient, amount_left_g: grams, expiration_date: expires, batch_lot_number: label ?? id });

const row = (ingredient: string | null, name: string, percentage: number): PlanRow =>
    ({ ingredient_id: ingredient, name, inci_name: name, phase: 'A', percentage });

describe('plannedGrams', () => {
    it('scales percentages to grams with two decimals', () => {
        expect(plannedGrams(3, 100)).toBe(3);
        expect(plannedGrams(0.35, 250)).toBe(0.88);
        expect(plannedGrams(66.2, 250)).toBe(165.5);
    });
});

describe('allocateFromStash', () => {
    it('takes from the lot that expires first, then the next', () => {
        const lots = [lot('late', 'g', 100, '2027-06-01'), lot('soon', 'g', 30, '2026-12-01'), lot('never', 'g', 100, null)];
        const result = allocateFromStash('g', 50, lots, TODAY);
        expect(result.allocations.map(a => [a.stash_id, a.grams])).toEqual([['soon', 30], ['late', 20]]);
        expect(result.shortG).toBe(0);
    });

    it('uses lots with no expiry last', () => {
        const result = allocateFromStash('g', 10, [lot('none', 'g', 50, null), lot('dated', 'g', 50, '2027-01-01')], TODAY);
        expect(result.allocations.map(a => a.stash_id)).toEqual(['dated']);
    });

    it('never uses expired stock, and reports what is missing', () => {
        const result = allocateFromStash('g', 40, [lot('old', 'g', 100, '2026-10-01'), lot('ok', 'g', 15, '2027-01-01')], TODAY);
        expect(result.allocations).toEqual([expect.objectContaining({ stash_id: 'ok', grams: 15 })]);
        expect(result.shortG).toBe(25);
    });

    it('treats an expiry of today as still good', () => {
        expect(allocateFromStash('g', 5, [lot('today', 'g', 10, '2026-11-03')], TODAY).allocatedG).toBe(5);
    });

    it('ignores other ingredients, empty lots, lots with no recorded amount, and unknown ingredients', () => {
        const lots = [lot('other', 'x', 100), lot('empty', 'g', 0), lot('untracked', 'g', null)];
        expect(allocateFromStash('g', 5, lots, TODAY)).toEqual({ allocations: [], allocatedG: 0, shortG: 5 });
        expect(allocateFromStash(null, 5, lots, TODAY).shortG).toBe(5);
    });

    it('never produces floating-point crumbs', () => {
        const result = allocateFromStash('g', 0.3, [lot('a', 'g', 0.1), lot('b', 'g', 0.1), lot('c', 'g', 0.5)], TODAY);
        expect(result.allocations.map(a => a.grams)).toEqual([0.1, 0.1, 0.1]);
        expect(result.shortG).toBe(0);
    });

    it('labels each lot so the batch record shows where it came from', () => {
        const [a] = allocateFromStash('g', 1, [{ ...lot('a', 'g', 10), batch_lot_number: 'LOT-9', supplier_name: 'Acme' }], TODAY).allocations;
        expect(a.label).toBe('LOT-9 · Acme');
    });
});

describe('availability', () => {
    it('separates fresh, expired and untracked stock', () => {
        const a = availability('g', [lot('1', 'g', 10, '2027-01-01'), lot('2', 'g', 5, '2026-01-01'), lot('3', 'g', null)], TODAY);
        expect(a).toEqual({ freshG: 10, expiredG: 5, hasUntracked: true });
    });
});

describe('buildPlan and summarizePlan', () => {
    const rows = [row('water', 'Water', 70), row('gly', 'Glycerin', 5), row('shea', 'Shea', 10), row(null, 'Mystery', 1)];
    const lots = [lot('w1', 'water', 500), lot('g1', 'gly', 3), lot('s1', 'shea', 100, '2026-01-01')];

    it('plans each line from the batch size', () => {
        const plan = buildPlan(rows, 200, lots, undefined, true, TODAY);
        expect(plan.map(l => l.amountG)).toEqual([140, 10, 20, 2]);
    });

    it('marks lines as covered, short, expired-only or not in the stash', () => {
        const plan = buildPlan(rows, 100, lots, undefined, true, TODAY);
        expect(plan.map(l => l.status)).toEqual(['ok', 'short', 'expired', 'none']);
        expect(plan[1].allocation).toMatchObject({ allocatedG: 3, shortG: 2 });
    });

    it('summarizes exactly what confirming would take', () => {
        const summary = summarizePlan(buildPlan(rows, 100, lots, undefined, true, TODAY));
        expect(summary).toMatchObject({ deductG: 73, lotsTouched: 2, linesTakingFromStash: 2, changesStash: true });
        expect(summary.shortLines.map(l => l.row.name)).toEqual(['Glycerin']);
    });

    it('takes nothing when stash use is switched off', () => {
        const summary = summarizePlan(buildPlan(rows, 100, lots, undefined, false, TODAY));
        expect(summary).toMatchObject({ deductG: 0, lotsTouched: 0, changesStash: false });
    });

    it('lets the user skip a line or change an amount', () => {
        const plan = buildPlan(rows, 100, lots, { amounts: { 0: 60 }, skipStash: new Set([1]) }, true, TODAY);
        expect(plan[0].allocation.allocatedG).toBe(60);
        expect(plan[1].takeFromStash).toBe(false);
        expect(summarizePlan(plan).deductG).toBe(60);
    });

    it('never allows a negative amount', () => {
        expect(buildPlan(rows, 100, lots, { amounts: { 0: -5 }, skipStash: new Set() }, true, TODAY)[0].amountG).toBe(0);
    });
});

describe('suggestLotNumber', () => {
    it('is the date plus the next free number for that day', () => {
        expect(suggestLotNumber([], TODAY)).toBe('261103-1');
        expect(suggestLotNumber(['261103-1', '261103-2', '261102-9', 'custom'], TODAY)).toBe('261103-3');
    });
});

describe('check-in timing', () => {
    it('knows what is done, overdue, due today and upcoming', () => {
        expect(checkState({ due_on: '2026-11-01', checked_at: '2026-11-02T10:00:00Z' }, TODAY)).toBe('done');
        expect(checkState({ due_on: '2026-11-02', checked_at: null }, TODAY)).toBe('overdue');
        expect(checkState({ due_on: '2026-11-03', checked_at: null }, TODAY)).toBe('due');
        expect(checkState({ due_on: '2026-11-10', checked_at: null }, TODAY)).toBe('upcoming');
    });

    it('describes how soon in plain words', () => {
        expect(describeDue('2026-11-03', TODAY)).toBe('due today');
        expect(describeDue('2026-11-04', TODAY)).toBe('due tomorrow');
        expect(describeDue('2026-11-10', TODAY)).toBe('due in 7 days');
        expect(describeDue('2026-11-02', TODAY)).toBe('1 day overdue');
        expect(describeDue('2026-10-30', TODAY)).toBe('4 days overdue');
    });
});
