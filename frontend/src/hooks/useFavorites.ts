import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { DatabaseIngredient } from '../types/formulation';

/** The signed-in user's starred ingredients, with an optimistic toggle. */
export function useFavorites(userId: string | undefined) {
    const [favorites, setFavorites] = useState<DatabaseIngredient[]>([]);

    useEffect(() => {
        if (!userId) return;

        const fetchFavorites = async () => {
            const { data, error } = await supabase
                .from('favorite_ingredients')
                .select('ingredients(*)')
                .eq('user_id', userId);

            if (!error && data) {
                const valid = (data as unknown as { ingredients: DatabaseIngredient | null }[]).map(item => item.ingredients).filter((i): i is DatabaseIngredient => !!i);
                setFavorites(valid);
            }
        };

        fetchFavorites();
    }, [userId]);

    const toggleFavorite = useCallback(async (ingredient: DatabaseIngredient) => {
        if (!userId) return;

        if (favorites.some(f => f.id === ingredient.id)) {
            setFavorites(prev => prev.filter(f => f.id !== ingredient.id));
            await supabase
                .from('favorite_ingredients')
                .delete()
                .match({ user_id: userId, ingredient_id: ingredient.id });
        } else {
            setFavorites(prev => [...prev, ingredient]);
            await supabase
                .from('favorite_ingredients')
                .insert({ user_id: userId, ingredient_id: ingredient.id });
        }
    }, [userId, favorites]);

    return { favorites, toggleFavorite };
}
