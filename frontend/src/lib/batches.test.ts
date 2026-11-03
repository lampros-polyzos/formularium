import { describe, expect, it, vi } from 'vitest';
import { completeCheck, countDueChecks, createBatch, friendlyError, getBatch, isoDate, lotNumbersLike, voidBatch } from './batches';

// The tests pass their own fake client, so the real one (which needs the .env.local keys) must never load
vi.mock('./supabase', () => ({ supabase: {} }));

/** A chainable fake that records every call and resolves with `result` when awaited. */
function fakeClient(result: unknown = { data: [], error: null }, rpcResult: unknown = { data: 'batch-1', error: null }) {
    const calls: { method: string; args: unknown[] }[] = [];
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'is', 'lte', 'like', 'order', 'update', 'insert']) {
        chain[method] = (...args: unknown[]) => { calls.push({ method, args }); return chain; };
    }
    chain.single = async () => result;
    chain.then = (resolve: (v: unknown) => void) => resolve(result);
    const client = {
        from: (table: string) => { calls.push({ method: 'from', args: [table] }); return chain; },
        rpc: vi.fn(async (name: string, args: unknown) => { calls.push({ method: `rpc:${name}`, args: [args] }); return rpcResult; }),
    };
    return { client: client as never, calls, rpc: client.rpc };
}

describe('createBatch', () => {
    const input = {
        formulationId: 'f1', name: 'Day Cream', lotNumber: ' 261103-1 ', batchSizeG: 100, targetPh: 5.5, notes: 'first try',
        lines: [{
            ingredient_id: 'gly', name: 'Glycerin', inci_name: 'Glycerin', phase: 'A', percentage: 3, planned_g: 3, actual_g: 3,
            allocations: [{ stash_id: 's1', grams: 3, label: 'LOT-1' }],
        }],
    };

    it('sends the batch and the exact stash allocations in one call', async () => {
        const { client, rpc } = fakeClient();
        const id = await createBatch(input, client);
        expect(id).toBe('batch-1');
        expect(rpc).toHaveBeenCalledTimes(1);
        expect(rpc).toHaveBeenCalledWith('create_batch', expect.objectContaining({
            p_formulation_id: 'f1', p_name: 'Day Cream', p_lot_number: '261103-1', p_batch_size_g: 100, p_target_ph: 5.5, p_notes: 'first try',
            p_lines: input.lines, p_made_on: isoDate(),
        }));
    });

    it('sends no allocations when the batch is only recorded', async () => {
        const { client, rpc } = fakeClient();
        await createBatch({ ...input, lines: [{ ...input.lines[0], allocations: [] }] }, client);
        const sent = rpc.mock.calls[0][1] as { p_lines: { allocations: unknown[] }[] };
        expect(sent.p_lines.every(l => l.allocations.length === 0)).toBe(true);
    });

    it('sends the container, and the price to use for grams that are not taken from the stash', async () => {
        const { client, rpc } = fakeClient();
        const container = { id: 'c1', name: '50 ml bottle', volume_ml: 50, count: 3.4, unit_price: 0.8, density_g_ml: 0.97 };
        await createBatch({ ...input, container, lines: [{ ...input.lines[0], est_price_per_g: 0.03 }] }, client);
        expect(rpc).toHaveBeenCalledTimes(1);
        const sent = rpc.mock.calls[0][1] as { p_container: unknown; p_lines: { est_price_per_g: number }[] };
        expect(sent.p_container).toEqual(container);
        expect(sent.p_lines[0].est_price_per_g).toBe(0.03);
    });

    it('sends no container when none was picked', async () => {
        const { client, rpc } = fakeClient();
        await createBatch(input, client);
        expect((rpc.mock.calls[0][1] as { p_container: unknown }).p_container).toBeNull();
    });

    it('starts the batch the old way if the database has not been updated yet, and still returns its id', async () => {
        const rpc = vi.fn()
            .mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.create_batch(p_container, ...)' } })
            .mockResolvedValueOnce({ data: 'batch-2', error: null });
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const id = await createBatch({ ...input, container: { id: null, name: 'Jar', volume_ml: 100, count: 1, unit_price: 1, density_g_ml: 1 } }, { rpc } as never);
        expect(id).toBe('batch-2');
        expect(rpc).toHaveBeenCalledTimes(2);
        expect(rpc.mock.calls[0][1]).toHaveProperty('p_container');
        expect(rpc.mock.calls[1][1]).not.toHaveProperty('p_container');
        expect(rpc.mock.calls[1][1]).toMatchObject({ p_lot_number: '261103-1', p_lines: input.lines }); // the same batch, same stash allocations
        vi.restoreAllMocks();
    });

    it('does not retry other failures: a retry could take from the stash twice', async () => {
        const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: 'P0001', message: 'Not enough Glycerin left in your stash.' } });
        await expect(createBatch(input, { rpc } as never)).rejects.toThrow(/Not enough Glycerin/);
        expect(rpc).toHaveBeenCalledTimes(1);
    });

    it('turns database errors into plain language', async () => {
        for (const [error, expected] of [
            [{ code: '23505', message: 'duplicate key value violates unique constraint' }, /lot number is already used/],
            [{ code: 'PGRST202', message: 'Could not find the function public.create_batch' }, /isn't set up in your database yet/],
            [{ code: 'P0001', message: 'Not enough Glycerin left in your stash. It may have changed.' }, /Not enough Glycerin left/],
            [{ code: '', message: 'TypeError: Failed to fetch' }, /Couldn't reach the server/],
        ] as const) {
            const { client } = fakeClient(undefined, { data: null, error });
            await expect(createBatch(input, client)).rejects.toThrow(expected);
        }
    });
});

describe('voidBatch', () => {
    it('asks the database to undo the batch', async () => {
        const { client, rpc } = fakeClient(undefined, { data: null, error: null });
        await voidBatch('b1', client);
        expect(rpc).toHaveBeenCalledWith('void_batch', { p_batch_id: 'b1' });
    });

    it('surfaces why it failed', async () => {
        const { client } = fakeClient(undefined, { data: null, error: { code: 'P0001', message: 'Batch not found, or it was already undone.' } });
        await expect(voidBatch('b1', client)).rejects.toThrow('already undone');
    });
});

describe('getBatch', () => {
    it('loads the batch with its lines, stash usage and check-ins', async () => {
        const { client, calls } = fakeClient({ data: [{ id: 'x' }], error: null });
        const detail = await getBatch('b1', client);
        expect(calls.filter(c => c.method === 'from').map(c => c.args[0])).toEqual(['batches', 'batch_ingredients', 'batch_stash_usage', 'batch_checks']);
        expect(detail.lines).toEqual([{ id: 'x' }]);
    });

    it('fails clearly when the tables do not exist yet', async () => {
        const { client } = fakeClient({ data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.batches'" } });
        await expect(getBatch('b1', client)).rejects.toThrow(/isn't set up/);
    });
});

describe('check-ins and counts', () => {
    it('records a check-in with the time it was done', async () => {
        const { client, calls } = fakeClient({ data: null, error: null });
        await completeCheck('c1', { result: 'minor', observations: ['odor'], measured_ph: 5.4, notes: '  slight  ' }, client);
        const update = calls.find(c => c.method === 'update')!.args[0] as Record<string, unknown>;
        expect(update).toMatchObject({ result: 'minor', observations: ['odor'], measured_ph: 5.4, notes: 'slight' });
        expect(typeof update.checked_at).toBe('string');
    });

    it('counts only unfinished check-ins that are due, on batches still in progress', async () => {
        const { client, calls } = fakeClient({ count: 3, error: null });
        expect(await countDueChecks(client, new Date(2026, 10, 3))).toBe(3);
        expect(calls.find(c => c.method === 'lte')!.args).toEqual(['due_on', '2026-11-03']);
        expect(calls.find(c => c.method === 'eq')!.args).toEqual(['batches.status', 'active']);
        expect(calls.some(c => c.method === 'is' && c.args[0] === 'checked_at')).toBe(true);
    });

    it('suggestions for lot numbers never fail the form', async () => {
        const { client } = fakeClient({ data: null, error: { message: 'boom' } });
        expect(await lotNumbersLike('261103', client)).toEqual([]);
    });
});

describe('friendlyError', () => {
    it('keeps unknown messages and has a fallback', () => {
        expect(friendlyError({ code: 'XX000', message: 'odd' }).message).toBe('odd');
        expect(friendlyError(null, 'fallback').message).toBe('fallback');
    });
});
