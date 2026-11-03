import { useState } from 'react';
import { History, X } from 'lucide-react';

interface SaveVersionModalProps {
    formulaName: string;
    /** Keeps the version. Rejects with a readable message when it could not be kept. */
    onSave: (note: string) => Promise<void>;
    onClose: () => void;
}

/** Asks for the note that goes with a saved version: what changed and why. The note is optional, but it is the point. */
export default function SaveVersionModal({ formulaName, onSave, onClose }: SaveVersionModalProps) {
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const submit = async () => {
        setBusy(true);
        setError('');
        try {
            await onSave(note);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Something went wrong.');
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1f382a]/40 backdrop-blur-sm" onKeyDown={e => { if (e.key === 'Escape' && !busy) onClose(); }}>
            <div role="dialog" aria-modal="true" aria-labelledby="save-version-title" className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-[#c1d1b9] overflow-hidden">
                <div className="bg-[#e9eee7] px-6 py-4 border-b border-[#c1d1b9] flex justify-between items-center">
                    <h3 id="save-version-title" className="text-lg font-bold text-[#1f382a] flex items-center gap-2"><History size={18} aria-hidden /> Save a version</h3>
                    <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="text-gray-500 hover:text-gray-800"><X size={20} aria-hidden /></button>
                </div>
                <div className="p-6">
                    <p className="text-sm text-gray-600 mb-4">
                        Keeps a copy of <span className="font-bold">{formulaName}</span> exactly as it is now, so you can compare it with later changes or go back to it.
                    </p>
                    <label htmlFor="version-note" className="block text-sm font-medium text-gray-700 mb-1">What did you change, and why?</label>
                    <textarea
                        id="version-note"
                        autoFocus
                        rows={4}
                        value={note}
                        onChange={e => setNote(e.target.value)}
                        placeholder="e.g. Cut the shea to 4% because the last batch felt greasy"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#2c4c3b] outline-none text-sm"
                    />
                    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
                </div>
                <div className="bg-gray-50 px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
                    <button type="button" onClick={onClose} disabled={busy} className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-bold text-gray-700 hover:bg-gray-100 disabled:opacity-50">Cancel</button>
                    <button type="button" onClick={submit} disabled={busy} className="px-5 py-2 rounded-lg bg-[#2c4c3b] text-white text-sm font-bold hover:bg-[#1f382a] disabled:opacity-50">
                        {busy ? 'Saving…' : 'Save version'}
                    </button>
                </div>
            </div>
        </div>
    );
}
