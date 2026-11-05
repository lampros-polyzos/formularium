import { useCallback, useEffect, useState } from 'react';
import type { StashLot } from '../lib/batchPlan';
import type { Recipe } from '../lib/pantry';
import { loadCommunityRecipes, loadIngredients, loadOwnRecipes, loadStash } from '../lib/pantryData';
import type { CatalogIngredient } from '../lib/substitutions';

export interface PantryData {
    lots: StashLot[];
    /** The library rows for what is in the stash: the only ingredients stand-ins are picked from. */
    stashIngredients: CatalogIngredient[];
    recipes: Recipe[];
    /** There may be more community recipes than were looked at. */
    limited: boolean;
}

export type PantryState =
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'ready'; data: PantryData };

/** Loads your stash, your formulas and the community recipes once, and again on request. */
export function usePantry(userId: string | undefined) {
    const [state, setState] = useState<PantryState>({ status: 'loading' });
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        if (!userId) return;
        let cancelled = false;
        (async () => {
            try {
                const lots = await loadStash();
                const stashIngredients = await loadIngredients(lots.map(l => l.ingredient_id));
                const [own, community] = await Promise.all([
                    loadOwnRecipes(userId),
                    loadCommunityRecipes(userId, stashIngredients),
                ]);
                if (!cancelled) setState({ status: 'ready', data: { lots, stashIngredients, recipes: [...own, ...community.recipes], limited: community.limited } });
            } catch (e) {
                if (!cancelled) setState({ status: 'error', message: e instanceof Error ? e.message : 'Something went wrong.' });
            }
        })();
        return () => { cancelled = true; };
    }, [userId, attempt]);

    const reload = useCallback(() => {
        setState({ status: 'loading' });
        setAttempt(n => n + 1);
    }, []);

    return { state, reload };
}
