import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchFormulaSummary, fetchPostSummary, fetchRemixes, isMissingLineageColumn, withLineage, type Lineage } from './lineage';

type Res = { data: unknown; error: { code?: string; message?: string } | null };

const mocks = vi.hoisted(() => ({
    result: { data: null, error: null } as { data: unknown; error: { message: string } | null },
    calls: [] as { table: string; steps: [string, unknown[]][] }[],
}));

const formulas = vi.hoisted(() => ({ fetchFormula: vi.fn() }));
vi.mock('./formulasApi', () => formulas);

vi.mock('./supabase', () => ({
    supabase: {
        from: (table: string) => {
            const call = { table, steps: [] as [string, unknown[]][] };
            mocks.calls.push(call);
            const b: Record<string, unknown> = {};
            for (const m of ['select', 'eq', 'order', 'limit', 'maybeSingle']) {
                b[m] = (...args: unknown[]) => { call.steps.push([m, args]); return m === 'maybeSingle' ? Promise.resolve(mocks.result) : b; };
            }
            b.then = (resolve: (v: unknown) => void) => resolve(mocks.result);
            return b;
        },
    },
}));

beforeEach(() => {
    mocks.calls = [];
    mocks.result = { data: null, error: null };
    vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('isMissingLineageColumn', () => {
    it('recognises a database that has not been migrated', () => {
        expect(isMissingLineageColumn({ code: '42703' })).toBe(true); // Postgres: undefined column
        expect(isMissingLineageColumn({ code: 'PGRST204' })).toBe(true); // PostgREST: column not in schema cache
        expect(isMissingLineageColumn({ message: 'Could not find the \'remixed_from_post_id\' column of \'formulations\' in the schema cache' })).toBe(true);
    });

    it('does not mistake other failures for it', () => {
        expect(isMissingLineageColumn(null)).toBe(false);
        expect(isMissingLineageColumn({ code: '23503', message: 'foreign key violation on remixed_from_post_id' })).toBe(false);
        expect(isMissingLineageColumn({ code: '42501', message: 'permission denied' })).toBe(false);
    });
});

describe('withLineage', () => {
    const ok = { data: { id: 'new' }, error: null };

    it('writes without any lineage fields when there is nothing to record', async () => {
        const run = vi.fn<(extra: Lineage) => Promise<Res>>().mockResolvedValue(ok);
        await withLineage(run, { cloned_from_formulation_id: null, remixed_from_post_id: undefined });
        expect(run).toHaveBeenCalledTimes(1);
        expect(run).toHaveBeenCalledWith({});
    });

    it('passes along only the fields that have a value', async () => {
        const run = vi.fn<(extra: Lineage) => Promise<Res>>().mockResolvedValue(ok);
        const result = await withLineage(run, { cloned_from_formulation_id: 'f1', remixed_from_post_id: null });
        expect(run).toHaveBeenCalledTimes(1);
        expect(run).toHaveBeenCalledWith({ cloned_from_formulation_id: 'f1' });
        expect(result.data).toEqual({ id: 'new' });
    });

    it('saves again without the link if the database does not have the columns yet', async () => {
        const run = vi.fn<(extra: Lineage) => Promise<Res>>()
            .mockResolvedValueOnce({ data: null, error: { code: '42703', message: 'column "remixed_from_post_id" does not exist' } })
            .mockResolvedValueOnce(ok);
        const result = await withLineage(run, { remixed_from_post_id: 'p1' });
        expect(run).toHaveBeenNthCalledWith(1, { remixed_from_post_id: 'p1' });
        expect(run).toHaveBeenNthCalledWith(2, {});
        expect(result.data).toEqual({ id: 'new' });
        expect(console.warn).toHaveBeenCalled();
    });

    it('returns any other error as it is, without trying again', async () => {
        const failure = { data: null, error: { code: '42501', message: 'permission denied' } };
        const run = vi.fn<(extra: Lineage) => Promise<Res>>().mockResolvedValue(failure);
        const result = await withLineage(run, { remixed_from_post_id: 'p1' });
        expect(run).toHaveBeenCalledTimes(1);
        expect(result).toBe(failure);
    });
});

describe('lookups', () => {
    it('finds the original recipe, and gives nothing if it is gone or unreadable', async () => {
        mocks.result = { data: { id: 'p1', title: 'Day Cream', author_name: 'Sam' }, error: null };
        expect(await fetchPostSummary('p1')).toEqual({ id: 'p1', title: 'Day Cream', author_name: 'Sam' });
        expect(mocks.calls[0].table).toBe('community_posts');

        mocks.result = { data: null, error: null };
        expect(await fetchPostSummary('p1')).toBeNull();
        mocks.result = { data: null, error: { message: 'boom' } };
        expect(await fetchPostSummary('p1')).toBeNull();
    });

    it('finds the formula a copy was made from', async () => {
        formulas.fetchFormula.mockResolvedValue({ id: 'f1', name: 'My Lotion', profile_id: 'ow_lotion', formulation_phases: [] });
        expect(await fetchFormulaSummary('f1')).toEqual({ id: 'f1', name: 'My Lotion' });
        formulas.fetchFormula.mockRejectedValue(new Error('That formula does not exist.')); // someone else's private formula: the backend says it is not there
        expect(await fetchFormulaSummary('f1')).toBeNull();
    });

    it('lists remixes of a recipe, newest first and limited', async () => {
        mocks.result = { data: [{ id: 'r1', title: 'Remix', author_name: 'Kim', created_at: '2026-11-01' }], error: null };
        expect(await fetchRemixes('p1', 5)).toHaveLength(1);
        const steps = Object.fromEntries(mocks.calls[0].steps);
        expect(steps.eq).toEqual(['remixed_from_post_id', 'p1']);
        expect(steps.order).toEqual(['created_at', { ascending: false }]);
        expect(steps.limit).toEqual([5]);
    });

    it('lists nothing when the lookup fails', async () => {
        mocks.result = { data: null, error: { message: 'boom' } };
        expect(await fetchRemixes('p1')).toEqual([]);
    });
});
