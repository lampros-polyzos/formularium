import { useState } from 'react';
import { reportContent } from '../lib/communityApi';
import { REPORT_DETAILS_MAX, REPORT_REASONS, communityErrorMessage } from '../lib/communityLimits';

interface ReportModalProps {
    targetType: 'post' | 'comment';
    targetId: string;
    onClose: () => void;
    /** Called once the report has been sent. */
    onSent: () => void;
}

export default function ReportModal({ targetType, targetId, onClose, onSent }: ReportModalProps) {
    const [reason, setReason] = useState('');
    const [details, setDetails] = useState('');
    const [sending, setSending] = useState(false);
    const [error, setError] = useState('');

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!reason) return setError('Please choose a reason.');
        setSending(true);
        setError('');
        try {
            await reportContent({ targetType, targetId, reason, details });
            onSent();
        } catch (err) {
            setError(communityErrorMessage(err));
            setSending(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1f382a]/40 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="report-title">
            <form onSubmit={submit} className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-[#c1d1b9] overflow-hidden">
                <div className="bg-[#e9eee7] px-6 py-4 border-b border-[#c1d1b9]">
                    <h3 id="report-title" className="text-lg font-bold text-[#1f382a]">Report this {targetType}</h3>
                    <p className="text-xs text-gray-600 mt-1">A moderator will take a look. The person who wrote it is not told who reported it.</p>
                </div>
                <div className="p-6 space-y-4">
                    {error && <div role="alert" className="p-3 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm font-medium">{error}</div>}
                    <fieldset className="space-y-2">
                        <legend className="text-sm font-bold text-gray-700 mb-1">What is wrong with it?</legend>
                        {REPORT_REASONS.map(r => (
                            <label key={r.id} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                                <input type="radio" name="report-reason" value={r.id} checked={reason === r.id} onChange={() => setReason(r.id)} />
                                {r.label}
                            </label>
                        ))}
                    </fieldset>
                    <div>
                        <label htmlFor="report-details" className="block text-sm font-bold text-gray-700 mb-1">More detail (optional)</label>
                        <textarea
                            id="report-details"
                            value={details}
                            maxLength={REPORT_DETAILS_MAX}
                            onChange={(e) => setDetails(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2c4c3b] outline-none text-sm min-h-[80px] resize-y"
                        />
                        <div className="text-[11px] text-gray-400 text-right">{details.length}/{REPORT_DETAILS_MAX}</div>
                    </div>
                </div>
                <div className="bg-gray-50 px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
                    <button type="button" onClick={onClose} className="px-5 py-2.5 text-sm font-bold text-gray-600 hover:text-gray-900">Cancel</button>
                    <button type="submit" disabled={sending} className="px-6 py-2.5 bg-[#2c4c3b] text-white text-sm font-bold rounded-lg hover:bg-[#1f382a] disabled:opacity-50">
                        {sending ? 'Sending...' : 'Send report'}
                    </button>
                </div>
            </form>
        </div>
    );
}
