import { useMemo } from 'react';
import { BellRing, CircleCheck, TriangleAlert, X } from 'lucide-react';
import BenchRow from './BenchRow';
import BenchTimers from './BenchTimers';
import { useBenchSession } from '../../hooks/useBenchSession';
import { useWakeLock } from '../../hooks/useWakeLock';
import {
    allAdded, allWeighed, gramsText, groupByPhase, phaseGuide, phasesOf, stillToAdd, stillToWeigh, toBenchLines, totalGrams, weighedGrams,
    type BenchMode as Mode,
} from '../../lib/benchSession';
import { formatClock } from '../../lib/benchTimer';
import type { Batch, BatchLine } from '../../types/batches';

interface BenchModeProps {
    batch: Pick<Batch, 'id' | 'name' | 'lot_number'>;
    lines: BatchLine[];
    onExit: () => void;
}


/**
 * Making a batch from a phone: every ingredient is a big tick box with its weight, a running total shows how much is
 * weighed, then a checker makes sure every weighed ingredient actually goes into the mix, and each phase has a timer.
 */
export default function BenchMode({ batch, lines: batchLines, onExit }: BenchModeProps) {
    const lines = useMemo(() => toBenchLines(batchLines), [batchLines]);
    const bench = useBenchSession(batch.id, lines);
    useWakeLock(true);

    const { session } = bench;
    const phases = phasesOf(lines);
    const groups = groupByPhase(lines);
    const toWeigh = stillToWeigh(lines, session);
    const toAdd = stillToAdd(lines, session);
    const everythingWeighed = allWeighed(lines, session);
    const everythingAdded = allAdded(lines, session);

    // The nearest running timer, shown in the top bar whichever tab you are on
    const running = phases
        .filter(p => bench.statusOf(p) === 'running')
        .sort((a, b) => bench.leftOf(a) - bench.leftOf(b))[0];

    const tabs: { id: Mode; label: string; count?: string }[] = [
        { id: 'weigh', label: 'Weigh', count: `${session.weighed.length}/${lines.length}` },
        { id: 'add', label: 'Add to mix', count: `${session.added.length}/${lines.length}` },
        { id: 'timers', label: 'Timers' },
    ];

    const confirmStartOver = () => {
        if (window.confirm('Start over? This clears every tick and resets the timers for this batch.')) bench.startOver();
    };

    return (
        <div role="region" aria-label="Bench mode" className="fixed inset-0 z-[60] flex flex-col bg-[#f7f8f6] text-[#1f382a]">
            <header className="shrink-0 bg-[#1f382a] text-white px-3 py-2 flex items-center gap-3">
                <button type="button" onClick={onExit} aria-label="Leave bench mode" className="w-12 h-12 rounded-xl flex items-center justify-center hover:bg-white/10 active:bg-white/20">
                    <X size={26} aria-hidden />
                </button>
                <div className="min-w-0 flex-1">
                    <h1 className="text-lg font-bold truncate">{batch.name}</h1>
                    <p className="text-xs text-[#c1d1b9]">Lot {batch.lot_number} · {gramsText(totalGrams(lines))} g in all</p>
                </div>
                {running && (
                    <button type="button" onClick={() => bench.setMode('timers')} aria-label={`Phase ${running} timer: ${formatClock(bench.leftOf(running))} left`} className="shrink-0 rounded-xl bg-white/15 px-3 py-2 text-left active:bg-white/25">
                        <span className="block text-[10px] uppercase tracking-wide text-[#c1d1b9]">Phase {running}</span>
                        <span className="block text-xl font-bold tabular-nums leading-none">{formatClock(bench.leftOf(running))}</span>
                    </button>
                )}
            </header>

            {bench.finished.length > 0 && (
                <div role="alert" className="shrink-0 bg-red-600 text-white px-4 py-3 flex items-center gap-3">
                    <BellRing size={24} aria-hidden className="shrink-0" />
                    <p className="flex-1 text-lg font-bold">
                        {bench.finished.map(p => `Phase ${p}`).join(' and ')} timer is done
                    </p>
                    <button type="button" onClick={() => bench.setMode('timers')} className="shrink-0 h-11 px-4 rounded-xl bg-white text-red-700 font-bold">Open</button>
                </div>
            )}

            <div role="tablist" aria-label="Bench steps" className="shrink-0 grid grid-cols-3 bg-white border-b border-[#c1d1b9]">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={session.mode === tab.id}
                        onClick={() => bench.setMode(tab.id)}
                        className={`h-16 text-center border-b-4 transition-colors ${session.mode === tab.id ? 'border-[#1f382a] text-[#1f382a] font-bold' : 'border-transparent text-gray-500'}`}
                    >
                        <span className="block text-base leading-tight">{tab.label}</span>
                        {tab.count && <span className="block text-sm tabular-nums">{tab.count}</span>}
                    </button>
                ))}
            </div>

            <main role="tabpanel" aria-label={tabs.find(t => t.id === session.mode)?.label} className="flex-1 overflow-y-auto px-4 py-5">
                {lines.length === 0 && <p className="text-center text-gray-600 py-16">This batch has no ingredients to make.</p>}

                {session.mode === 'weigh' && lines.length > 0 && (
                    <div className="space-y-6">
                        {groups.map(({ phase, lines: groupLines }) => {
                            const guide = phaseGuide(phase, phases);
                            const subtotal = weighedGrams(groupLines, session);
                            return (
                                <section key={phase} aria-label={`Phase ${phase}`}>
                                    <div className="flex items-baseline justify-between gap-3 mb-2">
                                        <h2 className="text-sm font-bold uppercase tracking-wide text-gray-600">Phase {phase} · {guide.name}</h2>
                                        <span className="text-sm text-gray-500 tabular-nums">{gramsText(subtotal)} / {gramsText(totalGrams(groupLines))} g</span>
                                    </div>
                                    <div className="space-y-3">
                                        {groupLines.map(line => (
                                            <BenchRow key={line.id} line={line} checked={session.weighed.includes(line.id)} onToggle={() => bench.toggleWeighed(line.id)} />
                                        ))}
                                    </div>
                                </section>
                            );
                        })}
                    </div>
                )}

                {session.mode === 'add' && lines.length > 0 && (
                    <div className="space-y-6">
                        {everythingAdded ? (
                            <section aria-label="Finished" className="rounded-3xl border-2 border-green-600 bg-green-50 p-6 text-center">
                                <CircleCheck size={64} className="mx-auto text-green-600" aria-hidden />
                                <h2 className="mt-3 text-2xl font-bold text-green-900">Everything is in the mix</h2>
                                <p className="mt-1 text-green-900">Every ingredient was weighed and added. Nothing was left out.</p>
                                <p className="mt-3 text-sm text-green-900/80">Once it has cooled, measure the pH and note how it turned out on the batch page.</p>
                                <button type="button" onClick={onExit} className="mt-5 w-full h-16 rounded-2xl bg-[#1f382a] text-white text-xl font-bold active:bg-[#2c4c3b]">Back to the batch</button>
                            </section>
                        ) : (
                            <p className="rounded-2xl bg-[#e9eee7] border border-[#c1d1b9] px-4 py-3 text-base">
                                {everythingWeighed
                                    ? 'Everything is weighed. Tick each one as it goes into the mix, so nothing is left out.'
                                    : `${toWeigh.length} ${toWeigh.length === 1 ? 'ingredient is' : 'ingredients are'} not weighed yet. You can only add what has been weighed.`}
                            </p>
                        )}

                        {groups.map(({ phase, lines: groupLines }) => {
                            const guide = phaseGuide(phase, phases);
                            return (
                                <section key={phase} aria-label={`Phase ${phase}`}>
                                    <div className="mb-2">
                                        <h2 className="text-sm font-bold uppercase tracking-wide text-gray-600">Phase {phase} · {guide.name}</h2>
                                        {guide.hint && <p className="text-sm text-gray-500">{guide.hint}</p>}
                                    </div>
                                    <div className="space-y-3">
                                        {groupLines.map(line => {
                                            const weighed = session.weighed.includes(line.id);
                                            return (
                                                <BenchRow
                                                    key={line.id}
                                                    line={line}
                                                    checked={session.added.includes(line.id)}
                                                    disabled={!weighed}
                                                    note={weighed ? undefined : 'Weigh it first'}
                                                    onToggle={() => bench.toggleAdded(line.id)}
                                                />
                                            );
                                        })}
                                    </div>
                                </section>
                            );
                        })}
                    </div>
                )}

                {session.mode === 'timers' && lines.length > 0 && (
                    <BenchTimers
                        phases={phases}
                        statusOf={bench.statusOf}
                        leftOf={bench.leftOf}
                        onStart={bench.startTimer}
                        onPause={bench.pauseTimer}
                        onReset={bench.resetTimer}
                        onAdjust={bench.adjustTimer}
                    />
                )}

                {lines.length > 0 && (
                    <div className="mt-10 text-center">
                        <button type="button" onClick={confirmStartOver} className="text-sm text-gray-500 underline underline-offset-2">Start over</button>
                    </div>
                )}
            </main>

            {session.mode === 'weigh' && lines.length > 0 && (
                <footer className="shrink-0 bg-white border-t-2 border-[#c1d1b9] px-4 py-3">
                    <div className="flex items-end justify-between gap-3">
                        <div>
                            <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Weighed so far</p>
                            <p aria-label="Weighed total" className="text-5xl font-bold tabular-nums leading-none">
                                {gramsText(weighedGrams(lines, session))}<span className="text-2xl font-semibold text-gray-500"> g</span>
                            </p>
                        </div>
                        <p className="text-right text-gray-600">
                            of <strong className="text-2xl tabular-nums text-[#1f382a]">{gramsText(totalGrams(lines))} g</strong>
                        </p>
                    </div>
                    <div className="mt-2 h-3 rounded-full bg-gray-200 overflow-hidden" role="progressbar" aria-label="Weighed" aria-valuemin={0} aria-valuemax={lines.length} aria-valuenow={session.weighed.length}>
                        <div className="h-full bg-green-600 transition-all" style={{ width: `${(session.weighed.length / lines.length) * 100}%` }} />
                    </div>
                </footer>
            )}

            {session.mode === 'add' && lines.length > 0 && !everythingAdded && (
                <footer className="shrink-0 bg-white border-t-2 border-[#c1d1b9] px-4 py-3">
                    <p className="text-2xl font-bold tabular-nums">Added {session.added.length} of {lines.length}</p>
                    <p role="status" className="mt-1 flex items-start gap-2 text-base text-amber-800">
                        <TriangleAlert size={20} className="shrink-0 mt-0.5" aria-hidden />
                        <span>
                            Still to add: {toAdd.slice(0, 3).map(l => l.name).join(', ')}
                            {toAdd.length > 3 && ` and ${toAdd.length - 3} more`}
                        </span>
                    </p>
                </footer>
            )}
        </div>
    );
}
