import { useEffect, useState } from 'react';

interface WakeLockSentinelLike { release: () => Promise<void> }
interface WakeLockApi { request: (type: 'screen') => Promise<WakeLockSentinelLike> }

/**
 * Keeps the screen from going to sleep while `active`, so a phone propped up at the bench stays lit. The browser
 * gives the lock up whenever the page is hidden, so it is asked for again when the page comes back.
 * `held` says whether the screen is being kept awake right now; browsers without the feature simply never hold it.
 */
export function useWakeLock(active: boolean): { held: boolean } {
    const [held, setHeld] = useState(false);

    useEffect(() => {
        const api = (navigator as unknown as { wakeLock?: WakeLockApi }).wakeLock;
        if (!active || !api) return;

        let cancelled = false;
        let sentinel: WakeLockSentinelLike | null = null;

        const acquire = async () => {
            try {
                const lock = await api.request('screen');
                if (cancelled) { void lock.release().catch(() => {}); return; }
                sentinel = lock;
                setHeld(true);
            } catch {
                if (!cancelled) setHeld(false); // refused (low battery, hidden page): not worth bothering anyone about
            }
        };
        const onVisible = () => { if (document.visibilityState === 'visible') void acquire(); };

        void acquire();
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            cancelled = true;
            document.removeEventListener('visibilitychange', onVisible);
            if (sentinel) void sentinel.release().catch(() => {});
            setHeld(false);
        };
    }, [active]);

    return { held };
}
