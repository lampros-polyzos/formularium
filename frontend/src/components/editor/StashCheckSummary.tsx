import { useNavigate } from 'react-router-dom';

interface StashCheckSummaryProps {
    targetWeight: number;
    isStashEmpty: boolean;
    isHidden: boolean;
    missingCount: number;
    lowCount: number;
    isSaving: boolean;
    onToggleHidden: (hidden: boolean) => void;
    onPrintSourcing: () => void;
}

/** One line under the search bar saying whether the stash covers this batch. */
export default function StashCheckSummary({
    targetWeight, isStashEmpty, isHidden, missingCount, lowCount, isSaving, onToggleHidden, onPrintSourcing,
}: StashCheckSummaryProps) {
    const navigate = useNavigate();

    if (isStashEmpty) {
        return (
            <div data-tour="sourcing" className="bg-white border border-dashed border-[#c1d1b9] rounded-lg px-4 py-3 text-sm text-gray-600">
                🧺 Add what you own on the <button onClick={() => navigate('/stash')} className="font-semibold text-[#2c4c3b] hover:underline">Stash page</button> to see what you're missing and get substitutions from your own shelf.
            </div>
        );
    }
    if (isHidden) {
        return (
            <button onClick={() => onToggleHidden(false)} className="self-start text-xs font-medium text-[#2c4c3b] hover:underline">
                🧺 Show stash check
            </button>
        );
    }
    if (missingCount + lowCount > 0) {
        return (
            <div data-tour="sourcing" className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm flex flex-wrap items-center justify-between gap-3">
                <span className="text-amber-900">
                    🧺 For a {targetWeight || 100} g batch you're missing <strong>{missingCount}</strong> ingredient{missingCount !== 1 && 's'}
                    {lowCount > 0 && <> and are low on <strong>{lowCount}</strong></>}. Swap suggestions are shown under each one.
                </span>
                <span className="flex gap-2">
                    <button
                        onClick={onPrintSourcing}
                        disabled={isSaving}
                        className="px-3 py-1 bg-white border border-amber-300 rounded text-xs font-bold text-amber-900 hover:bg-amber-100 transition-colors disabled:opacity-50"
                    >
                        🖨️ Print sourcing guide
                    </button>
                    <button onClick={() => onToggleHidden(true)} className="px-2 text-xs text-amber-800 hover:underline">
                        Hide
                    </button>
                </span>
            </div>
        );
    }
    return (
        <div data-tour="sourcing" className="bg-[#e9eee7] border border-[#c1d1b9] rounded-lg px-4 py-2 text-sm text-[#1f382a] flex justify-between items-center gap-3">
            <span>✅ You have everything in your stash for a {targetWeight || 100} g batch.</span>
            <button onClick={() => onToggleHidden(true)} className="text-xs text-gray-500 hover:underline">Hide</button>
        </div>
    );
}
