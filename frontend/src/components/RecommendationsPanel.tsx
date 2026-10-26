type Recommendation = {
    type: 'conflict' | 'synergy' | 'tip';
    title: string;
    message: string;
    action?: string;
};

interface RecommendationsPanelProps {
    recommendations: Recommendation[];
}

export default function RecommendationsPanel({ recommendations }: RecommendationsPanelProps) {
    if (!recommendations || recommendations.length === 0) return null;

    const getTypeStyles = (type: string) => {
        switch (type) {
            case 'conflict': return { icon: '⚡', bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-800' };
            case 'synergy': return { icon: '✨', bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-800' };
            case 'tip': return { icon: '💡', bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-800' };
            default: return { icon: '📌', bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-800' };
        }
    };

    return (
        <div className="w-full lg:w-80 flex flex-col gap-3 mt-6">
            <h3 className="font-semibold text-[#1f382a] text-sm uppercase tracking-wider">Formulation Insights</h3>

            <div className="space-y-3">
                {recommendations.map((rec, index) => {
                    const styles = getTypeStyles(rec.type);

                    return (
                        <div key={index} className={`p-4 rounded-lg border ${styles.bg} ${styles.border}`}>
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-lg leading-none">{styles.icon}</span>
                                <h4 className={`font-semibold text-sm ${styles.text}`}>{rec.title}</h4>
                            </div>

                            <p className="text-sm text-gray-700 leading-relaxed mb-2">
                                {rec.message}
                            </p>

                            {rec.action && (
                                <div className="mt-2 pt-2 border-t border-black/5">
                                    <span className="text-xs font-bold uppercase text-gray-500 mr-2">Action</span>
                                    <span className="text-sm text-gray-800 font-medium">{rec.action}</span>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}