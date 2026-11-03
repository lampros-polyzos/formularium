import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BatchDetail } from './batches';
import { buildBatchRecord, downloadBatchRecord } from './batchRecord';

const mocks = vi.hoisted(() => ({ downloadPdf: vi.fn() }));
vi.mock('./exportPdf', async (importOriginal) => ({ ...(await importOriginal<typeof import('./exportPdf')>()), downloadPdf: mocks.downloadPdf }));
vi.mock('./supabase', () => ({ supabase: {} }));

const detail = (over: Partial<BatchDetail['batch']> = {}): BatchDetail => ({
    batch: {
        id: 'b1', formulation_id: 'f1', name: 'Day Cream', lot_number: '261108-1', batch_size_g: 200, made_on: '2026-11-08', status: 'active',
        target_ph: 5.5, measured_ph: 5.6, final_weight_g: 196, notes: '  First test.  ', stash_deducted: true, created_at: '2026-11-08T10:00:00Z',
        container_id: 'c1', container_name: '50 ml bottle', container_volume_ml: 50, container_count: 3.4, container_unit_price: 0.8, density_g_ml: 0.97,
        ingredient_cost: 0.74, unpriced_count: 1, ...over,
    },
    lines: [
        { id: 'l1', batch_id: 'b1', ingredient_id: 'gly', name: 'Glycerin', inci_name: 'Glycerin', phase: 'A', percentage: 5, planned_g: 10, actual_g: 11, cost: 0.3, cost_estimated: true },
        { id: 'l2', batch_id: 'b1', ingredient_id: 'shea', name: 'Shea Butter', inci_name: null, phase: 'B', percentage: 25, planned_g: 50, actual_g: 50, cost: null, cost_estimated: false },
    ],
    usage: [
        { id: 'u1', batch_ingredient_id: 'l1', grams: 6, label: 'GLY-7' },
        { id: 'u2', batch_ingredient_id: 'l1', grams: 5, label: null },
        { id: 'u3', batch_ingredient_id: 'other', grams: 9, label: 'NOT-MINE' },
    ],
    checks: [
        { id: 'k1', batch_id: 'b1', label: '24 hours', due_on: '2026-11-09', checked_at: '2026-11-09T09:00:00Z', result: 'minor', observations: ['texture', 'something-new'], measured_ph: 5.7, notes: ' runnier ' },
        { id: 'k2', batch_id: 'b1', label: '1 week', due_on: '2026-11-15', checked_at: null, result: null, observations: [], measured_ph: null, notes: null },
    ],
});

describe('buildBatchRecord', () => {
    it('carries over the batch as it was stored', () => {
        const r = buildBatchRecord(detail(), '€');
        expect(r).toMatchObject({
            name: 'Day Cream', lotNumber: '261108-1', madeOn: '2026-11-08', status: 'active', batchSizeG: 200, finalWeightG: 196,
            targetPh: 5.5, measuredPh: 5.6, notes: 'First test.', stashDeducted: true, currency: '€',
        });
    });

    it('works out the yield from the final weight', () => {
        expect(buildBatchRecord(detail()).yieldPct).toBe(98);
        expect(buildBatchRecord(detail({ final_weight_g: null })).yieldPct).toBeNull();
        expect(buildBatchRecord(detail({ final_weight_g: 190.4 })).yieldPct).toBe(95.2);
    });

    it('describes the container only when there was one', () => {
        expect(buildBatchRecord(detail()).container).toEqual({ name: '50 ml bottle', volumeMl: 50, count: 3.4 });
        expect(buildBatchRecord(detail({ container_name: null })).container).toBeNull();
    });

    it('brings the cost: total, per 100 g, and per container including the container', () => {
        const { cost } = buildBatchRecord(detail());
        expect(cost.ingredientTotal).toBe(0.74);
        expect(cost.per100g).toBeCloseTo(0.37, 6);
        expect(cost.perContainer).toBeCloseTo(0.74 / 3.4 + 0.8, 6);
        expect(cost.containerPrice).toBe(0.8);
        expect(cost.estimated).toBe(true);
        expect(cost.unpricedCount).toBe(1);
    });

    it('has no cost figures for a batch that could not be priced', () => {
        const { cost } = buildBatchRecord(detail({ ingredient_cost: null, container_name: null, container_count: null }));
        expect(cost).toMatchObject({ ingredientTotal: null, per100g: null, perContainer: null });
    });

    it('lists each ingredient with its cost and only the stash lots it used', () => {
        const { lines } = buildBatchRecord(detail());
        expect(lines[0]).toEqual({
            name: 'Glycerin', inciName: 'Glycerin', phase: 'A', percentage: 5, plannedG: 10, actualG: 11, cost: 0.3, costEstimated: true,
            stashLots: [{ grams: 6, label: 'GLY-7' }, { grams: 5, label: 'stash' }],
        });
        expect(lines[1]).toMatchObject({ name: 'Shea Butter', inciName: null, cost: null, costEstimated: false, stashLots: [] });
    });

    it('writes the check-ins in plain words', () => {
        const { checks } = buildBatchRecord(detail());
        expect(checks[0]).toEqual({
            label: '24 hours', dueOn: '2026-11-09', checkedAt: '2026-11-09T09:00:00Z', result: 'minor',
            observations: ['Texture changed (thinner or thicker)', 'something-new'], measuredPh: 5.7, notes: 'runnier',
        });
        expect(checks[1]).toMatchObject({ checkedAt: null, result: null, observations: [], notes: null });
    });

    it('does not say the stash was used for a batch that was undone', () => {
        expect(buildBatchRecord(detail({ status: 'voided' })).stashDeducted).toBe(false);
    });

    it('copes with a batch recorded before costs and containers existed', () => {
        const old = detail();
        for (const key of ['container_id', 'container_name', 'container_volume_ml', 'container_count', 'container_unit_price', 'density_g_ml', 'ingredient_cost', 'unpriced_count'] as const) {
            delete (old.batch as unknown as Record<string, unknown>)[key];
        }
        old.lines.forEach(l => { delete l.cost; delete l.cost_estimated; });
        const r = buildBatchRecord(old);
        expect(r.container).toBeNull();
        expect(r.cost).toMatchObject({ ingredientTotal: null, per100g: null, perContainer: null, estimated: false, unpricedCount: 2 });
        expect(r.lines.every(l => l.cost === null)).toBe(true);
    });
});

describe('downloadBatchRecord', () => {
    beforeEach(() => { mocks.downloadPdf.mockReset().mockResolvedValue(undefined); });

    it('asks the server for the record and names the file after the product and lot', async () => {
        await downloadBatchRecord(detail(), '$');
        expect(mocks.downloadPdf).toHaveBeenCalledTimes(1);
        const [path, payload, filename] = mocks.downloadPdf.mock.calls[0];
        expect(path).toBe('/api/v1/export/batch-record');
        expect(payload).toMatchObject({ lotNumber: '261108-1', currency: '$' });
        expect(filename).toBe('Day_Cream_Batch_261108-1.pdf');
    });

    it('lets a failure reach the caller', async () => {
        mocks.downloadPdf.mockRejectedValue(new Error('Failed to generate PDF'));
        await expect(downloadBatchRecord(detail())).rejects.toThrow('Failed to generate PDF');
    });
});
