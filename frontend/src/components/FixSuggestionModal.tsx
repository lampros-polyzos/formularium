import { useEffect } from 'react';
import { X } from 'lucide-react';
import { CATEGORY_INFO, type Suggestion } from '../lib/fixSuggestions';
import type { FixCategory } from '../types/fixes';

interface FixSuggestionModalProps {
    category: FixCategory;
    suggestions: Suggestion[];
    onPick: (suggestion: Suggestion) => void;
    onBrowse: () => void;
    onClose: () => void;
}

export default function FixSuggestionModal({ category, suggestions, onPick, onBrowse, onClose }: FixSuggestionModalProps) {
    const info = CATEGORY_INFO[category];

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="fix-title"
                className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="bg-[#e9eee7] px-5 py-4 border-b border-[#c1d1b9] flex justify-between items-start gap-4">
                    <div>
                        <h3 id="fix-title" className="text-lg font-bold text-[#1f382a]">{info.title}</h3>
                        <p className="text-xs text-gray-600 mt-0.5">{info.hint}</p>
                    </div>
                    <button onClick={onClose} aria-label="Close" className="text-gray-500 hover:text-gray-800 p-1"><X size={20} /></button>
                </div>

                <div className="overflow-y-auto p-5">
                    {suggestions.length === 0 ? (
                        <p className="text-sm text-gray-600">
                            Nothing in the library matches your target pH and claims. Search the full library, or relax a claim.
                        </p>
                    ) : (
                        <ul className="space-y-2">
                            {suggestions.map(({ ingredient, reasons }) => (
                                <li key={ingredient.id} className="border border-gray-200 rounded-lg p-3 flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="font-semibold text-[#1f382a] truncate">{ingredient.trade_name}</div>
                                        <div className="text-[11px] text-gray-500 truncate">{ingredient.inci_name}</div>
                                        <div className="flex flex-wrap gap-1 mt-1.5">
                                            {reasons.map(reason => (
                                                <span
                                                    key={reason}
                                                    className={`text-[10px] rounded-full px-2 py-0.5 border ${reason === 'In your stash'
                                                        ? 'bg-green-50 text-green-800 border-green-200 font-bold'
                                                        : 'bg-gray-50 text-gray-600 border-gray-200'}`}
                                                >
                                                    {reason}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => onPick({ ingredient, reasons })}
                                        aria-label={`Add ${ingredient.trade_name}`}
                                        className="shrink-0 px-3 py-1.5 bg-[#1f382a] text-white text-xs font-bold rounded hover:bg-[#2c4c3b] transition-colors"
                                    >
                                        Add
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-between items-center gap-3">
                    <button onClick={onBrowse} className="text-xs font-bold text-[#2c4c3b] hover:underline">Search the full library</button>
                    <button onClick={onClose} className="px-4 py-1.5 text-sm font-medium text-gray-600 rounded hover:bg-gray-100">Cancel</button>
                </div>
            </div>
        </div>
    );
}
