import { useCallback, useEffect, useState } from 'react';
import { addFavorite, fetchFavorites, removeFavorite } from '../lib/libraryApi';
import type { DatabaseIngredient } from '../types/formulation';

/** The signed-in user's favourite ingredients, with an optimistic toggle that goes back if the server says no. */
export function useFavorites(userId: string | undefined) {
    const [favorites, setFavorites] = useState<DatabaseIngredient[]>([]);

    useEffect(() => {
        if (!userId) return;
        let live = true;
        fetchFavorites()
            .then(rows => { if (live) setFavorites(rows); })
            .catch(error => console.error('Could not load your favourite ingredients:', error));
        return () => { live = false; };
    }, [userId]);

    const toggleFavorite = useCallback(async (ingredient: DatabaseIngredient) => {
        if (!userId) return;
        const isFavorite = favorites.some(f => f.id === ingredient.id);

        setFavorites(prev => (isFavorite ? prev.filter(f => f.id !== ingredient.id) : [...prev, ingredient]));
        try {
            if (isFavorite) await removeFavorite(ingredient.id);
            else await addFavorite(ingredient.id);
        } catch (error) {
            console.error('Could not save the favourite:', error);
            setFavorites(prev => (isFavorite ? [...prev, ingredient] : prev.filter(f => f.id !== ingredient.id)));
        }
    }, [userId, favorites]);

    return { favorites, toggleFavorite };
}
