import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetSaveStateForTests, saveFormulation, type SaveInput } from './saveFormulation';

// The tests pass their own fake client, so the real one (which needs the .env.local keys) must never load
vi.mock('./supabase', () => ({ supabase: {} }));

type Call = { table?: string; op: string; payload?: unknown };

/** A fake Supabase client that records writes. `rpcResult` controls what the database function returns. */
function fakeClient(rpcResult: { error: { code?: string; message: string } | null } = { error: null }) {
    const calls: Call[] = [];
    const client = {
        from(table: string) {
            let op = 'select';
            const chain: Record<string, unknown> = {
                insert(payload: unknown) { op = 'insert'; calls.push({ table, op, payload }); return chain; },
                update(payload: unknown) { op = 'update'; calls.push({ table, op, payload }); return chain; },
                delete() { op = 'delete'; calls.push({ table, op }); return chain; },
                select() { return chain; },
                eq() { return chain; },
                single: async () => ({ data: { id: 'new-formula-id' }, error: null }),
                then(resolve: (v: unknown) => void) {
                    const data = op === 'insert' && table === 'formulation_phases'
                        ? [{ id: 'phase-a', phase_letter: 'A' }, { id: 'phase-b', phase_letter: 'B' }]
                        : null;
                    resolve({ data, error: null });
                },
            };
            return chain;
        },
        rpc: vi.fn(async (name: string, args: unknown) => {
            calls.push({ op: `rpc:${name}`, payload: args });
            return rpcResult;
        }),
    };
    return { client: client as never, calls, rpc: client.rpc };
}

const input = (over: Partial<SaveInput> = {}): SaveInput => ({
    formulaId: null, userId: 'u1', name: 'Lotion', profileId: 'ow_lotion', targetWeight: 100, targetPh: 5.5,
    ingredients: [
        { id: 'water', phase: 'A', percentage: 70, isQS: true },
        { id: 'oil', phase: 'B', percentage: 20, isQS: false },
        { id: 'glycerin', phase: 'A', percentage: 5, isQS: false },
    ],
    ...over,
});

beforeEach(() => resetSaveStateForTests());

describe('saveFormulation', () => {
    it('creates a new formula with status Draft and saves its contents in one atomic call', async () => {
        const { client, calls } = fakeClient();
        const id = await saveFormulation(input(), client);

        expect(id).toBe('new-formula-id');
        expect(calls[0]).toMatchObject({ table: 'formulations', op: 'insert' });
        expect((calls[0].payload as Record<string, unknown>[])[0]).toMatchObject({ status: 'Draft', user_id: 'u1', profile_id: 'ow_lotion' });
        const rpc = calls.find(c => c.op === 'rpc:save_formulation_contents')!;
        expect(rpc.payload).toMatchObject({ p_formulation_id: 'new-formula-id' });
        // sorted by phase, then by percentage descending
        expect((rpc.payload as { p_items: { ingredient_id: string }[] }).p_items.map(i => i.ingredient_id)).toEqual(['water', 'glycerin', 'oil']);
        expect(calls.some(c => c.table === 'formulation_phases')).toBe(false);
    });

    it('updates an existing formula without touching its status', async () => {
        const { client, calls } = fakeClient();
        const id = await saveFormulation(input({ formulaId: 'f1' }), client);

        expect(id).toBe('f1');
        expect(calls[0]).toMatchObject({ table: 'formulations', op: 'update' });
        expect(calls[0].payload).not.toHaveProperty('status');
    });

    it('falls back to the step-by-step save when the database function is missing, and remembers that', async () => {
        const missing = { error: { code: 'PGRST202', message: 'function not found' } };
        const first = fakeClient(missing);
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        await saveFormulation(input({ formulaId: 'f1' }), first.client);

        const tables = first.calls.map(c => `${c.op}:${c.table ?? ''}`);
        expect(tables).toEqual(expect.arrayContaining(['delete:formulation_phases', 'insert:formulation_phases', 'insert:formulation_ingredients']));
        const rows = first.calls.find(c => c.table === 'formulation_ingredients')!.payload as { phase_id: string }[];
        expect(rows.map(r => r.phase_id)).toEqual(['phase-a', 'phase-a', 'phase-b']);

        const second = fakeClient(missing);
        await saveFormulation(input({ formulaId: 'f1' }), second.client);
        expect(second.rpc).not.toHaveBeenCalled();
    });

    it('treats a connection failure as an error to retry, writing nothing else', async () => {
        const { client, calls } = fakeClient({ error: { code: '', message: 'TypeError: Failed to fetch' } });
        await expect(saveFormulation(input({ formulaId: 'f1' }), client)).rejects.toMatchObject({ message: 'TypeError: Failed to fetch' });
        expect(calls.some(c => c.op === 'delete')).toBe(false);
    });

    it('saves a formula with no ingredients', async () => {
        const { client, calls } = fakeClient();
        await saveFormulation(input({ ingredients: [] }), client);
        expect((calls.find(c => c.op.startsWith('rpc'))!.payload as { p_items: unknown[] }).p_items).toEqual([]);
    });
});
