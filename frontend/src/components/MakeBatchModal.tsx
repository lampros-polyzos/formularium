import { useEffect, useMemo, useRef, useState } from 'react';
import { PackageCheck, TriangleAlert, X } from 'lucide-react';
import { fetchContainers, fetchStash } from '../lib/libraryApi';
import { createBatch, lotNumbersLike } from '../lib/batches';
import {
    buildPlan, summarizePlan, suggestLotNumber, type PlanEdits, type PlanRow, type StashLot,
} from '../lib/batchPlan';
import { costPerContainer, formatMoney, planCost } from '../lib/batchCost';
import { DEFAULT_FILL_PERCENT, containersFilled, describeCount, estimateDensity, sizeForContainers } from '../lib/batchContainer';

interface MakeBatchModalProps {
    userId: string;
    formulationId: string | null;
    formulaName: string;
    targetPh: number | null;
    defaultBatchSizeG: number;
    rows: PlanRow[];
    /** The currency symbol costs are shown in. */
    currency?: string;
    onClose: () => void;
    onCreated: (batchId: string) => void;
}

interface ContainerOption { id: string; name: string; volume_ml: number; price_per_unit: number | null }

const fmt = (v: number) => `${Number(v.toFixed(2))} g`;

export default function MakeBatchModal({ userId, formulationId, formulaName, targetPh, defaultBatchSizeG, rows, currency = '$', onClose, onCreated }: MakeBatchModalProps) {
    const [batchSize, setBatchSize] = useState(String(defaultBatchSizeG || 100));
    const [lotNumber, setLotNumber] = useState('');
    const [notes, setNotes] = useState('');
    const [useStash, setUseStash] = useState(true);
    const [edits, setEdits] = useState<PlanEdits>({ amounts: {}, skipStash: new Set() });
    const [lots, setLots] = useState<StashLot[] | null>(null);
    const [stashError, setStashError] = useState(false);
    const [reloadKey, setReloadKey] = useState(0);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const lotTouched = useRef(false);

    // Containers: pick one and the batch size follows, or just weigh and note what it goes into
    const [containers, setContainers] = useState<ContainerOption[]>([]);
    const [containerId, setContainerId] = useState('');
    const [containerCount, setContainerCount] = useState('1');
    const [fillPercent, setFillPercent] = useState(String(DEFAULT_FILL_PERCENT));
    const density = useMemo(() => estimateDensity(rows), [rows]);

    // Read the stash (read-only) so the plan reflects what you own right now
    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const data = await fetchStash();
                if (!cancelled) { setLots(data as StashLot[]); setStashError(false); }
            } catch (e) {
                console.error('Could not read the stash for the batch plan:', e);
                if (!cancelled) { setLots([]); setStashError(true); }
            }
        };
        load();
        return () => { cancelled = true; };
    }, [userId, reloadKey]);

    // Suggest the next free lot number for today
    useEffect(() => {
        let cancelled = false;
        const today = new Date();
        const prefix = `${String(today.getFullYear()).slice(-2)}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}-`;
        lotNumbersLike(prefix).then(existing => {
            if (!cancelled && !lotTouched.current) setLotNumber(suggestLotNumber(existing, today));
        });
        return () => { cancelled = true; };
    }, []);

    // The containers you own that have a known size. Without any, the container picker simply doesn't show.
    useEffect(() => {
        let cancelled = false;
        fetchContainers()
            .then(data => {
                if (cancelled) return;
                const named = [...data].sort((a, b) => a.name.localeCompare(b.name));
                setContainers((named as unknown as ContainerOption[]).filter(c => c.volume_ml > 0));
            })
            .catch(() => { /* without containers the picker simply doesn't show */ });
        return () => { cancelled = true; };
    }, [userId]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !isSubmitting) onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose, isSubmitting]);

    const sizeG = parseFloat(batchSize) || 0;
    const totalPct = rows.reduce((sum, r) => sum + r.percentage, 0);
    const totalOff = Math.abs(totalPct - 100) > 0.01;

    const plan = useMemo(
        () => buildPlan(rows, sizeG, lots ?? [], edits, useStash && lots !== null),
        [rows, sizeG, lots, edits, useStash]
    );
    const summary = useMemo(() => summarizePlan(plan), [plan]);
    const anyStock = plan.some(l => l.available.freshG > 0);

    // What it costs: grams from a stash lot at that lot's price, anything else at your average price for it
    const cost = useMemo(() => planCost(plan, lots ?? [], sizeG), [plan, lots, sizeG]);

    const container = containers.find(c => c.id === containerId) ?? null;
    const fill = parseFloat(fillPercent) || DEFAULT_FILL_PERCENT;
    const filled = container ? containersFilled(sizeG, container.volume_ml, fill, density) : 0;
    const perContainer = container ? costPerContainer(cost.total, filled, container.price_per_unit ?? 0) : null;

    // Choosing a container (or how many, or how full) sets the batch size; typing a size afterwards is still allowed
    const sizeFromContainer = (id: string, count: string, fillText: string) => {
        const chosen = containers.find(c => c.id === id);
        if (!chosen) return;
        const grams = sizeForContainers(chosen.volume_ml, parseFloat(count) || 0, parseFloat(fillText) || DEFAULT_FILL_PERCENT, density);
        if (grams > 0) { setBatchSize(String(grams)); setEdits(prev => ({ ...prev, amounts: {} })); }
    };

    const blocker = rows.length === 0 ? 'Add ingredients to the formula first.'
        : totalOff ? `The formula adds up to ${Number(totalPct.toFixed(2))}%, not 100%. Balance it in the editor first.`
            : sizeG <= 0 ? 'Enter a batch size.'
                : !lotNumber.trim() ? 'Enter a lot number.'
                    : '';

    const start = async () => {
        if (blocker || isSubmitting) return;
        setIsSubmitting(true);
        setError('');
        try {
            const id = await createBatch({
                formulationId,
                name: formulaName || 'Untitled batch',
                lotNumber,
                batchSizeG: sizeG,
                targetPh,
                notes,
                container: container && filled > 0
                    ? { id: container.id, name: container.name, volume_ml: container.volume_ml, count: filled, unit_price: container.price_per_unit ?? 0, density_g_ml: density }
                    : null,
                lines: plan.map((l, i) => ({
                    ingredient_id: l.row.ingredient_id,
                    name: l.row.name,
                    inci_name: l.row.inci_name,
                    phase: l.row.phase,
                    percentage: l.row.percentage,
                    planned_g: l.plannedG,
                    actual_g: l.amountG,
                    allocations: l.takeFromStash ? l.allocation.allocations : [],
                    est_price_per_g: cost.lines[i].estimatePerG,
                })),
            });
            onCreated(id);
        } catch (e) {
            const message = e instanceof Error ? e.message : 'Could not start the batch.';
            setError(message);
            if (/not enough/i.test(message)) setReloadKey(k => k + 1); // the stash changed: refresh the plan
            setIsSubmitting(false);
        }
    };

    const startLabel = summary.changesStash
        ? `Start batch and use ${fmt(summary.deductG)} of stash`
        : 'Start batch (stash unchanged)';

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => { if (!isSubmitting) onClose(); }}>
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="make-batch-title"
                className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="bg-[#e9eee7] px-6 py-4 border-b border-[#c1d1b9] flex justify-between items-start gap-4">
                    <div>
                        <h3 id="make-batch-title" className="text-lg font-bold text-[#1f382a] flex items-center gap-2">
                            <PackageCheck size={20} aria-hidden /> Make this batch
                        </h3>
                        <p className="text-xs text-gray-600 mt-0.5">{formulaName || 'Untitled formula'}</p>
                    </div>
                    <button onClick={onClose} disabled={isSubmitting} aria-label="Close" className="text-gray-500 hover:text-gray-800 p-1"><X size={20} /></button>
                </div>

                <div className="overflow-y-auto px-6 py-5 space-y-5">
                    <p className="text-sm bg-[#f0f6ee] border border-[#b9ccb2] rounded-lg px-4 py-2.5 text-[#1f382a]">
                        This is a preview. <strong>Nothing changes in your stash until you press Start batch.</strong> Closing this window leaves everything as it is.
                    </p>

                    <div className="grid gap-4 sm:grid-cols-3">
                        <label className="text-sm font-medium text-gray-700">
                            Batch size (g)
                            <input
                                type="number" min="1" step="any" value={batchSize}
                                onChange={(e) => { setBatchSize(e.target.value); setEdits(prev => ({ ...prev, amounts: {} })); }}
                                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#2c4c3b]"
                            />
                        </label>
                        <label className="text-sm font-medium text-gray-700">
                            Lot number
                            <input
                                type="text" value={lotNumber}
                                onChange={(e) => { lotTouched.current = true; setLotNumber(e.target.value); }}
                                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#2c4c3b]"
                            />
                        </label>
                        <label className="text-sm font-medium text-gray-700">
                            Notes (optional)
                            <input
                                type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. first test, new butter"
                                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#2c4c3b]"
                            />
                        </label>
                    </div>

                    {containers.length > 0 && (
                        <div className="grid gap-4 sm:grid-cols-3 items-end">
                            <label className="text-sm font-medium text-gray-700">
                                Fill containers (optional)
                                <select
                                    value={containerId}
                                    onChange={(e) => { setContainerId(e.target.value); sizeFromContainer(e.target.value, containerCount, fillPercent); }}
                                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-[#2c4c3b]"
                                >
                                    <option value="">Just use the weight above</option>
                                    {containers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.volume_ml} ml)</option>)}
                                </select>
                            </label>
                            {container && (
                                <>
                                    <label className="text-sm font-medium text-gray-700">
                                        How many
                                        <input
                                            type="number" min="0.5" step="any" value={containerCount}
                                            onChange={(e) => { setContainerCount(e.target.value); sizeFromContainer(containerId, e.target.value, fillPercent); }}
                                            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#2c4c3b]"
                                        />
                                    </label>
                                    <label className="text-sm font-medium text-gray-700">
                                        Fill to (%)
                                        <input
                                            type="number" min="1" max="100" step="any" value={fillPercent}
                                            onChange={(e) => { setFillPercent(e.target.value); sizeFromContainer(containerId, containerCount, e.target.value); }}
                                            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#2c4c3b]"
                                        />
                                    </label>
                                    <p className="sm:col-span-3 text-xs text-gray-600">
                                        This batch of {fmt(sizeG)} fills about <strong>{describeCount(filled)}</strong> of {container.name}, assuming {density} g per ml.
                                        That density is an estimate: weigh one full container to be sure.
                                    </p>
                                </>
                            )}
                        </div>
                    )}

                    {blocker && (
                        <p role="alert" className="flex gap-2 text-sm bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-4 py-2.5">
                            <TriangleAlert size={16} className="shrink-0 mt-0.5" aria-hidden /> {blocker}
                        </p>
                    )}

                    <label className={`flex items-start gap-2 text-sm ${anyStock ? 'text-gray-800 cursor-pointer' : 'text-gray-400'}`}>
                        <input
                            type="checkbox" checked={useStash && anyStock} disabled={!anyStock}
                            onChange={(e) => setUseStash(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#2c4c3b]"
                        />
                        <span>
                            <strong>Take these amounts out of my stash</strong>
                            <span className="block text-xs text-gray-500">
                                {lots === null ? 'Checking your stash...'
                                    : stashError ? "Couldn't read your stash, so this batch will only be recorded."
                                        : !anyStock ? 'None of these ingredients are in your stash, so the batch will only be recorded. Add stock on the Stash page to track it.'
                                            : 'Uses the lots that expire first. Expired stock is never used.'}
                            </span>
                        </span>
                    </label>

                    <section aria-label="Cost" className="bg-[#f7f8f6] border border-[#c1d1b9] rounded-lg px-4 py-3 text-sm text-[#1f382a]">
                        {cost.total === null ? (
                            <p className="text-gray-600">
                                No prices known yet. Enter what you paid on the Stash page and the real cost of every batch appears here.
                            </p>
                        ) : (
                            <>
                                <p>
                                    <strong>{cost.estimated ? 'About ' : ''}{formatMoney(cost.total, currency)}</strong> for the ingredients
                                    {cost.per100g !== null && <> · {formatMoney(cost.per100g, currency)} per 100 g</>}
                                    {perContainer && <> · <strong>{formatMoney(perContainer.total, currency)}</strong> per {container?.name ?? 'container'} including the container</>}
                                </p>
                                <p className="text-xs text-gray-600 mt-1">
                                    {cost.estimated
                                        ? 'Grams taken from your stash use the price of that lot. The rest uses your average price for the ingredient (marked ~).'
                                        : 'Worked out from the prices of the stash lots this batch uses.'}
                                    {cost.unpriced > 0 && <> {cost.unpriced} ingredient{cost.unpriced !== 1 ? 's have' : ' has'} no price yet, so the total is higher in reality.</>}
                                </p>
                            </>
                        )}
                    </section>

                    <div className="overflow-x-auto border border-gray-200 rounded-lg">
                        <table className="w-full text-sm text-left min-w-[640px]">
                            <thead className="bg-gray-50 text-xs text-gray-500">
                                <tr>
                                    <th className="px-3 py-2 font-medium">Ingredient</th>
                                    <th className="px-3 py-2 font-medium text-right">%</th>
                                    <th className="px-3 py-2 font-medium text-right">Weigh (g)</th>
                                    <th className="px-3 py-2 font-medium">From your stash</th>
                                    <th className="px-3 py-2 font-medium text-right">Cost</th>
                                </tr>
                            </thead>
                            <tbody>
                                {plan.map(line => (
                                    <tr key={line.index} className="border-t border-gray-100 align-top">
                                        <td className="px-3 py-2">
                                            <div className="font-medium text-[#1f382a]">{line.row.name}</div>
                                            <div className="text-[10px] text-gray-500">Phase {line.row.phase}</div>
                                        </td>
                                        <td className="px-3 py-2 text-right font-mono text-gray-500">{Number(line.row.percentage.toFixed(2))}</td>
                                        <td className="px-3 py-2 text-right">
                                            <input
                                                type="number" min="0" step="any" aria-label={`Amount of ${line.row.name} in grams`}
                                                value={line.amountG}
                                                onChange={(e) => setEdits(prev => ({ ...prev, amounts: { ...prev.amounts, [line.index]: parseFloat(e.target.value) || 0 } }))}
                                                className="w-24 border border-gray-300 rounded px-2 py-1 text-sm text-right font-mono outline-none focus:ring-1 focus:ring-[#2c4c3b]"
                                            />
                                        </td>
                                        <td className="px-3 py-2 text-xs">
                                            {line.status === 'none' && <span className="text-gray-400">Not in your stash</span>}
                                            {line.status === 'expired' && (
                                                <span className="text-amber-700">Only expired stock ({fmt(line.available.expiredG)}): not used</span>
                                            )}
                                            {(line.status === 'ok' || line.status === 'short') && (
                                                <div>
                                                    <label className="flex items-center gap-1.5 text-gray-700 cursor-pointer">
                                                        <input
                                                            type="checkbox" checked={line.takeFromStash} disabled={!useStash}
                                                            aria-label={`Take ${line.row.name} from stash`}
                                                            onChange={(e) => setEdits(prev => {
                                                                const skip = new Set(prev.skipStash);
                                                                if (e.target.checked) skip.delete(line.index); else skip.add(line.index);
                                                                return { ...prev, skipStash: skip };
                                                            })}
                                                            className="w-3.5 h-3.5 accent-[#2c4c3b]"
                                                        />
                                                        {line.takeFromStash
                                                            ? <>take {fmt(line.allocation.allocatedG)} · {fmt(line.available.freshG - line.allocation.allocatedG)} left</>
                                                            : <>don't take ({fmt(line.available.freshG)} in stash)</>}
                                                    </label>
                                                    {line.takeFromStash && (
                                                        <div className="text-[10px] text-gray-500 ml-5">{line.allocation.allocations.map(a => `${fmt(a.grams)} from ${a.label}`).join(', ')}</div>
                                                    )}
                                                    {line.takeFromStash && line.allocation.shortG > 0 && (
                                                        <div className="text-[10px] text-amber-700 ml-5">Only {fmt(line.allocation.allocatedG)} in stash: {fmt(line.allocation.shortG)} won't be tracked</div>
                                                    )}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-3 py-2 text-right font-mono text-xs text-gray-700">
                                            {cost.lines[line.index].cost === null
                                                ? <span className="text-gray-400" title="No price entered for this ingredient">no price</span>
                                                : <>{cost.lines[line.index].estimated ? '~' : ''}{formatMoney(cost.lines[line.index].cost!, currency)}</>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="border-t border-gray-200 bg-gray-50 font-bold">
                                    <td className="px-3 py-2">Total</td>
                                    <td className={`px-3 py-2 text-right font-mono ${totalOff ? 'text-amber-700' : ''}`}>{Number(totalPct.toFixed(2))}</td>
                                    <td className="px-3 py-2 text-right font-mono">{fmt(summary.totalG)}</td>
                                    <td />
                                    <td className="px-3 py-2 text-right font-mono text-xs">{cost.total !== null ? formatMoney(cost.total, currency) : ''}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>

                    {error && <p role="alert" className="text-sm bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2.5">{error}</p>}
                </div>

                <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3">
                    <span className="text-xs text-gray-600">
                        {summary.changesStash
                            ? `Will take ${fmt(summary.deductG)} from ${summary.lotsTouched} stash lot${summary.lotsTouched !== 1 ? 's' : ''}`
                            : 'Your stash will not be changed'}
                    </span>
                    <div className="flex gap-2">
                        <button onClick={onClose} disabled={isSubmitting} className="px-4 py-2 text-sm font-medium text-gray-600 rounded hover:bg-gray-100">Cancel</button>
                        <button
                            onClick={start}
                            disabled={Boolean(blocker) || isSubmitting}
                            className="px-5 py-2 bg-[#1f382a] text-white text-sm font-bold rounded hover:bg-[#2c4c3b] disabled:opacity-50 transition-colors"
                        >
                            {isSubmitting ? 'Starting...' : startLabel}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
