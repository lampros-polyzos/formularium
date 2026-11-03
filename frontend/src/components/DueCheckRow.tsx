import { useState } from 'react';
import { Link } from 'react-router-dom';
import CheckInForm from './CheckInForm';
import { completeCheck, type CheckInInput } from '../lib/batches';
import { checkState, describeDue } from '../lib/batchPlan';
import { notifyBatchesChanged } from '../hooks/useDueChecks';
import type { Batch, BatchCheck, CheckResult } from '../types/batches';

interface DueCheckRowProps {
    batch: Pick<Batch, 'id' | 'name' | 'lot_number' | 'target_ph'>;
    check: Pick<BatchCheck, 'id' | 'label' | 'due_on'> & Partial<BatchCheck>;
    /** Called after the answer is saved. */
    onAnswered?: () => void | Promise<void>;
}

const GOOD: CheckInInput = { result: 'good', observations: [], measured_ph: null, notes: '' };

/**
 * One check-in that is due, answerable on the spot. "Looks good" is a single tap and is saved straight away;
 * anything else opens the details so what was noticed is recorded too.
 */
export default function DueCheckRow({ batch, check, onAnswered }: DueCheckRowProps) {
    const [details, setDetails] = useState<CheckResult | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');

    const save = async (input: CheckInInput) => {
        await completeCheck(check.id, input);
        notifyBatchesChanged();
        await onAnswered?.();
    };

    const looksGood = async () => {
        setIsSaving(true);
        setError('');
        try {
            await save(GOOD);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not save the check-in.');
            setIsSaving(false);
        }
    };

    const state = checkState({ due_on: check.due_on, checked_at: null });
    const button = 'px-3 py-1.5 rounded-full border text-sm font-medium bg-white disabled:opacity-50 transition-colors';

    return (
        <li className="py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Link to={`/batches/${batch.id}`} className="text-sm text-gray-800 hover:underline">
                    <strong>{batch.name}</strong> <span className="text-gray-500">({batch.lot_number})</span> · {check.label} check
                </Link>
                <span className={`text-xs font-bold ${state === 'overdue' ? 'text-red-700' : 'text-amber-800'}`}>{describeDue(check.due_on)}</span>
            </div>

            {details === null ? (
                <div className="flex flex-wrap items-center gap-2 mt-2">
                    <span className="text-sm font-medium text-[#1f382a]">How does it look?</span>
                    <button type="button" onClick={looksGood} disabled={isSaving} className={`${button} border-green-300 text-green-800 hover:bg-green-50`}>
                        {isSaving ? 'Saving...' : 'Looks good'}
                    </button>
                    <button type="button" onClick={() => setDetails('minor')} disabled={isSaving} className={`${button} border-amber-300 text-amber-800 hover:bg-amber-50`}>
                        Something's changed
                    </button>
                    <button type="button" onClick={() => setDetails('failed')} disabled={isSaving} className={`${button} border-red-300 text-red-700 hover:bg-red-50`}>
                        A problem
                    </button>
                </div>
            ) : (
                <CheckInForm
                    check={{ batch_id: batch.id, observations: [], measured_ph: null, notes: null, checked_at: null, ...check, result: details }}
                    targetPh={batch.target_ph}
                    onSave={save}
                    onCancel={() => setDetails(null)}
                />
            )}

            {error && <p role="alert" className="text-sm text-red-700 mt-2">{error}</p>}
        </li>
    );
}
