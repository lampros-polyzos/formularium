import { useState } from 'react';
import type { DatabaseIngredient } from '../../types/formulation';

interface FavoritesMenuProps {
    favorites: DatabaseIngredient[];
    onAdd: (ingredient: DatabaseIngredient) => void;
    onRemove: (ingredient: DatabaseIngredient) => void;
}

/** Header dropdown with the ingredients the user has starred. */
export default function FavoritesMenu({ favorites, onAdd, onRemove }: FavoritesMenuProps) {
    const [showFavoritesMenu, setShowFavoritesMenu] = useState(false);

    return (
        <div className="relative" data-tour="favorites">
            <button
                onClick={() => setShowFavoritesMenu(!showFavoritesMenu)}
                className="flex items-center gap-1.5 hover:text-[#2c4c3b] transition-colors"
            >
                Favorites <span className="text-red-500 text-lg leading-none">♥</span>
            </button>

            {showFavoritesMenu && (
                <div className="absolute right-0 mt-3 w-80 bg-white border border-[#c1d1b9] rounded-lg shadow-xl z-50 flex flex-col overflow-hidden">
                    <div className="bg-[#e9eee7] px-4 py-2.5 border-b border-[#c1d1b9] font-bold text-[#1f382a] text-sm flex justify-between items-center">
                        Saved Ingredients
                        <span className="text-xs font-normal text-gray-500 bg-white px-2 py-0.5 rounded-full">{favorites.length}</span>
                    </div>

                    <div className="max-h-96 overflow-y-auto">
                        {favorites.length === 0 ? (
                            <div className="p-6 text-sm text-gray-500 text-center italic">
                                No favorites yet. Open an ingredient's details to star it!
                            </div>
                        ) : (
                            <ul className="divide-y divide-gray-100">
                                {favorites.map(fav => (
                                    <li key={fav.id} className="group flex items-center justify-between p-3 hover:bg-[#f3f5f2] transition-colors">
                                        <button
                                            onClick={() => { onAdd(fav); setShowFavoritesMenu(false); }}
                                            className="flex-1 text-left"
                                        >
                                            <div className="font-medium text-[#1f382a] text-sm truncate">{fav.trade_name || fav.inci_name}</div>
                                            <div className="text-xs text-gray-500 truncate">{fav.function}</div>
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onRemove(fav); }}
                                            className="text-gray-300 hover:text-red-500 p-1.5 ml-2 opacity-0 group-hover:opacity-100 transition-all rounded-full hover:bg-red-50"
                                            title="Remove from favorites"
                                        >
                                            ✖
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
