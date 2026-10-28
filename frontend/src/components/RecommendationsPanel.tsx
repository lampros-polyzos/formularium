import React from 'react';

export interface RecommendationItem {
    type: 'conflict' | 'synergy' | 'tip';
    title: string;
    message: string;
    action?: string;
}

interface RecommendationsPanelProps {
    recommendations?: RecommendationItem[];
}

const RecommendationsPanel: React.FC<RecommendationsPanelProps> = ({ recommendations = [] }) => {
    return (
        <div className="bg-white border border-[#c1d1b9] rounded-lg p-4 shadow-sm">
            <h3 className="text-sm font-bold uppercase tracking-wider text-[#1f382a] mb-3 flex items-center justify-between">
                <span>Ingredient Insights</span>
                <span className="text-xs font-normal text-gray-500">
                    {recommendations.length} {recommendations.length === 1 ? 'item' : 'items'}
                </span>
            </h3>

            {(!recommendations || recommendations.length === 0) ? (
                <p className="text-xs text-gray-400 italic py-2">
                    No formulation conflicts or synergies detected for the current ingredients.
                </p>
            ) : (
                <div className="space-y-3">
                    {recommendations.map((rec, idx) => {
                        const borderColors = {
                            conflict: 'border-amber-300 bg-amber-50 text-amber-900',
                            synergy: 'border-emerald-300 bg-emerald-50 text-emerald-900',
                            tip: 'border-blue-300 bg-blue-50 text-blue-900',
                        };

                        const badgeColors = {
                            conflict: 'bg-amber-200 text-amber-800',
                            synergy: 'bg-emerald-200 text-emerald-800',
                            tip: 'bg-blue-200 text-blue-800',
                        };

                        const badgeText = {
                            conflict: 'Conflict',
                            synergy: 'Synergy',
                            tip: 'Formulation Tip',
                        };

                        return (
                            <div
                                key={idx}
                                className={`p-3 rounded-md border text-xs ${borderColors[rec.type] || 'border-gray-200 bg-gray-50'}`}
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <span className="font-semibold text-sm">{rec.title}</span>
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${badgeColors[rec.type]}`}>
                                        {badgeText[rec.type] || rec.type}
                                    </span>
                                </div>
                                <p className="text-gray-700 mt-1 leading-relaxed">{rec.message}</p>
                                {rec.action && (
                                    <div className="mt-2 pt-2 border-t border-black/10 font-medium">
                                        <span className="text-gray-500 font-normal">Action: </span>
                                        {rec.action}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default RecommendationsPanel;