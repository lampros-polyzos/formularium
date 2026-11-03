import { useCallback, useEffect, useState } from 'react';
import { listVersions, loadCurrent, type FormulaVersion } from '../lib/formulaVersions';

export type HistoryState =
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'ready'; current: FormulaVersion; versions: FormulaVersion[] };

/** A formula as it is now, and its saved versions (newest first). */
export function useFormulaHistory(formulaId: string | undefined) {
    const [state, setState] = useState<HistoryState>({ status: 'loading' });
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        if (!formulaId) return;
        let cancelled = false;
        Promise.all([loadCurrent(formulaId), listVersions(formulaId)])
            .then(([current, versions]) => { if (!cancelled) setState({ status: 'ready', current, versions }); })
            .catch(e => { if (!cancelled) setState({ status: 'error', message: e instanceof Error ? e.message : 'Something went wrong.' }); });
        return () => { cancelled = true; };
    }, [formulaId, attempt]);

    const reload = useCallback(() => {
        setState({ status: 'loading' });
        setAttempt(n => n + 1);
    }, []);

    return { state, reload };
}
