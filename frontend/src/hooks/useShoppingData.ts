import { useCallback, useEffect, useState } from 'react';
import type { StashLot } from '../lib/batchPlan';
import type { Recipe } from '../lib/pantry';
import { loadIngredients, loadOwnRecipes, loadStash } from '../lib/pantryData';
import type { CatalogIngredient } from '../lib/substitutions';

export interface ShoppingData {
    formulas: Recipe[];
    lots: StashLot[];
    stashIngredients: CatalogIngredient[];
}

export type ShoppingState =
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'ready'; data: ShoppingData };

/** Your formulas and your stash, loaded once and again on request. */
export function useShoppingData(userId: string | undefined) {
    const [state, setState] = useState<ShoppingState>({ status: 'loading' });
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        if (!userId) return;
        let cancelled = false;
        (async () => {
            try {
                const [formulas, lots] = await Promise.all([loadOwnRecipes(userId), loadStash(userId)]);
                const stashIngredients = await loadIngredients(lots.map(l => l.ingredient_id));
                if (!cancelled) setState({ status: 'ready', data: { formulas, lots, stashIngredients } });
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
