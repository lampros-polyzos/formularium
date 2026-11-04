import { useEffect, useState } from 'react';
import type { AnnexData } from '../lib/annexIII/parse';

/**
 * The official EU Annex III entries (about 100 KB), loaded only once they are needed so they stay out of the main download.
 * Undefined until loaded, or if loading fails: the hand-written limits keep working either way.
 */
export function useAnnexIII(enabled: boolean): AnnexData | undefined {
    const [data, setData] = useState<AnnexData>();
    useEffect(() => {
        if (!enabled || data) return;
        let live = true;
        import('../lib/annexIII/entries.generated')
            .then(module => { if (live) setData(module.ANNEX_III); })
            .catch(error => console.error('Could not load the EU Annex III entries:', error));
        return () => { live = false; };
    }, [enabled, data]);
    return data;
}
