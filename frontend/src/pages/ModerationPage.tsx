import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Header from '../components/Header';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { useDialog } from '../hooks/useDialog';
import { useIsModerator } from '../hooks/useIsModerator';
import { listOpenReports, resolveReport, type Report } from '../lib/communityApi';
import { REPORT_REASONS, communityErrorMessage } from '../lib/communityLimits';

/** Open reports for community moderators: read what was reported, then remove it or dismiss the report. */
export default function ModerationPage() {
    const { user } = useAuth();
    const { formatDate } = useSettings();
    const { alert, confirm } = useDialog();
    const isModerator = useIsModerator();
    const [reports, setReports] = useState<Report[] | null>(null);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!isModerator) return;
        let live = true;
        listOpenReports()
            .then(rows => { if (live) setReports(rows); })
            .catch(err => { if (live) { setError(communityErrorMessage(err)); setReports([]); } });
        return () => { live = false; };
    }, [isModerator]);

    const reasonLabel = (id: string) => REPORT_REASONS.find(r => r.id === id)?.label ?? id;

    const act = async (report: Report, remove: boolean) => {
        if (!user) return;
        if (remove && !(await confirm(`Remove this ${report.target_type}? This cannot be undone.`, { title: `Remove this ${report.target_type}?`, confirmLabel: 'Remove', tone: 'danger' }))) return;
        try {
            await resolveReport(report, remove ? 'resolved' : 'dismissed', user.id, remove);
            setReports(prev => (prev ?? []).filter(r => r.id !== report.id));
        } catch (err) {
            void alert(communityErrorMessage(err), { tone: 'error', title: "Couldn't update the report" });
        }
    };

    return (
        <div className="min-h-screen bg-[#f7f8f6]">
            <Header title="Moderation" backPath="/community" backLabel="Back to Hub" />
            <main className="max-w-3xl mx-auto p-6 md:p-10 space-y-4">
                <h1 className="text-2xl font-bold text-[#1f382a]">Reports to review</h1>
                {!isModerator ? (
                    <p className="text-gray-600">This page is for community moderators.</p>
                ) : reports === null ? (
                    <p className="text-gray-500">Loading...</p>
                ) : (
                    <>
                        {error && <p role="alert" className="text-red-700 text-sm">{error}</p>}
                        {reports.length === 0 && !error && <p className="text-gray-600">Nothing to review right now.</p>}
                        {reports.map(report => (
                            <article key={report.id} className="bg-white rounded-xl border border-[#c1d1b9] p-5 space-y-3">
                                <div className="flex flex-wrap items-center gap-2 text-xs">
                                    <span className="font-bold uppercase px-2 py-0.5 rounded-sm bg-[#e9eee7] text-[#2c4c3b] border border-[#c1d1b9]">{report.target_type}</span>
                                    <span className="font-semibold text-gray-700">{reasonLabel(report.reason)}</span>
                                    <span className="text-gray-400">{formatDate(report.created_at)}</span>
                                </div>
                                {report.snapshot && <blockquote className="text-sm text-gray-700 whitespace-pre-wrap border-l-4 border-[#c1d1b9] pl-3">{report.snapshot}</blockquote>}
                                {report.details && <p className="text-sm text-gray-600"><span className="font-semibold">Reporter says:</span> {report.details}</p>}
                                <div className="flex flex-wrap items-center gap-3">
                                    {report.post_id && <Link to={`/community/${report.post_id}`} className="text-sm font-semibold text-[#2c4c3b] underline">Open post</Link>}
                                    <button onClick={() => act(report, true)} className="px-3 py-1.5 text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded hover:bg-red-100">Remove content</button>
                                    <button onClick={() => act(report, false)} className="px-3 py-1.5 text-xs font-bold text-gray-700 bg-gray-50 border border-gray-200 rounded hover:bg-gray-100">Dismiss</button>
                                </div>
                            </article>
                        ))}
                    </>
                )}
            </main>
        </div>
    );
}
