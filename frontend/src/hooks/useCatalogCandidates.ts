import { useEffect, useMemo, useRef, useState } from 'react';
import { toOrFilter, type CatalogFilter } from '../lib/catalogFilter';
import { fetchCandidates } from '../lib/catalogQuery';
import type { CatalogIngredient } from '../lib/substitutions';

/**
 * Loads the part of the ingredient catalog a task can use, instead of the whole catalog.
 *
 * Give it one list of filters per thing you need candidates for (one per missing ingredient, say). It fetches
 * each distinct list once, remembers the answer for as long as the page is open, and returns everything
 * gathered so far. `isLoading` is true from the moment a list is asked for until its rows have arrived.
 */
export function useCatalogCandidates(groups: CatalogFilter[][], stashIds: string[]) {
    // Strings, so a new array of the same filters on every render doesn't look like a change. The same filters in any order or
    // with repeats are one key. JSON never contains a raw line break, so one line per list is safe.
    const filterKey = [...new Map(groups.map(g => [toOrFilter(g), JSON.stringify(g)] as const).filter(([k]) => k)).values()].sort().join('\n');
    const stashKey = [...new Set(stashIds)].sort().join(',');
    const requestKey = filterKey ? `${filterKey}#${stashKey}` : '';

    const cache = useRef(new Map<string, Promise<CatalogIngredient[]>>());
    const [pool, setPool] = useState<CatalogIngredient[]>([]);
    const [settledKey, setSettledKey] = useState('');

    useEffect(() => {
        if (!filterKey) return;
        let cancelled = false;
        const stash = stashKey ? stashKey.split(',') : [];

        const lists = filterKey.split('\n').map(listJson => {
            const cacheKey = `${listJson}#${stashKey}`;
            let request = cache.current.get(cacheKey);
            if (!request) {
                request = fetchCandidates(JSON.parse(listJson) as CatalogFilter[], stash);
                cache.current.set(cacheKey, request);
                request.catch(() => cache.current.delete(cacheKey)); // a failure is retried next time, not remembered
            }
            return request;
        });

        Promise.all(lists)
            .then(found => {
                if (cancelled) return;
                setPool(prev => {
                    const known = new Set(prev.map(i => i.id));
                    const added = found.flat().filter((i, k, all) => !known.has(i.id) && all.findIndex(o => o.id === i.id) === k);
                    return added.length ? [...prev, ...added] : prev;
                });
            })
            .catch(error => console.error('Could not load ingredient candidates:', error))
            .finally(() => { if (!cancelled) setSettledKey(`${filterKey}#${stashKey}`); });

        return () => { cancelled = true; };
    }, [filterKey, stashKey]);

    const isLoading = requestKey !== '' && settledKey !== requestKey;
    return useMemo(() => ({ candidates: pool, isLoading }), [pool, isLoading]);
}
