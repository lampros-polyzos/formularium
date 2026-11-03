import { Trash2, X } from 'lucide-react';

interface DeleteBatchModalProps {
    batchName: string;
    /** Grams the batch took from the stash. */
    stashG: number;
    busy?: boolean;
    /** `restoreStash`: put what it took back into the stash as part of deleting. */
    onDelete: (restoreStash: boolean) => void;
    onClose: () => void;
}

const grams = (v: number) => `${Number(v.toFixed(2))} g`;

/**
 * Deleting a batch that took ingredients from the stash has two sensible meanings: it was never really made (so the
 * stash should come back), or it was made and is only being tidied away (so the stash stays used up). This asks which.
 */
export default function DeleteBatchModal({ batchName, stashG, busy = false, onDelete, onClose }: DeleteBatchModalProps) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1f382a]/40 backdrop-blur-sm" onKeyDown={e => { if (e.key === 'Escape' && !busy) onClose(); }}>
            <div role="dialog" aria-modal="true" aria-labelledby="delete-batch-title" className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-[#c1d1b9] overflow-hidden">
                <div className="bg-[#e9eee7] px-6 py-4 border-b border-[#c1d1b9] flex justify-between items-center">
                    <h3 id="delete-batch-title" className="text-lg font-bold text-[#1f382a] flex items-center gap-2"><Trash2 size={18} aria-hidden /> Delete this batch?</h3>
                    <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="text-gray-500 hover:text-gray-800"><X size={20} aria-hidden /></button>
                </div>
                <div className="p-6 text-sm text-gray-700 space-y-3">
                    <p><span className="font-bold">{batchName}</span> disappears from your history and from your metrics, along with its check-ins. This cannot be undone.</p>
                    <p>It took <span className="font-bold">{grams(stashG)}</span> from your stash. What should happen to that?</p>
                </div>
                <div className="bg-gray-50 px-6 py-4 border-t border-gray-100 flex flex-col gap-2">
                    <button type="button" onClick={() => onDelete(true)} disabled={busy} className="px-4 py-2.5 rounded-lg bg-red-700 text-white text-sm font-bold hover:bg-red-800 disabled:opacity-50">
                        Delete and put {grams(stashG)} back in my stash
                    </button>
                    <button type="button" onClick={() => onDelete(false)} disabled={busy} className="px-4 py-2.5 rounded-lg border border-red-300 text-red-700 text-sm font-bold hover:bg-red-50 disabled:opacity-50">
                        Delete, but leave my stash as it is
                    </button>
                    <button type="button" onClick={onClose} disabled={busy} className="px-4 py-2.5 rounded-lg border border-gray-300 text-sm font-bold text-gray-700 hover:bg-gray-100 disabled:opacity-50">
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
}
