import { useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { OBSERVATIONS, RESULT_LABELS, type BatchCheck, type CheckResult } from '../types/batches';
import type { CheckInInput } from '../lib/batches';

interface CheckInFormProps {
    check: BatchCheck;
    /** Shown as a hint: the pH this batch was aiming for. */
    targetPh: number | null;
    onSave: (input: CheckInInput) => Promise<void>;
    onCancel: () => void;
}

const RESULT_STYLE: Record<CheckResult, string> = {
    good: 'peer-checked:bg-green-600 peer-checked:text-white peer-checked:border-green-600',
    minor: 'peer-checked:bg-amber-500 peer-checked:text-white peer-checked:border-amber-500',
    failed: 'peer-checked:bg-red-600 peer-checked:text-white peer-checked:border-red-600',
};

export default function CheckInForm({ check, targetPh, onSave, onCancel }: CheckInFormProps) {
    const [result, setResult] = useState<CheckResult | null>(check.result);
    const [observations, setObservations] = useState<string[]>(check.observations ?? []);
    const [ph, setPh] = useState(check.measured_ph !== null ? String(check.measured_ph) : '');
    const [notes, setNotes] = useState(check.notes ?? '');
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');

    const critical = OBSERVATIONS.filter(o => o.critical && observations.includes(o.id));

    const toggle = (id: string) => setObservations(prev => (prev.includes(id) ? prev.filter(o => o !== id) : [...prev, id]));

    const save = async () => {
        if (!result) return;
        setIsSaving(true);
        setError('');
        try {
            await onSave({
                // Mold or a skin reaction can't be a "good" check, whatever was ticked
                result: critical.length > 0 ? 'failed' : result,
                observations,
                measured_ph: ph.trim() === '' ? null : Number(ph),
                notes,
            });
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not save the check-in.');
            setIsSaving(false);
        }
    };

    return (
        <form onSubmit={(e) => { e.preventDefault(); void save(); }} className="mt-3 bg-[#f7f8f6] border border-gray-200 rounded-xl p-4 space-y-4">
            <fieldset>
                <legend className="text-sm font-bold text-[#1f382a] mb-2">How does it look?</legend>
                <div className="flex flex-wrap gap-2">
                    {(Object.keys(RESULT_LABELS) as CheckResult[]).map(r => (
                        <label key={r} className="cursor-pointer">
                            <input type="radio" name={`result-${check.id}`} value={r} checked={result === r} onChange={() => setResult(r)} className="peer sr-only" />
                            <span className={`inline-block px-4 py-1.5 rounded-full border border-gray-300 bg-white text-sm font-medium text-gray-700 peer-focus-visible:ring-2 peer-focus-visible:ring-[#2c4c3b] ${RESULT_STYLE[r]}`}>
                                {RESULT_LABELS[r]}
                            </span>
                        </label>
                    ))}
                </div>
            </fieldset>

            <fieldset>
                <legend className="text-sm font-medium text-gray-700 mb-1.5">Anything you noticed?</legend>
                <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1">
                    {OBSERVATIONS.map(o => (
                        <label key={o.id} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                            <input type="checkbox" checked={observations.includes(o.id)} onChange={() => toggle(o.id)} className="w-4 h-4 accent-[#2c4c3b]" />
                            {o.label}
                        </label>
                    ))}
                </div>
            </fieldset>

            {critical.length > 0 && (
                <p role="alert" className="flex gap-2 text-sm bg-red-50 border border-red-200 text-red-800 rounded-lg px-3 py-2.5">
                    <TriangleAlert size={16} className="shrink-0 mt-0.5" aria-hidden />
                    <span><strong>Stop using this batch.</strong> {critical.map(c => c.label.toLowerCase()).join(' and ')} means it is not safe. Throw it away, then review the preservative and your hygiene before the next one.</span>
                </p>
            )}

            <div className="grid sm:grid-cols-2 gap-4">
                <label className="text-sm font-medium text-gray-700">
                    Measured pH (optional)
                    <input
                        type="number" step="any" min="0" max="14" value={ph} onChange={(e) => setPh(e.target.value)}
                        placeholder={targetPh !== null ? `aimed for ${targetPh}` : ''}
                        className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#2c4c3b]"
                    />
                </label>
                <label className="text-sm font-medium text-gray-700">
                    Notes (optional)
                    <input
                        type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="texture, smell, how it felt..."
                        className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#2c4c3b]"
                    />
                </label>
            </div>

            {error && <p role="alert" className="text-sm text-red-700">{error}</p>}

            <div className="flex justify-end gap-2">
                <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-600 rounded hover:bg-gray-100">Cancel</button>
                <button
                    type="submit" disabled={!result || isSaving}
                    className="px-5 py-2 bg-[#1f382a] text-white text-sm font-bold rounded hover:bg-[#2c4c3b] disabled:opacity-50 transition-colors"
                >
                    {isSaving ? 'Saving...' : 'Save check-in'}
                </button>
            </div>
        </form>
    );
}
