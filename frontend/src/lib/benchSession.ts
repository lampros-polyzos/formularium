import { isTimerState, newTimer, type TimerState } from './benchTimer';

// The state of making one batch at the bench: what has been weighed, what has gone into the mix, and the timers.
// Pure rules only; the screen and the saving live elsewhere.

export type BenchMode = 'weigh' | 'add' | 'timers';

export interface BenchLine {
    id: string;
    name: string;
    inciName: string | null;
    phase: string;
    /** What to weigh out. */
    grams: number;
}

export interface BenchSession {
    mode: BenchMode;
    /** Ids of the ingredients that have been weighed. */
    weighed: string[];
    /** Ids of the ingredients that have gone into the mix. Only weighed ones can be added. */
    added: string[];
    timers: Record<string, TimerState>;
}

const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

export const phasesOf = (lines: BenchLine[]): string[] => [...new Set(lines.map(l => l.phase))].sort();

export interface PhaseGuide {
    name: string;
    hint: string;
    /** A starting length for the phase timer. */
    minutes: number;
}

/** What each phase is, what to do with it, and a sensible timer. Nothing is heated unless there is an oil phase. */
export function phaseGuide(phase: string, phases: string[]): PhaseGuide {
    const heated = phases.includes('B');
    switch (phase) {
        case 'A':
            return heated
                ? { name: 'Water phase', hint: 'Heat to 70-75 °C and hold, stirring', minutes: 20 }
                : { name: 'Water phase', hint: 'Mix until everything has dissolved', minutes: 5 };
        case 'B':
            return { name: 'Oil phase', hint: 'Heat to 70-75 °C until melted and clear', minutes: 20 };
        case 'C':
            return { name: 'Cool-down phase', hint: 'Add below 40-45 °C and stir well', minutes: 5 };
        default:
            return { name: `Phase ${phase}`, hint: '', minutes: 5 };
    }
}

export const groupByPhase = (lines: BenchLine[]) =>
    phasesOf(lines).map(phase => ({ phase, lines: lines.filter(l => l.phase === phase) }));

export function newSession(lines: BenchLine[]): BenchSession {
    const phases = phasesOf(lines);
    return {
        mode: 'weigh',
        weighed: [],
        added: [],
        timers: Object.fromEntries(phases.map(p => [p, newTimer(phaseGuide(p, phases).minutes)])),
    };
}

const has = (list: string[], id: string) => list.includes(id);
const without = (list: string[], id: string) => list.filter(x => x !== id);

export const totalGrams = (lines: BenchLine[]) => round2(lines.reduce((sum, l) => sum + l.grams, 0));

export const weighedGrams = (lines: BenchLine[], session: BenchSession) =>
    round2(lines.filter(l => has(session.weighed, l.id)).reduce((sum, l) => sum + l.grams, 0));

export const stillToWeigh = (lines: BenchLine[], session: BenchSession) => lines.filter(l => !has(session.weighed, l.id));

/** Everything that has been weighed but has not gone into the mix yet, and everything not weighed: all of it is still to add. */
export const stillToAdd = (lines: BenchLine[], session: BenchSession) => lines.filter(l => !has(session.added, l.id));

export const allWeighed = (lines: BenchLine[], session: BenchSession) => lines.length > 0 && stillToWeigh(lines, session).length === 0;
export const allAdded = (lines: BenchLine[], session: BenchSession) => lines.length > 0 && stillToAdd(lines, session).length === 0;

/**
 * Ticks or unticks an ingredient as weighed. Weighing the last one moves on to the checker, so nothing is forgotten;
 * unticking one that was already added takes it out of the "added" list too, since it is no longer certain.
 */
export function toggleWeighed(session: BenchSession, lines: BenchLine[], id: string): BenchSession {
    if (!lines.some(l => l.id === id)) return session;
    if (has(session.weighed, id)) {
        return { ...session, weighed: without(session.weighed, id), added: without(session.added, id) };
    }
    const next = { ...session, weighed: [...session.weighed, id] };
    return allWeighed(lines, next) && session.mode === 'weigh' ? { ...next, mode: 'add' } : next;
}

/** Ticks or unticks an ingredient as added to the mix. Only something already weighed can be added. */
export function toggleAdded(session: BenchSession, lines: BenchLine[], id: string): BenchSession {
    if (!lines.some(l => l.id === id)) return session;
    if (has(session.added, id)) return { ...session, added: without(session.added, id) };
    if (!has(session.weighed, id)) return session;
    return { ...session, added: [...session.added, id] };
}

/** A saved session, checked against the batch it belongs to: anything that no longer fits is dropped. */
export function restoreSession(raw: unknown, lines: BenchLine[]): BenchSession {
    const fresh = newSession(lines);
    if (!raw || typeof raw !== 'object') return fresh;
    const saved = raw as Record<string, unknown>;
    const ids = new Set(lines.map(l => l.id));
    const keep = (value: unknown) => (Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string' && ids.has(x)) : []);

    const weighed = [...new Set(keep(saved.weighed))];
    const added = [...new Set(keep(saved.added))].filter(id => weighed.includes(id));
    const timers = { ...fresh.timers };
    if (saved.timers && typeof saved.timers === 'object') {
        for (const [phase, value] of Object.entries(saved.timers as Record<string, unknown>)) {
            if (phase in timers && isTimerState(value)) timers[phase] = value;
        }
    }
    const mode = saved.mode === 'add' || saved.mode === 'timers' || saved.mode === 'weigh' ? saved.mode : 'weigh';
    return { mode, weighed, added, timers };
}

/** "140", "0.55": a weight without trailing zeros. */
export const gramsText = (g: number) => String(Number(g.toFixed(2)));

/** What to weigh is what the batch recorded as weighed out, which starts out equal to the plan. */
export const toBenchLines = (lines: { id: string; name: string; inci_name: string | null; phase: string; actual_g: number | string }[]): BenchLine[] =>
    lines.map(l => ({ id: l.id, name: l.name, inciName: l.inci_name, phase: l.phase, grams: Number(l.actual_g) }));
