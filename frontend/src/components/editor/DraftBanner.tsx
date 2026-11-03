import type { FormulaDraft } from '../../lib/draftStore';

interface DraftBannerProps {
    draft: FormulaDraft;
    onRestore: () => void;
    onDiscard: () => void;
}

/** Offers to bring back unsaved changes found in this browser. */
export default function DraftBanner({ draft, onRestore, onDiscard }: DraftBannerProps) {
    return (
            <div role="alert" className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm flex flex-wrap items-center justify-between gap-3">
                <span className="text-amber-900">
                    We found unsaved changes from <strong>{new Date(draft.savedAt).toLocaleString()}</strong>
                    {' '}({draft.ingredients.length} ingredient{draft.ingredients.length !== 1 && 's'}).
                </span>
                <span className="flex gap-2">
                    <button onClick={onRestore} className="px-3 py-1 bg-[#1f382a] text-white rounded text-xs font-bold hover:bg-[#2c4c3b]">Restore</button>
                    <button onClick={onDiscard} className="px-3 py-1 bg-white border border-amber-300 rounded text-xs font-bold text-amber-900 hover:bg-amber-100">Discard</button>
                </span>
            </div>
    );
}
