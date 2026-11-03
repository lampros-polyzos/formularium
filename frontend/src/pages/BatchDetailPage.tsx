import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarPlus, Check, Plus, Printer, RotateCcw, TriangleAlert } from 'lucide-react';
import StudioLayout from '../components/StudioLayout';
import CheckInForm from '../components/CheckInForm';
import ObservationHelp from '../components/ObservationHelp';
import { buildCheckCalendar, calendarFilename } from '../lib/checkCalendar';
import { downloadTextFile } from '../lib/accountData';
import { usePageTitle } from '../components/content/usePageTitle';
import { addCheck, completeCheck, getBatch, isoDate, updateBatch, voidBatch, type BatchDetail, type CheckInInput } from '../lib/batches';
import { checkProgress, checkState, describeDue } from '../lib/batchPlan';
import { costPerContainer, formatMoney } from '../lib/batchCost';
import { downloadBatchRecord } from '../lib/batchRecord';
import { notifyBatchesChanged } from '../hooks/useDueChecks';
import { useSettings } from '../contexts/SettingsContext';
import { OBSERVATION_LABELS, RESULT_LABELS, STATUS_LABEL, type BatchCheck, type BatchStatus } from '../types/batches';

const RESULT_CHIP = {
    good: 'bg-green-50 text-green-800 border-green-200',
    minor: 'bg-amber-50 text-amber-800 border-amber-200',
    failed: 'bg-red-50 text-red-700 border-red-200',
} as const;

const grams = (v: number) => `${Number(Number(v).toFixed(2))} g`;

export default function BatchDetailPage() {
    const { id } = useParams();
    const { formatDate, currency } = useSettings();
    const [detail, setDetail] = useState<BatchDetail | null>(null);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [busy, setBusy] = useState(false);
    const [isPrinting, setIsPrinting] = useState(false);
    const [openCheck, setOpenCheck] = useState<string | null>(null);

    // Measurements
    const [ph, setPh] = useState('');
    const [finalWeight, setFinalWeight] = useState('');
    const [notes, setNotes] = useState('');

    // A check-in of your own
    const [customLabel, setCustomLabel] = useState('');
    const [customDate, setCustomDate] = useState(isoDate());

    usePageTitle(detail ? `${detail.batch.name} (${detail.batch.lot_number})` : 'Batch');

    const show = useCallback((data: BatchDetail) => {
        setDetail(data);
        setPh(data.batch.measured_ph !== null ? String(data.batch.measured_ph) : '');
        setFinalWeight(data.batch.final_weight_g !== null ? String(data.batch.final_weight_g) : '');
        setNotes(data.batch.notes ?? '');
        setError('');
    }, []);

    // Loads the batch when the page opens
    useEffect(() => {
        if (!id) return;
        let cancelled = false;
        getBatch(id)
            .then(data => { if (!cancelled) show(data); })
            .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load this batch.'); });
        return () => { cancelled = true; };
    }, [id, show]);

    // Reloads after a change
    const load = useCallback(async () => {
        if (!id) return;
        try {
            show(await getBatch(id));
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not load this batch.');
        }
    }, [id, show]);

    // Runs a change, then reloads; shows what went wrong without losing the page
    const run = async (work: () => Promise<void>, success?: string) => {
        setBusy(true);
        setNotice('');
        setError('');
        try {
            await work();
            await load();
            notifyBatchesChanged();
            if (success) setNotice(success);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Something went wrong.');
        } finally {
            setBusy(false);
        }
    };

    if (error && !detail) {
        return (
            <StudioLayout active="batches" title="Batch">
                <main className="max-w-xl mx-auto px-6 py-20 text-center">
                    <p role="alert" className="text-red-700 mb-6">{error}</p>
                    <Link to="/batches" className="font-bold text-[#2c4c3b] hover:underline">Back to your batches</Link>
                </main>
            </StudioLayout>
        );
    }
    if (!detail) {
        return (
            <StudioLayout active="batches" title="Batch">
                <p className="text-center text-gray-500 py-20">Loading...</p>
            </StudioLayout>
        );
    }

    const { batch, lines, usage, checks } = detail;
    const status = STATUS_LABEL[batch.status];
    const progress = checkProgress(checks);
    const isActive = batch.status === 'active';
    const stashTaken = usage.reduce((sum, u) => sum + Number(u.grams), 0);
    // Follows what is typed, so the yield is visible before saving
    const typedWeight = parseFloat(finalWeight);
    const yieldPct = typedWeight > 0 ? (typedWeight / Number(batch.batch_size_g)) * 100 : null;
    const unsafe = isActive && (progress.critical || progress.worst === 'failed');

    const lineCosts = lines.map(line => (line.cost === null || line.cost === undefined ? null : Number(line.cost)));
    const totalCost = batch.ingredient_cost === null || batch.ingredient_cost === undefined ? null : Number(batch.ingredient_cost);
    const anyEstimated = lines.some(line => line.cost_estimated);
    const perContainer = costPerContainer(totalCost, Number(batch.container_count ?? 0), Number(batch.container_unit_price ?? 0));
    const unpriced = batch.unpriced_count ?? lineCosts.filter(c => c === null).length;

    // The printed quality record is built from what is stored, so it can be printed again any time
    const printRecord = async () => {
        setIsPrinting(true);
        setError('');
        try {
            await downloadBatchRecord(detail, currency);
        } catch (e) {
            console.error('Could not create the batch record:', e);
            setError("Couldn't create the record. Check that the app's server is running, then try again.");
        } finally {
            setIsPrinting(false);
        }
    };

    // Reminders outside the app: the check-ins still to do, as a file any calendar can import
    const calendar = isActive ? buildCheckCalendar(batch, checks, window.location.origin) : null;
    const addToCalendar = () => {
        if (calendar) downloadTextFile(calendarFilename(batch), calendar, 'text/calendar');
    };

    const setStatus = (next: BatchStatus, message: string) => run(() => updateBatch(batch.id, { status: next }), message);

    const confirmThen = (message: string, action: () => Promise<void>, success: string) => {
        if (window.confirm(message)) void run(action, success);
    };

    const saveMeasurements = () => run(() => updateBatch(batch.id, {
        measured_ph: ph.trim() === '' ? null : Number(ph),
        final_weight_g: finalWeight.trim() === '' ? null : Number(finalWeight),
        notes: notes.trim() || null,
    }), 'Saved.');

    const saveCheck = async (check: BatchCheck, input: CheckInInput) => {
        await completeCheck(check.id, input);
        // A failed check or a mold/skin-reaction note is exactly when the batch should stop being used
        setOpenCheck(null);
        await load();
        notifyBatchesChanged();
        setNotice(`${check.label} check-in saved.`);
    };

    return (
        <StudioLayout active="batches" title="Batch">
            <main className="max-w-4xl mx-auto px-6 py-8">
                <Link to="/batches" className="inline-flex items-center gap-1 text-sm font-medium text-[#3a5a4a] hover:text-[#1f382a] mb-4">
                    <ArrowLeft size={14} aria-hidden /> All batches
                </Link>

                <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
                    <div>
                        <div className="flex flex-wrap items-center gap-3">
                            <h1 className="text-3xl font-bold text-[#1f382a]">{batch.name}</h1>
                            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-sm border ${status.style}`}>{status.text}</span>
                        </div>
                        <p className="text-sm text-gray-600 mt-1">
                            Lot <strong>{batch.lot_number}</strong> · made {formatDate(batch.made_on)} · {grams(batch.batch_size_g)}
                            {batch.container_name && (
                                <> · fills {Number(Number(batch.container_count ?? 0).toFixed(2))} × {batch.container_name}</>
                            )}
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button
                            onClick={printRecord} disabled={isPrinting}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-[#c1d1b9] text-[#2c4c3b] text-sm font-bold rounded-full hover:bg-[#e9eee7] disabled:opacity-50"
                        >
                            <Printer size={14} aria-hidden /> {isPrinting ? 'Preparing...' : 'Print record'}
                        </button>
                        {batch.formulation_id && (
                            <Link to={`/studio/${batch.formulation_id}`} className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-[#c1d1b9] text-[#2c4c3b] text-sm font-bold rounded-full hover:bg-[#e9eee7]">
                                <RotateCcw size={14} aria-hidden /> Make it again
                            </Link>
                        )}
                    </div>
                </div>

                {notice && <p role="status" className="mb-4 text-sm bg-green-50 border border-green-200 text-green-800 rounded-lg px-4 py-2.5">{notice}</p>}
                {error && <p role="alert" className="mb-4 text-sm bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2.5">{error}</p>}

                {unsafe && (
                    <div role="alert" className="mb-6 bg-red-50 border border-red-200 rounded-2xl p-5">
                        <h2 className="flex items-center gap-2 font-bold text-red-800 mb-1"><TriangleAlert size={18} aria-hidden /> This batch may not be safe to use</h2>
                        <p className="text-sm text-red-800 mb-3">
                            {progress.critical ? 'You noted mold or a skin reaction.' : 'A stability check failed.'} Stop using it and throw it away. Then review the preservative, pH and hygiene before making it again.
                        </p>
                        <button
                            onClick={() => setStatus('discarded', 'Batch marked as discarded.')} disabled={busy}
                            className="px-4 py-2 bg-red-700 text-white text-sm font-bold rounded hover:bg-red-800 disabled:opacity-50"
                        >
                            Mark as discarded
                        </button>
                    </div>
                )}

                <section aria-labelledby="checks-title" className="bg-white border border-[#c1d1b9] rounded-2xl p-6 mb-6">
                    <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
                        <h2 id="checks-title" className="text-lg font-bold text-[#1f382a]">Stability check-ins</h2>
                        <span className="flex items-center gap-3">
                            <span className="text-xs text-gray-500">{progress.done} of {progress.total} done</span>
                            {calendar && (
                                <button
                                    onClick={addToCalendar}
                                    title="Download a calendar file with a reminder for each check-in still to do"
                                    className="inline-flex items-center gap-1.5 text-xs font-bold text-[#2c4c3b] border border-[#c1d1b9] rounded-full px-3 py-1 hover:bg-[#e9eee7]"
                                >
                                    <CalendarPlus size={13} aria-hidden /> Add to my calendar
                                </button>
                            )}
                        </span>
                    </div>
                    <p className="text-sm text-gray-600 mb-4">Look at the batch at each stage and record what you see. Changes in texture, smell or colour are the first signs of a problem.</p>

                    <ul className="divide-y divide-gray-100">
                        {checks.map(check => {
                            const state = checkState(check);
                            return (
                                <li key={check.id} className="py-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="font-medium text-gray-900">{check.label}</span>
                                            {state === 'done' && check.result ? (
                                                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-sm border ${RESULT_CHIP[check.result]}`}>{RESULT_LABELS[check.result]}</span>
                                            ) : (
                                                <span className={`text-xs ${state === 'overdue' ? 'text-red-700 font-bold' : state === 'due' ? 'text-amber-700 font-bold' : 'text-gray-500'}`}>
                                                    {describeDue(check.due_on)} · {formatDate(check.due_on)}
                                                </span>
                                            )}
                                        </div>
                                        {isActive && openCheck !== check.id && (
                                            <button
                                                onClick={() => setOpenCheck(check.id)}
                                                className={`text-sm font-bold px-3 py-1 rounded-full border transition-colors ${state === 'done'
                                                    ? 'text-gray-600 border-gray-200 hover:bg-gray-50'
                                                    : 'text-[#2c4c3b] border-[#c1d1b9] hover:bg-[#e9eee7]'}`}
                                            >
                                                {state === 'done' ? 'Edit' : 'Record check-in'}
                                            </button>
                                        )}
                                    </div>

                                    {state === 'done' && openCheck !== check.id && (
                                        <div className="mt-1.5 text-sm text-gray-600 space-y-0.5">
                                            {check.observations.length > 0 && <p>Noticed: {check.observations.map(o => OBSERVATION_LABELS[o] ?? o).join(', ').toLowerCase()}</p>}
                                            <ObservationHelp observations={check.observations} />
                                            {check.measured_ph !== null && <p>pH {check.measured_ph}</p>}
                                            {check.notes && <p className="italic">{check.notes}</p>}
                                        </div>
                                    )}

                                    {openCheck === check.id && (
                                        <CheckInForm check={check} targetPh={batch.target_ph} onSave={(input) => saveCheck(check, input)} onCancel={() => setOpenCheck(null)} />
                                    )}
                                </li>
                            );
                        })}
                    </ul>

                    {isActive && (
                        <form
                            onSubmit={(e) => {
                                e.preventDefault();
                                if (!customLabel.trim()) return;
                                void run(async () => { await addCheck(batch.id, customLabel, customDate); setCustomLabel(''); }, 'Check-in added.');
                            }}
                            className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap items-end gap-3"
                        >
                            <label className="text-xs font-medium text-gray-600">
                                Add your own check-in
                                <input
                                    type="text" value={customLabel} onChange={(e) => setCustomLabel(e.target.value)} placeholder="e.g. after summer heat"
                                    className="mt-1 block w-56 border border-gray-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[#2c4c3b]"
                                />
                            </label>
                            <label className="text-xs font-medium text-gray-600">
                                Date
                                <input
                                    type="date" value={customDate} onChange={(e) => setCustomDate(e.target.value)}
                                    className="mt-1 block border border-gray-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[#2c4c3b]"
                                />
                            </label>
                            <button type="submit" disabled={busy || !customLabel.trim()} className="inline-flex items-center gap-1 px-4 py-1.5 bg-white border border-[#c1d1b9] text-[#2c4c3b] text-sm font-bold rounded-full hover:bg-[#e9eee7] disabled:opacity-50">
                                <Plus size={14} aria-hidden /> Add
                            </button>
                        </form>
                    )}
                </section>

                <section aria-labelledby="made-title" className="bg-white border border-[#c1d1b9] rounded-2xl p-6 mb-6">
                    <h2 id="made-title" className="text-lg font-bold text-[#1f382a] mb-3">What went in</h2>
                    <div className="overflow-x-auto border border-gray-200 rounded-lg">
                        <table className="w-full text-sm text-left min-w-[520px]">
                            <thead className="bg-gray-50 text-xs text-gray-500">
                                <tr>
                                    <th className="px-3 py-2 font-medium">Ingredient</th>
                                    <th className="px-3 py-2 font-medium text-right">%</th>
                                    <th className="px-3 py-2 font-medium text-right">Weighed</th>
                                    <th className="px-3 py-2 font-medium">From stash</th>
                                    <th className="px-3 py-2 font-medium text-right">Cost</th>
                                </tr>
                            </thead>
                            <tbody>
                                {lines.map((line, i) => {
                                    const used = usage.filter(u => u.batch_ingredient_id === line.id);
                                    return (
                                        <tr key={line.id} className="border-t border-gray-100 align-top">
                                            <td className="px-3 py-2">
                                                <div className="font-medium text-[#1f382a]">{line.name}</div>
                                                <div className="text-[10px] text-gray-500">Phase {line.phase}</div>
                                            </td>
                                            <td className="px-3 py-2 text-right font-mono text-gray-500">{Number(Number(line.percentage).toFixed(2))}</td>
                                            <td className="px-3 py-2 text-right font-mono">{grams(line.actual_g)}</td>
                                            <td className="px-3 py-2 text-xs text-gray-600">
                                                {used.length === 0 ? <span className="text-gray-400">not tracked</span> : used.map(u => `${grams(u.grams)} from ${u.label ?? 'stash'}`).join(', ')}
                                            </td>
                                            <td className="px-3 py-2 text-right font-mono text-xs text-gray-700">
                                                {lineCosts[i] === null
                                                    ? <span className="text-gray-400" title="No price was known for this ingredient">no price</span>
                                                    : <>{line.cost_estimated ? '~' : ''}{formatMoney(lineCosts[i]!, currency)}</>}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot>
                                <tr className="border-t border-gray-200 bg-gray-50 font-bold">
                                    <td className="px-3 py-2">Total</td>
                                    <td className="px-3 py-2 text-right font-mono text-gray-500">{Number(lines.reduce((sum, l) => sum + Number(l.percentage), 0).toFixed(2))}</td>
                                    <td className="px-3 py-2 text-right font-mono">{grams(lines.reduce((sum, l) => sum + Number(l.actual_g), 0))}</td>
                                    <td />
                                    <td className="px-3 py-2 text-right font-mono text-xs">{totalCost !== null ? formatMoney(totalCost, currency) : ''}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                    <div aria-label="Cost of this batch" role="group" className="mt-3 text-sm text-[#1f382a]">
                        {totalCost === null ? (
                            <p className="text-gray-600">No prices were known when this batch was made, so there is no cost to show. Enter what you paid on the Stash page for the next one.</p>
                        ) : (
                            <p>
                                <strong>{anyEstimated ? 'About ' : ''}{formatMoney(totalCost, currency)}</strong> for the ingredients
                                {batch.batch_size_g > 0 && <> · {formatMoney((totalCost / Number(batch.batch_size_g)) * 100, currency)} per 100 g</>}
                                {perContainer && <> · <strong>{formatMoney(perContainer.total, currency)}</strong> per {batch.container_name ?? 'container'} including the container</>}
                                {unpriced > 0 && <span className="block text-xs text-gray-600 mt-1">{unpriced} ingredient{unpriced !== 1 ? 's had' : ' had'} no price, so the real cost is higher.</span>}
                                {anyEstimated && <span className="block text-xs text-gray-600 mt-1">Marked ~ means part of that amount was priced at your average price for the ingredient.</span>}
                            </p>
                        )}
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                        {batch.stash_deducted && batch.status !== 'voided'
                            ? `${grams(stashTaken)} was taken out of your stash when this batch started.`
                            : batch.status === 'voided' ? 'This batch was undone and its stash amounts were put back.'
                                : 'This batch did not change your stash.'}
                    </p>
                </section>

                <section aria-labelledby="results-title" className="bg-white border border-[#c1d1b9] rounded-2xl p-6 mb-6">
                    <h2 id="results-title" className="text-lg font-bold text-[#1f382a] mb-3">Result and notes</h2>
                    <div className="grid sm:grid-cols-3 gap-4">
                        <label className="text-sm font-medium text-gray-700">
                            Measured pH
                            <input
                                type="number" step="any" min="0" max="14" value={ph} onChange={(e) => setPh(e.target.value)}
                                placeholder={batch.target_ph !== null ? `aimed for ${batch.target_ph}` : ''}
                                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#2c4c3b]"
                            />
                        </label>
                        <label className="text-sm font-medium text-gray-700">
                            Final weight (g)
                            <input
                                type="number" step="any" min="0" value={finalWeight} onChange={(e) => setFinalWeight(e.target.value)}
                                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#2c4c3b]"
                            />
                            {yieldPct !== null && <span className="block text-xs text-gray-500 mt-1">Yield {Number(yieldPct.toFixed(1))}% of {grams(batch.batch_size_g)}</span>}
                        </label>
                        <label className="text-sm font-medium text-gray-700 sm:col-span-3">
                            Notes
                            <textarea
                                value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
                                placeholder="What you changed, how it felt, what to try next time..."
                                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#2c4c3b] resize-y"
                            />
                        </label>
                    </div>
                    <div className="mt-3 flex justify-end">
                        <button onClick={saveMeasurements} disabled={busy} className="inline-flex items-center gap-1.5 px-5 py-2 bg-[#1f382a] text-white text-sm font-bold rounded hover:bg-[#2c4c3b] disabled:opacity-50">
                            <Check size={14} aria-hidden /> Save
                        </button>
                    </div>
                </section>

                <section aria-labelledby="manage-title" className="bg-white border border-gray-200 rounded-2xl p-6">
                    <h2 id="manage-title" className="text-lg font-bold text-[#1f382a] mb-3">Manage this batch</h2>
                    <div className="flex flex-wrap gap-3">
                        {isActive && (
                            <button onClick={() => setStatus('archived', 'Batch archived.')} disabled={busy} className="px-4 py-2 border border-gray-300 text-sm font-medium text-gray-700 rounded hover:bg-gray-50 disabled:opacity-50">
                                Archive
                            </button>
                        )}
                        {(batch.status === 'archived' || batch.status === 'discarded') && (
                            <button onClick={() => setStatus('active', 'Batch reopened.')} disabled={busy} className="px-4 py-2 border border-gray-300 text-sm font-medium text-gray-700 rounded hover:bg-gray-50 disabled:opacity-50">
                                Reopen
                            </button>
                        )}
                        {isActive && (
                            <button
                                onClick={() => confirmThen('Mark this batch as discarded? Its remaining check-ins will stop reminding you.', () => updateBatch(batch.id, { status: 'discarded' }), 'Batch marked as discarded.')}
                                disabled={busy} className="px-4 py-2 border border-red-200 text-sm font-medium text-red-700 rounded hover:bg-red-50 disabled:opacity-50"
                            >
                                Discard
                            </button>
                        )}
                        {batch.stash_deducted && batch.status !== 'voided' && (
                            <button
                                onClick={() => confirmThen(`Undo this batch? It will be marked as undone and ${grams(stashTaken)} will be put back into your stash. Do this only if the batch was never actually made.`, () => voidBatch(batch.id), 'Batch undone. Your stash was restored.')}
                                disabled={busy} className="px-4 py-2 border border-gray-300 text-sm font-medium text-gray-700 rounded hover:bg-gray-50 disabled:opacity-50"
                            >
                                Undo batch and restore stash
                            </button>
                        )}
                        {batch.status !== 'voided' && !batch.stash_deducted && isActive && (
                            <button
                                onClick={() => confirmThen('Mark this batch as undone? It was never taken from your stash, so nothing else changes.', () => voidBatch(batch.id), 'Batch undone.')}
                                disabled={busy} className="px-4 py-2 border border-gray-300 text-sm font-medium text-gray-700 rounded hover:bg-gray-50 disabled:opacity-50"
                            >
                                Mark as never made
                            </button>
                        )}
                    </div>
                </section>
            </main>
        </StudioLayout>
    );
}
