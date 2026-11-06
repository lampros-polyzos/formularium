import { useCallback, useEffect, useState } from 'react';
import type { MetricsInput } from '../lib/metrics';
import { loadMetricsInput } from '../lib/metricsData';

export type MetricsState =
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'ready'; input: MetricsInput };

/** Everything the Metrics page needs, loaded once and again on request. */
export function useMetricsData(userId: string | undefined) {
    const [state, setState] = useState<MetricsState>({ status: 'loading' });
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        if (!userId) return;
        let cancelled = false;
        loadMetricsInput()
            .then(input => { if (!cancelled) setState({ status: 'ready', input }); })
            .catch(e => { if (!cancelled) setState({ status: 'error', message: e instanceof Error ? e.message : 'Something went wrong.' }); });
        return () => { cancelled = true; };
    }, [userId, attempt]);

    const reload = useCallback(() => {
        setState({ status: 'loading' });
        setAttempt(n => n + 1);
    }, []);

    return { state, reload };
}
