import { Pause, Play, RotateCcw } from 'lucide-react';
import { MINUTE, formatClock, type TimerStatus } from '../../lib/benchTimer';
import { phaseGuide } from '../../lib/benchSession';

interface BenchTimersProps {
    phases: string[];
    statusOf: (phase: string) => TimerStatus;
    leftOf: (phase: string) => number;
    onStart: (phase: string) => void;
    onPause: (phase: string) => void;
    onReset: (phase: string) => void;
    onAdjust: (phase: string, deltaMs: number) => void;
}

const ADJUSTMENTS = [-5, -1, 1, 5];

/** A big countdown for each phase. Starting one is a tap; the phone sounds and buzzes when it ends. */
export default function BenchTimers({ phases, statusOf, leftOf, onStart, onPause, onReset, onAdjust }: BenchTimersProps) {
    return (
        <div className="space-y-4">
            {phases.map(phase => {
                const guide = phaseGuide(phase, phases);
                const status = statusOf(phase);
                const done = status === 'done';
                const running = status === 'running';
                return (
                    <section
                        key={phase}
                        aria-label={`Phase ${phase} timer`}
                        className={`rounded-3xl border-2 p-5 ${done ? 'bg-red-50 border-red-500 animate-pulse' : running ? 'bg-green-50 border-green-600' : 'bg-white border-[#c1d1b9]'}`}
                    >
                        <div className="flex items-baseline justify-between gap-3">
                            <h3 className="text-lg font-bold text-[#1f382a]">Phase {phase} · {guide.name}</h3>
                            <span className="text-xs font-bold uppercase tracking-wide text-gray-500">{done ? "Time's up" : status}</span>
                        </div>
                        {guide.hint && <p className="text-sm text-gray-600">{guide.hint}</p>}

                        <p
                            role="timer"
                            aria-label={`Phase ${phase} time left`}
                            className={`my-3 text-center text-7xl font-bold tabular-nums ${done ? 'text-red-700' : 'text-[#1f382a]'}`}
                        >
                            {formatClock(leftOf(phase))}
                        </p>

                        <div className="flex gap-3">
                            {done ? (
                                <button type="button" onClick={() => onReset(phase)} className="flex-1 h-16 rounded-2xl bg-red-600 text-white text-xl font-bold active:bg-red-700">
                                    Stop alarm
                                </button>
                            ) : running ? (
                                <button type="button" onClick={() => onPause(phase)} className="flex-1 h-16 rounded-2xl bg-amber-500 text-white text-xl font-bold flex items-center justify-center gap-2 active:bg-amber-600">
                                    <Pause size={24} aria-hidden /> Pause
                                </button>
                            ) : (
                                <button type="button" onClick={() => onStart(phase)} className="flex-1 h-16 rounded-2xl bg-[#1f382a] text-white text-xl font-bold flex items-center justify-center gap-2 active:bg-[#2c4c3b]">
                                    <Play size={24} aria-hidden /> {status === 'paused' ? 'Resume' : 'Start'}
                                </button>
                            )}
                            {!done && status !== 'idle' && (
                                <button type="button" onClick={() => onReset(phase)} aria-label={`Reset phase ${phase} timer`} className="w-16 h-16 rounded-2xl border-2 border-gray-300 bg-white text-gray-600 flex items-center justify-center active:bg-gray-100">
                                    <RotateCcw size={22} aria-hidden />
                                </button>
                            )}
                        </div>

                        {!running && !done && (
                            <div className="mt-3 flex justify-center gap-2" role="group" aria-label={`Change phase ${phase} time`}>
                                {ADJUSTMENTS.map(minutes => (
                                    <button
                                        key={minutes}
                                        type="button"
                                        onClick={() => onAdjust(phase, minutes * MINUTE)}
                                        className="h-11 min-w-[4rem] px-3 rounded-xl border border-gray-300 bg-white text-base font-semibold text-gray-700 active:bg-gray-100"
                                    >
                                        {minutes > 0 ? `+${minutes}` : `−${-minutes}`} min
                                    </button>
                                ))}
                            </div>
                        )}
                    </section>
                );
            })}
        </div>
    );
}
