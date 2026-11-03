import type { DatabaseIngredient } from '../../types/formulation';

interface IngredientSearchProps {
    searchTerm: string;
    onSearchTermChange: (value: string) => void;
    isSearching: boolean;
    results: DatabaseIngredient[];
    onAdd: (ingredient: DatabaseIngredient) => void;
}

export default function IngredientSearch({ searchTerm, onSearchTermChange, isSearching, results, onAdd }: IngredientSearchProps) {
    return (
        <div className="relative" data-tour="search">
            <div className="bg-white p-3 rounded-lg border border-[#c1d1b9] shadow-sm flex items-center gap-3">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => onSearchTermChange(e.target.value)}
                    placeholder="Search by ingredient, INCI, or function (e.g. emulsifier, active)..."
                    className="w-full bg-transparent text-sm outline-none text-gray-700"
                />
                {isSearching && <span className="text-xs text-gray-400">Searching...</span>}
            </div>

            {/* Dropdown Results */}
            {results.length > 0 && (
                <ul className="absolute top-full left-0 right-0 bg-white border border-[#c1d1b9] mt-1 rounded-lg shadow-xl max-h-60 overflow-y-auto z-20">
                    {results.map((ingredient) => (
                        <li
                            key={ingredient.id}
                            onClick={() => onAdd(ingredient)}
                            className="px-4 py-3 border-b border-gray-100 last:border-b-0 hover:bg-[#f3f5f2] cursor-pointer flex flex-col"
                        >
                            <span className="font-semibold text-[#1f382a]">{ingredient.trade_name}</span>
                            <span className="text-xs text-gray-500">{ingredient.inci_name} • {ingredient.function}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
