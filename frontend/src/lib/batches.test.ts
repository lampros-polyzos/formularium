import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    addCheck, completeCheck, countDueChecks, createBatch, deleteBatch, friendlyError, getBatch, isoDate, listBatchLines, listBatches, listDueChecks, lotNumbersLike, updateBatch, voidBatch,
} from './batches';
import { ApiError } from './apiClient';

const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('./apiClient', async (importOriginal) => ({ ...(await importOriginal<typeof import('./apiClient')>()), request: mocks.request }));

const calls = () => mocks.request.mock.calls.map(([path, init]) => ({ path: path as string, method: (init?.method ?? 'GET') as string, body: init?.body as Record<string, unknown> | undefined }));

beforeEach(() => { mocks.request.mockReset().mockResolvedValue(undefined); });

describe('createBatch', () => {
    const input = {
        formulationId: 'f1', name: 'Day Cream', lotNumber: ' 261103-1 ', batchSizeG: 100, targetPh: 5.5, notes: 'first try',
        lines: [{
            ingredient_id: 'gly', name: 'Glycerin', inci_name: 'Glycerin', phase: 'A', percentage: 3, planned_g: 3, actual_g: 3,
            allocations: [{ stash_id: 's1', grams: 3, label: 'LOT-1' }],
        }],
    };

    it('sends the batch and the exact stash allocations in one request, and returns the new id', async () => {
        mocks.request.mockResolvedValue({ id: 'batch-1' });
        expect(await createBatch(input)).toBe('batch-1');
        expect(calls()).toHaveLength(1);
        expect(calls()[0]).toMatchObject({ path: '/api/v1/batches', method: 'POST' });
        expect(calls()[0].body).toMatchObject({
            formulation_id: 'f1', name: 'Day Cream', lot_number: '261103-1', batch_size_g: 100, target_ph: 5.5, notes: 'first try', lines: input.lines, made_on: isoDate(), container: null,
        });
    });

    it('sends the container, and the price to use for grams that are not taken from the stash', async () => {
        mocks.request.mockResolvedValue({ id: 'b' });
        const container = { id: 'c1', name: '50 ml bottle', volume_ml: 50, count: 3.4, unit_price: 0.8, density_g_ml: 0.97 };
        await createBatch({ ...input, container, lines: [{ ...input.lines[0], est_price_per_g: 0.03 }] });
        const body = calls()[0].body as { container: unknown; lines: { est_price_per_g: number }[] };
        expect(body.container).toEqual(container);
        expect(body.lines[0].est_price_per_g).toBe(0.03);
    });

    it('never retries a failure: a retry could take from the stash twice', async () => {
        mocks.request.mockRejectedValue(new ApiError(409, 'stash_changed', 'Not enough Glycerin left in your stash.'));
        await expect(createBatch(input)).rejects.toThrow('Not enough Glycerin left in your stash.');
        expect(mocks.request).toHaveBeenCalledTimes(1);
    });

    it('explains a lot number that is taken, and a server that cannot be reached', async () => {
        mocks.request.mockRejectedValue(new ApiError(409, 'lot_number_taken', 'That lot number is already used by another batch. Pick a different one.'));
        await expect(createBatch(input)).rejects.toThrow('That lot number is already used');
        mocks.request.mockRejectedValue(new TypeError('Failed to fetch'));
        await expect(createBatch(input)).rejects.toThrow("Couldn't reach the server");
    });
});

describe('undoing and deleting', () => {
    it('asks the backend to undo the batch, and says why it failed', async () => {
        await voidBatch('b1');
        expect(calls()[0]).toMatchObject({ path: '/api/v1/batches/b1/void', method: 'POST' });
        mocks.request.mockRejectedValue(new ApiError(404, 'not_found', 'Batch not found, or it was already undone.'));
        await expect(voidBatch('b1')).rejects.toThrow('already undone');
    });

    it('deletes just that batch', async () => {
        await deleteBatch('b1');
        expect(calls()).toEqual([{ path: '/api/v1/batches/b1', method: 'DELETE', body: undefined }]);
    });

    it('puts the stash back first when asked, and only then deletes', async () => {
        await deleteBatch('b1', { restoreStash: true });
        expect(calls().map(c => `${c.method} ${c.path}`)).toEqual(['POST /api/v1/batches/b1/void', 'DELETE /api/v1/batches/b1']);
    });

    it('does not delete anything if the stash could not be put back', async () => {
        mocks.request.mockRejectedValueOnce(new ApiError(404, 'not_found', 'Batch not found, or it was already undone.'));
        await expect(deleteBatch('b1', { restoreStash: true })).rejects.toThrow('already undone');
        expect(calls().map(c => c.method)).toEqual(['POST']);
    });

    it('says so when there was nothing to delete (not yours, or already gone)', async () => {
        mocks.request.mockRejectedValue(new ApiError(404, 'not_found', 'Batch not found, or it was already deleted.'));
        await expect(deleteBatch('b1')).rejects.toThrow('already deleted');
    });
});

describe('reading', () => {
    it('lists your batches and loads one with its lines, stash usage and check-ins', async () => {
        mocks.request.mockResolvedValue([{ id: 'b1', batch_checks: [] }]);
        expect(await listBatches()).toEqual([{ id: 'b1', batch_checks: [] }]);
        expect(calls()[0].path).toBe('/api/v1/batches');

        mocks.request.mockResolvedValue({ batch: { id: 'b1' }, lines: [], usage: [], checks: [] });
        expect((await getBatch('b1')).batch.id).toBe('b1');
        expect(calls()[1].path).toBe('/api/v1/batches/b1');
    });

    it('gives a plain message when a batch cannot be loaded', async () => {
        mocks.request.mockRejectedValue(new ApiError(404, 'not_found', 'That batch does not exist.'));
        await expect(getBatch('nope')).rejects.toThrow('That batch does not exist.');
    });

    it('reads every line of every batch for the metrics', async () => {
        mocks.request.mockResolvedValue([{ batch_id: 'b1', ingredient_id: 'i', name: 'Shea', actual_g: '10', cost: null }]);
        expect(await listBatchLines()).toHaveLength(1);
        expect(calls()[0].path).toBe('/api/v1/batches/lines');
    });

    it('suggestions for lot numbers never fail the form', async () => {
        mocks.request.mockResolvedValue(['261103-1']);
        expect(await lotNumbersLike('261103-')).toEqual(['261103-1']);
        expect(calls()[0].path).toBe('/api/v1/batches/lot-numbers?prefix=261103-');
        mocks.request.mockRejectedValue(new Error('down'));
        expect(await lotNumbersLike('x')).toEqual([]);
    });

    it('encodes the prefix so it cannot change the request', async () => {
        mocks.request.mockResolvedValue([]);
        await lotNumbersLike('a&b=c');
        expect(calls()[0].path).toBe('/api/v1/batches/lot-numbers?prefix=a%26b%3Dc');
    });
});

describe('editing', () => {
    it('saves changes to a batch with PATCH', async () => {
        await updateBatch('b1', { status: 'archived', measured_ph: 5.6 });
        expect(calls()[0]).toMatchObject({ path: '/api/v1/batches/b1', method: 'PATCH', body: { status: 'archived', measured_ph: 5.6 } });
    });

    it('records a check-in, with the note trimmed or left out', async () => {
        await completeCheck('c1', { result: 'minor', observations: ['odor'], measured_ph: 5.2, notes: '  a bit thin  ' });
        expect(calls()[0]).toMatchObject({ path: '/api/v1/batches/checks/c1', method: 'PUT', body: { result: 'minor', observations: ['odor'], measured_ph: 5.2, notes: 'a bit thin' } });
        await completeCheck('c1', { result: 'good', observations: [], measured_ph: null, notes: '   ' });
        expect(calls()[1].body?.notes).toBeNull();
    });

    it('adds a check-in with a trimmed label', async () => {
        await addCheck('b1', '  6 months ', '2027-05-06');
        expect(calls()[0]).toMatchObject({ path: '/api/v1/batches/b1/checks', method: 'POST', body: { label: '6 months', due_on: '2027-05-06' } });
    });
});

describe('check-ins that are due', () => {
    const today = new Date(2026, 10, 6);

    it('counts the due check-ins from the person\'s own date', async () => {
        mocks.request.mockResolvedValue({ count: 4 });
        expect(await countDueChecks(today)).toBe(4);
        expect(calls()[0].path).toBe('/api/v1/batches/checks/due/count?today=2026-11-06');
    });

    it('lists the oldest ones, with their batch', async () => {
        mocks.request.mockResolvedValue([{ id: 'c1', label: '24 hours', batch: { id: 'b1', name: 'Day Cream', lot_number: 'L1', target_ph: 5.5 } }]);
        const due = await listDueChecks(today, 5);
        expect(due[0].batch.name).toBe('Day Cream');
        expect(calls()[0].path).toBe('/api/v1/batches/checks/due?today=2026-11-06&limit=5');
    });

    it('gives an empty list when nothing is due, and a plain error when it fails', async () => {
        mocks.request.mockResolvedValue([]);
        expect(await listDueChecks(today)).toEqual([]);
        mocks.request.mockRejectedValue(new ApiError(500, 'error', 'Something went wrong. Please try again.'));
        await expect(listDueChecks(today)).rejects.toThrow('Something went wrong');
        await expect(countDueChecks(today)).rejects.toThrow('Something went wrong');
    });
});

describe('friendlyError', () => {
    it('keeps the backend\'s message, explains a network failure, and has a fallback', () => {
        expect(friendlyError(new ApiError(409, 'x', 'Pick a different lot number.')).message).toBe('Pick a different lot number.');
        expect(friendlyError(new TypeError('Failed to fetch')).message).toMatch(/reach the server/);
        expect(friendlyError(undefined, 'Nope').message).toBe('Nope');
        expect(friendlyError(new Error('plain')).message).toBe('plain');
    });
});
