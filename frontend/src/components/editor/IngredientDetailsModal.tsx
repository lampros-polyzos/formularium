import type { DatabaseIngredient } from '../../types/formulation';

interface IngredientDetailsModalProps {
    ingredient: DatabaseIngredient;
    isFavorite: boolean;
    onToggleFavorite: () => void;
    onClose: () => void;
}

export default function IngredientDetailsModal({ ingredient, isFavorite, onToggleFavorite, onClose }: IngredientDetailsModalProps) {
    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full overflow-hidden">
                <div className="bg-[#e9eee7] px-6 py-4 border-b border-[#c1d1b9] flex justify-between items-start">
                    <div className="pr-4">
                        <h3 className="text-lg font-bold text-[#1f382a]">{ingredient.trade_name}</h3>
                        <p className="text-xs text-gray-600 font-mono">{ingredient.inci_name}</p>
                    </div>
                    <div className="flex items-center gap-4 pt-1">
                        <button
                            onClick={onToggleFavorite}
                            className={`text-2xl transition-colors hover:scale-110 ${isFavorite
                                ? 'text-red-500 drop-shadow-sm'
                                : 'text-gray-300 hover:text-red-400'
                                }`}
                            title={isFavorite ? "Remove from favorites" : "Add to favorites"}
                        >
                            {isFavorite ? '♥' : '♡'}
                        </button>
                        <button
                            onClick={onClose}
                            className="text-gray-500 hover:text-gray-800 text-2xl font-bold leading-none -mt-1"
                        >
                            &times;
                        </button>
                    </div>
                </div>

                <div className="p-6 text-sm text-gray-700 space-y-4">
                    <div>
                        <h4 className="font-semibold text-gray-900 mb-1">Summary</h4>
                        <p>{ingredient.description || 'No summary available.'}</p>
                    </div>

                    <div>
                        <h4 className="font-semibold text-gray-900 mb-1">Common Uses</h4>
                        <p>{ingredient.common_uses || 'No common uses specified.'}</p>
                    </div>

                    <div>
                        <h4 className="font-semibold text-gray-900 mb-2">Key Attributes</h4>
                        <div className="grid grid-cols-2 gap-3 bg-gray-50 p-3 rounded border border-gray-100 text-xs">
                            <div>
                                <span className="text-gray-500 block mb-0.5">Function</span>
                                <span className="font-medium">{ingredient.function}</span>
                            </div>
                            <div>
                                <span className="text-gray-500 block mb-0.5">Solubility</span>
                                <span className="font-medium capitalize">{ingredient.solubility}</span>
                            </div>
                            <div>
                                <span className="text-gray-500 block mb-0.5">Usage Rate</span>
                                <span className="font-medium">
                                    {ingredient.min_usage_pct ?? 0}% – {ingredient.max_usage_pct ?? 100}%
                                </span>
                            </div>
                            <div>
                                <span className="text-gray-500 block mb-0.5">Optimal pH</span>
                                <span className="font-medium">
                                    {ingredient.optimal_ph_min && ingredient.optimal_ph_max
                                        ? `${ingredient.optimal_ph_min} – ${ingredient.optimal_ph_max}`
                                        : 'Broad / Not specified'}
                                </span>
                            </div>
                            <div>
                                <span className="text-gray-500 block mb-0.5">Heat Tolerance</span>
                                <span className="font-medium">
                                    {ingredient.max_heating_temp_c
                                        ? `≤ ${ingredient.max_heating_temp_c}°C`
                                        : 'Heat stable'}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-[#2c4c3b] text-white text-sm rounded hover:bg-[#1f382a] transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
