import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCatalogCandidates } from './useCatalogCandidates';
import { CANDIDATE_LIMIT } from '../lib/catalogQuery';
import { fnHas, inci, type CatalogFilter } from '../lib/catalogFilter';

interface Call { or?: string; limit?: number; order?: string; inIds?: string[] }

const mocks = vi.hoisted(() => ({
    calls: [] as { or?: string; limit?: number; order?: string; inIds?: string[]; table: string; select?: string }[],
    rows: [] as { id: string; trade_name: string }[],
    failNext: false,
    gate: null as null | Promise<void>,
}));

vi.mock('../lib/supabase', () => ({
    supabase: {
        from: (table: string) => {
            const call: Call & { table: string; select?: string } = { table };
            mocks.calls.push(call);
            const b: Record<string, unknown> = {};
            b.select = (cols: string) => { call.select = cols; return b; };
            b.or = (f: string) => { call.or = f; return b; };
            b.order = (col: string) => { call.order = col; return b; };
            b.limit = (n: number) => { call.limit = n; return b; };
            b.in = (_col: string, ids: string[]) => { call.inIds = ids; return b; };
            b.then = (resolve: (v: unknown) => void) => {
                const done = () => {
                    if (mocks.failNext) { mocks.failNext = false; return resolve({ data: null, error: { message: 'down' } }); }
                    const rows = call.inIds ? mocks.rows.filter(r => call.inIds!.includes(r.id)) : mocks.rows;
                    resolve({ data: rows.slice(0, call.limit ?? rows.length), error: null });
                };
                if (mocks.gate) void mocks.gate.then(done); else done();
            };
            return b;
        },
    },
}));

const row = (id: string) => ({ id, trade_name: `Ingredient ${id}` });
const settle = () => act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); });
const emulsifier: CatalogFilter[] = [fnHas('emulsifier')];
const oils: CatalogFilter[] = [fnHas('oil'), inci('argania')];

beforeEach(() => {
    mocks.calls = [];
    mocks.rows = [row('a'), row('b'), row('c')];
    mocks.failNext = false;
    mocks.gate = null;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('useCatalogCandidates', () => {
    it('asks for nothing, and is not loading, when there is nothing to look for', async () => {
        const { result } = renderHook(() => useCatalogCandidates([], []));
        await settle();
        expect(mocks.calls).toHaveLength(0);
        expect(result.current).toEqual({ candidates: [], isLoading: false });
    });

    it('fetches only the rows a filter matches, never the whole table', async () => {
        const { result } = renderHook(() => useCatalogCandidates([emulsifier], []));
        await settle();
        expect(mocks.calls).toHaveLength(1);
        expect(mocks.calls[0]).toMatchObject({ table: 'ingredients', or: 'function.ilike."%emulsifier%"', order: 'trade_name', limit: CANDIDATE_LIMIT });
        expect(result.current.candidates.map(c => c.id)).toEqual(['a', 'b', 'c']);
    });

    it('reports loading from the moment something is asked for until it arrives', async () => {
        let release!: () => void;
        mocks.gate = new Promise<void>(resolve => { release = resolve; });
        const { result } = renderHook(() => useCatalogCandidates([emulsifier], []));
        expect(result.current.isLoading).toBe(true); // already true on the first render, so "none found" never flashes
        await settle();
        expect(result.current.isLoading).toBe(true);
        release();
        await settle();
        expect(result.current.isLoading).toBe(false);
        expect(result.current.candidates).toHaveLength(3);
    });

    it('does not ask again for a filter it already has, however often the caller re-renders', async () => {
        const { rerender } = renderHook(({ groups }) => useCatalogCandidates(groups, []), { initialProps: { groups: [emulsifier] } });
        await settle();
        rerender({ groups: [[fnHas('emulsifier')]] }); // a new array holding the same filter
        rerender({ groups: [emulsifier, emulsifier] }); // asked for twice
        await settle();
        expect(mocks.calls).toHaveLength(1);
    });

    it('fetches only what is new when more is needed, and keeps what it already has', async () => {
        const { result, rerender } = renderHook(({ groups }) => useCatalogCandidates(groups, []), { initialProps: { groups: [emulsifier] } });
        await settle();
        mocks.rows = [row('c'), row('d')];
        rerender({ groups: [emulsifier, oils] });
        await settle();
        expect(mocks.calls).toHaveLength(2);
        expect(mocks.calls[1].or).toBe('function.ilike."%oil%",inci_name.ilike."argania%"');
        expect(result.current.candidates.map(c => c.id)).toEqual(['a', 'b', 'c', 'd']); // c is not listed twice
    });

    it('looks up the stash in short batches so those ingredients are never cut off by the limit', async () => {
        const ids = Array.from({ length: 250 }, (_, i) => `s${i}`);
        mocks.rows = [...ids.map(row), row('z')];
        const { result } = renderHook(() => useCatalogCandidates([emulsifier], ids));
        await settle();
        const stashCalls = mocks.calls.filter(c => c.inIds);
        expect(stashCalls.map(c => c.inIds!.length)).toEqual([100, 100, 50]);
        expect(stashCalls.every(c => c.or === 'function.ilike."%emulsifier%"')).toBe(true);
        expect(mocks.calls.filter(c => !c.inIds)).toHaveLength(1);
        expect(result.current.candidates.map(c => c.id).sort()).toEqual([...ids, 'z'].sort());
    });

    it('asks again when the stash changes, since those lookups depend on it', async () => {
        const { rerender } = renderHook(({ stash }) => useCatalogCandidates([emulsifier], stash), { initialProps: { stash: ['a'] } });
        await settle();
        rerender({ stash: ['a', 'b'] });
        await settle();
        expect(mocks.calls.filter(c => !c.inIds)).toHaveLength(2);
    });

    it('gives up quietly on a failed request, finishes loading, and tries again next time', async () => {
        mocks.failNext = true;
        const { result, rerender } = renderHook(({ groups }) => useCatalogCandidates(groups, []), { initialProps: { groups: [emulsifier] } });
        await settle();
        expect(result.current.isLoading).toBe(false);
        expect(result.current.candidates).toEqual([]);
        expect(console.error).toHaveBeenCalled();

        rerender({ groups: [[]] });
        await settle();
        rerender({ groups: [emulsifier] });
        await settle();
        expect(result.current.candidates).toHaveLength(3); // the failure was not remembered
    });

    it('warns when a filter hits the limit, so growth does not go unnoticed', async () => {
        mocks.rows = Array.from({ length: CANDIDATE_LIMIT }, (_, i) => row(`r${i}`));
        renderHook(() => useCatalogCandidates([emulsifier], []));
        await settle();
        expect(console.warn).toHaveBeenCalledWith(expect.stringContaining(String(CANDIDATE_LIMIT)));
    });
});
