import { useEffect, useState } from 'react';
import { fetchFormulaSummary, fetchPostSummary, type FormulaSummary, type PostSummary } from '../lib/lineage';

interface Loaded { key: string; post: PostSummary | null; formula: FormulaSummary | null }

/**
 * Names for the "remixed from" and "copied from" links of a formula. Both stay null while loading, when the
 * original has been deleted, or when it can't be read (someone else's private formula), so a missing original
 * simply shows no link.
 */
export function useLineage(remixedFromPostId: string | null, clonedFromFormulationId: string | null) {
    const key = `${remixedFromPostId ?? ''}|${clonedFromFormulationId ?? ''}`;
    const [loaded, setLoaded] = useState<Loaded | null>(null);

    useEffect(() => {
        if (!remixedFromPostId && !clonedFromFormulationId) return;
        let cancelled = false;
        Promise.all([
            remixedFromPostId ? fetchPostSummary(remixedFromPostId) : null,
            clonedFromFormulationId ? fetchFormulaSummary(clonedFromFormulationId) : null,
        ]).then(([post, formula]) => {
            if (!cancelled) setLoaded({ key, post, formula });
        });
        return () => { cancelled = true; };
    }, [key, remixedFromPostId, clonedFromFormulationId]);

    // Names from an earlier formula must not be shown for the current one
    const current = loaded?.key === key ? loaded : null;
    return { remixedFrom: current?.post ?? null, clonedFrom: current?.formula ?? null };
}
