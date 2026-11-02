import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAutosave } from './useAutosave';

type Props = { snapshot: string; ready: boolean; enabled: boolean };

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup(save: () => Promise<void>, initial: Partial<Props> = {}) {
    return renderHook(
        (p: Props) => useAutosave({ ...p, save, delayMs: 1000, retryDelaysMs: [2000, 5000] }),
        { initialProps: { snapshot: 'v1', ready: true, enabled: true, ...initial } },
    );
}

const flush = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };

describe('useAutosave', () => {
    it('saves once after the user stops changing things (debounce)', async () => {
        const save = vi.fn().mockResolvedValue(undefined);
        const { result, rerender } = setup(save);
        expect(result.current.status).toBe('clean');

        rerender({ snapshot: 'v2', ready: true, enabled: true });
        expect(result.current.status).toBe('dirty');
        await flush(900);
        rerender({ snapshot: 'v3', ready: true, enabled: true }); // keeps typing: timer restarts
        await flush(900);
        expect(save).not.toHaveBeenCalled();
        await flush(200);

        expect(save).toHaveBeenCalledTimes(1);
        expect(result.current.status).toBe('clean');
        expect(result.current.lastSavedAt).not.toBeNull();
    });

    it('does not treat the loaded state as a change, and does nothing until ready', async () => {
        const save = vi.fn().mockResolvedValue(undefined);
        const { result, rerender } = setup(save, { ready: false, snapshot: 'half-loaded' });
        rerender({ snapshot: 'fully-loaded', ready: true, enabled: true });
        await flush(5000);
        expect(save).not.toHaveBeenCalled();
        expect(result.current.dirty).toBe(false);

        rerender({ snapshot: 'edited', ready: true, enabled: true });
        await flush(1000);
        expect(save).toHaveBeenCalledTimes(1);
    });

    it('never saves while disabled, but still reports unsaved changes', async () => {
        const save = vi.fn().mockResolvedValue(undefined);
        const { result, rerender } = setup(save, { enabled: false });
        rerender({ snapshot: 'v2', ready: true, enabled: false });
        await flush(5000);
        expect(save).not.toHaveBeenCalled();
        expect(result.current.dirty).toBe(true);

        rerender({ snapshot: 'v2', ready: true, enabled: true });
        await flush(1000);
        expect(save).toHaveBeenCalledTimes(1);
    });

    it('never runs two saves at once and saves the newer state afterwards', async () => {
        let release: () => void = () => {};
        const save = vi.fn().mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; })).mockResolvedValue(undefined);
        const { result, rerender } = setup(save);

        rerender({ snapshot: 'v2', ready: true, enabled: true });
        await flush(1000);
        expect(save).toHaveBeenCalledTimes(1);
        expect(result.current.status).toBe('saving');

        rerender({ snapshot: 'v3', ready: true, enabled: true }); // edited during the save
        await flush(3000);
        expect(save).toHaveBeenCalledTimes(1);

        await act(async () => { release(); });
        await flush(1000);
        expect(save).toHaveBeenCalledTimes(2);
        expect(result.current.status).toBe('clean');
    });

    it('reports an error and retries with a growing delay until it works', async () => {
        const save = vi.fn()
            .mockRejectedValueOnce({ message: 'network down' })
            .mockRejectedValueOnce(new Error('still down'))
            .mockResolvedValue(undefined);
        const { result, rerender } = setup(save);

        rerender({ snapshot: 'v2', ready: true, enabled: true });
        await flush(1000);
        expect(result.current.status).toBe('error');
        expect(result.current.error).toBe('network down');

        await flush(2000); // first retry
        expect(save).toHaveBeenCalledTimes(2);
        expect(result.current.error).toBe('still down');

        await flush(5000); // second retry succeeds
        expect(save).toHaveBeenCalledTimes(3);
        expect(result.current.status).toBe('clean');
        expect(result.current.error).toBeNull();
    });

    it('saveNow saves even when nothing changed and returns the error message on failure', async () => {
        const save = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('boom'));
        const { result } = setup(save);

        let outcome: string | null = 'unset';
        await act(async () => { outcome = await result.current.saveNow(); });
        expect(outcome).toBeNull();
        expect(save).toHaveBeenCalledTimes(1);

        await act(async () => { outcome = await result.current.saveNow(); });
        expect(outcome).toBe('boom');
    });

    it('saves pending changes when the tab is hidden', async () => {
        const save = vi.fn().mockResolvedValue(undefined);
        const { rerender } = setup(save);
        rerender({ snapshot: 'v2', ready: true, enabled: true });
        Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
        await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
        Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
        expect(save).toHaveBeenCalledTimes(1);
    });

    it('saves pending changes when the component unmounts (navigating away)', async () => {
        const save = vi.fn().mockResolvedValue(undefined);
        const { rerender, unmount } = setup(save);
        rerender({ snapshot: 'v2', ready: true, enabled: true });
        await act(async () => { unmount(); });
        expect(save).toHaveBeenCalledTimes(1);
    });

    it('does not save on unmount when everything is already saved', async () => {
        const save = vi.fn().mockResolvedValue(undefined);
        const { unmount } = setup(save);
        await act(async () => { unmount(); });
        expect(save).not.toHaveBeenCalled();
    });

    it('asks the browser to confirm before closing a page with unsaved changes', () => {
        const { rerender } = setup(vi.fn().mockResolvedValue(undefined));
        const clean = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(clean);
        expect(clean.defaultPrevented).toBe(false);

        rerender({ snapshot: 'v2', ready: true, enabled: true });
        const dirty = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(dirty);
        expect(dirty.defaultPrevented).toBe(true);
    });
});
