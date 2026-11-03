import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BellRing, FlaskConical } from 'lucide-react';
import Header from '../components/Header';
import { usePageTitle } from '../components/content/usePageTitle';
import { listBatches, type BatchListItem } from '../lib/batches';
import { checkProgress, checkState, describeDue } from '../lib/batchPlan';
import { formatMoney } from '../lib/batchCost';
import { useSettings } from '../contexts/SettingsContext';
import { STATUS_LABEL } from '../types/batches';

type Tab = 'active' | 'closed' | 'all';

const DOT_STYLE = {
    good: 'bg-green-500 border-green-500',
    minor: 'bg-amber-400 border-amber-400',
    failed: 'bg-red-500 border-red-500',
    overdue: 'bg-white border-red-500',
    due: 'bg-white border-amber-500',
    upcoming: 'bg-white border-gray-300',
} as const;

export default function BatchesPage() {
    usePageTitle('Batches');
    const { formatDate, currency } = useSettings();
    const [batches, setBatches] = useState<BatchListItem[] | null>(null);
    const [error, setError] = useState('');
    const [tab, setTab] = useState<Tab>('active');

    useEffect(() => {
        let cancelled = false;
        listBatches()
            .then(data => { if (!cancelled) setBatches(data); })
            .catch(e => { if (!cancelled) { setError(e instanceof Error ? e.message : 'Could not load your batches.'); setBatches([]); } });
        return () => { cancelled = true; };
    }, []);

    const due = useMemo(() => (batches ?? [])
        .filter(b => b.status === 'active')
        .flatMap(b => b.batch_checks.map(c => ({ batch: b, check: c })))
        .filter(({ check }) => ['due', 'overdue'].includes(checkState(check)))
        .sort((a, b) => a.check.due_on.localeCompare(b.check.due_on)), [batches]);

    const shown = (batches ?? []).filter(b =>
        tab === 'all' ? true : tab === 'active' ? b.status === 'active' : b.status !== 'active');

    const counts = {
        active: (batches ?? []).filter(b => b.status === 'active').length,
        closed: (batches ?? []).filter(b => b.status !== 'active').length,
        all: (batches ?? []).length,
    };

    return (
        <div className="min-h-screen bg-[#f7f8f6] text-gray-900 font-sans">
            <Header title="Batches" />

            <main className="max-w-5xl mx-auto px-6 py-10">
                <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-[#1f382a]">Your batches</h1>
                        <p className="text-gray-600 mt-1">Everything you've made, and how it's holding up.</p>
                    </div>
                    <Link to="/studio" className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#2c4c3b] text-white text-sm font-bold rounded-full hover:bg-[#1f382a] transition-colors">
                        Make a batch from a formula <ArrowRight size={16} aria-hidden />
                    </Link>
                </div>

                {error && <p role="alert" className="mb-6 text-sm bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3">{error}</p>}

                {due.length > 0 && (
                    <section aria-labelledby="due-title" className="mb-8 bg-amber-50 border border-amber-200 rounded-2xl p-5">
                        <h2 id="due-title" className="flex items-center gap-2 font-bold text-amber-900 mb-3">
                            <BellRing size={18} aria-hidden /> Check-ins due ({due.length})
                        </h2>
                        <ul className="divide-y divide-amber-100">
                            {due.map(({ batch, check }) => (
                                <li key={check.id}>
                                    <Link to={`/batches/${batch.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5 hover:bg-amber-100/60 -mx-2 px-2 rounded">
                                        <span className="text-sm text-gray-800">
                                            <strong>{batch.name}</strong> <span className="text-gray-500">({batch.lot_number})</span> · {check.label} check
                                        </span>
                                        <span className={`text-xs font-bold ${checkState(check) === 'overdue' ? 'text-red-700' : 'text-amber-800'}`}>{describeDue(check.due_on)}</span>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </section>
                )}

                <div role="tablist" aria-label="Batch filter" className="flex gap-2 mb-6">
                    {([['active', 'In progress'], ['closed', 'Closed'], ['all', 'All']] as const).map(([id, label]) => (
                        <button
                            key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
                            className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${tab === id
                                ? 'bg-[#2c4c3b] text-white border-[#2c4c3b]'
                                : 'bg-white text-[#2c4c3b] border-[#c1d1b9] hover:bg-[#e9eee7]'}`}
                        >
                            {label} <span className="opacity-60">({counts[id]})</span>
                        </button>
                    ))}
                </div>

                {batches === null ? (
                    <p className="text-gray-500 py-10 text-center">Loading your batches...</p>
                ) : shown.length === 0 ? (
                    <div className="text-center py-16 bg-white border border-dashed border-[#c1d1b9] rounded-2xl">
                        <FlaskConical size={36} className="mx-auto text-[#8ca89b] mb-3" aria-hidden />
                        <h2 className="text-lg font-bold text-[#1f382a] mb-1">
                            {counts.all === 0 ? 'No batches yet' : 'Nothing here'}
                        </h2>
                        <p className="text-sm text-gray-600 max-w-md mx-auto">
                            {counts.all === 0
                                ? 'Open a formula in the Studio and choose Make batch. You can log it, take the amounts from your stash, and check back on how it ages.'
                                : 'No batches match this filter.'}
                        </p>
                    </div>
                ) : (
                    <ul className="space-y-3">
                        {shown.map(batch => {
                            const progress = checkProgress(batch.batch_checks);
                            const status = STATUS_LABEL[batch.status];
                            const checks = [...batch.batch_checks].sort((a, b) => a.due_on.localeCompare(b.due_on));
                            return (
                                <li key={batch.id}>
                                    <Link to={`/batches/${batch.id}`} className="block bg-white border border-[#c1d1b9] rounded-2xl p-5 hover:shadow-md transition-shadow">
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div>
                                                <h3 className="font-bold text-lg text-[#1f382a]">{batch.name}</h3>
                                                <p className="text-xs text-gray-500 mt-0.5">
                                                    Lot {batch.lot_number} · {formatDate(batch.made_on)} · {Number(batch.batch_size_g)} g
                                                    {batch.container_name && ` · fills ${Number(Number(batch.container_count ?? 0).toFixed(2))} × ${batch.container_name}`}
                                                    {batch.measured_ph !== null && batch.measured_ph !== undefined && ` · pH ${Number(batch.measured_ph)}`}
                                                    {batch.ingredient_cost !== null && batch.ingredient_cost !== undefined && ` · ${formatMoney(Number(batch.ingredient_cost), currency)}`}
                                                    {batch.stash_deducted && batch.status !== 'voided' ? ' · used stash' : ''}
                                                </p>
                                            </div>
                                            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-sm border ${status.style}`}>{status.text}</span>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-3 mt-4 text-xs text-gray-600">
                                            <span className="flex items-center gap-1.5" aria-hidden>
                                                {checks.map(c => {
                                                    const state = checkState(c);
                                                    const style = state === 'done' ? DOT_STYLE[c.result ?? 'good'] : DOT_STYLE[state];
                                                    return <span key={c.id} className={`w-3 h-3 rounded-full border-2 ${style}`} />;
                                                })}
                                            </span>
                                            <span>
                                                {progress.done} of {progress.total} check-ins done
                                                {progress.worst === 'failed' && <strong className="text-red-700"> · a check failed</strong>}
                                                {progress.worst === 'minor' && <span className="text-amber-700"> · minor changes noted</span>}
                                                {progress.worst === 'good' && <span className="text-green-700"> · all good so far</span>}
                                            </span>
                                        </div>
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </main>
        </div>
    );
}
