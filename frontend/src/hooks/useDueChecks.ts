import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { countDueChecks } from '../lib/batches';

/** Pages dispatch this after changing batches or check-ins, so badges update without a reload. */
export const BATCHES_CHANGED = 'formularium:batches-changed';
export const notifyBatchesChanged = () => window.dispatchEvent(new Event(BATCHES_CHANGED));

/** How many stability check-ins are due or overdue. Quietly 0 if the batch log isn't available. */
export function useDueChecks(): number {
    const { user } = useAuth();
    const userId = user?.id;
    const [count, setCount] = useState(0);

    useEffect(() => {
        if (!userId) return;
        let cancelled = false;
        const refresh = async () => {
            try {
                const n = await countDueChecks();
                if (!cancelled) setCount(n);
            } catch {
                if (!cancelled) setCount(0); // a badge must never get in the way of the page
            }
        };
        refresh();
        window.addEventListener(BATCHES_CHANGED, refresh);
        window.addEventListener('focus', refresh);
        return () => {
            cancelled = true;
            window.removeEventListener(BATCHES_CHANGED, refresh);
            window.removeEventListener('focus', refresh);
        };
    }, [userId]);

    return userId ? count : 0;
}
