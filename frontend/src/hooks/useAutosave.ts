import { useCallback, useEffect, useRef, useState } from 'react';

export type AutosaveStatus = 'clean' | 'dirty' | 'saving' | 'error';

export interface AutosaveOptions {
    /** A string that changes whenever there is something new to save. */
    snapshot: string;
    /** True once `snapshot` reflects what is stored (e.g. after a saved formula has loaded). */
    ready: boolean;
    /** True when saving is currently possible (signed in, product type chosen, ...). */
    enabled: boolean;
    /** Saves the latest state. Throw (or reject) on failure. */
    save: () => Promise<void>;
    delayMs?: number;
    retryDelaysMs?: number[];
}

const DEFAULT_RETRY_DELAYS = [4000, 12000, 40000];

const messageOf = (e: unknown): string => {
    const text = e instanceof Error ? e.message : (e as { message?: unknown } | null)?.message;
    return typeof text === 'string' && text ? text : 'Could not save.';
};

/**
 * Saves after the user pauses, one save at a time, retrying with a growing delay when it fails.
 * Also saves when the tab is hidden or the component unmounts, and warns before the page is closed with unsaved work.
 */
export function useAutosave({ snapshot, ready, enabled, save, delayMs = 2500, retryDelaysMs = DEFAULT_RETRY_DELAYS }: AutosaveOptions) {
    // What is saved. Adopted from the first render where `ready` is true.
    const [base, setBase] = useState<{ value: string } | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

    if (ready && base === null) setBase({ value: snapshot });
    else if (!ready && base !== null) setBase(null);

    const dirty = base !== null && snapshot !== base.value;

    // Latest values for timers and event handlers
    const live = useRef({ snapshot, base: base?.value ?? null, enabled, save, retryDelaysMs });
    useEffect(() => {
        live.current = { ...live.current, snapshot, base: base?.value ?? null, enabled, save, retryDelaysMs };
    });

    const inFlight = useRef<Promise<string | null> | null>(null);
    const retryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const retryCount = useRef(0);
    const unmounted = useRef(false);
    const runRef = useRef<(manual?: boolean) => Promise<string | null>>(async () => null);

    /** Resolves to null on success (or when there was nothing to do), otherwise to an error message. */
    const run = useCallback(async (manual = false): Promise<string | null> => {
        if (inFlight.current) {
            if (!manual) return null;
            await inFlight.current; // let the running save finish, then save whatever changed since
        }
        const { snapshot: current, base: saved, enabled: canSave, save: doSave } = live.current;
        if (!manual && (!canSave || saved === null || current === saved)) return null;

        clearTimeout(retryTimer.current);
        const job = (async (): Promise<string | null> => {
            setIsSaving(true);
            try {
                await doSave();
                live.current.base = current;
                setBase({ value: current });
                setError(null);
                setLastSavedAt(new Date());
                retryCount.current = 0;
                return null;
            } catch (e) {
                const message = messageOf(e);
                setError(message);
                if (!unmounted.current) {
                    const delays = live.current.retryDelaysMs;
                    const wait = delays[Math.min(retryCount.current, delays.length - 1)];
                    retryCount.current += 1;
                    retryTimer.current = setTimeout(() => { void runRef.current(false); }, wait);
                }
                return message;
            } finally {
                setIsSaving(false);
            }
        })();
        inFlight.current = job;
        try {
            return await job;
        } finally {
            if (inFlight.current === job) inFlight.current = null;
        }
    }, []);

    useEffect(() => {
        runRef.current = run;
    }, [run]);

    // Save a moment after the last change
    useEffect(() => {
        if (!enabled || !dirty || isSaving || error) return;
        const timer = setTimeout(() => { void run(false); }, delayMs);
        return () => clearTimeout(timer);
    }, [snapshot, enabled, dirty, isSaving, error, delayMs, run]);

    // Leaving the tab or the page, coming back online, and unmounting
    useEffect(() => {
        unmounted.current = false;
        const flush = () => { void run(false); };
        const onVisibility = () => { if (document.visibilityState === 'hidden') flush(); };
        const onBeforeUnload = (e: BeforeUnloadEvent) => {
            const { snapshot: current, base: saved } = live.current;
            if (saved !== null && current !== saved) {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        document.addEventListener('visibilitychange', onVisibility);
        window.addEventListener('pagehide', flush);
        window.addEventListener('online', flush);
        window.addEventListener('beforeunload', onBeforeUnload);
        return () => {
            document.removeEventListener('visibilitychange', onVisibility);
            window.removeEventListener('pagehide', flush);
            window.removeEventListener('online', flush);
            window.removeEventListener('beforeunload', onBeforeUnload);
            unmounted.current = true;
            clearTimeout(retryTimer.current);
            void run(false); // don't lose changes made just before navigating away
        };
    }, [run]);

    const status: AutosaveStatus = isSaving ? 'saving' : error ? 'error' : dirty ? 'dirty' : 'clean';
    const saveNow = useCallback(() => run(true), [run]);

    return { status, dirty, error, lastSavedAt, saveNow };
}
