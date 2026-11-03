import { useCallback, useEffect, useRef, useState } from 'react';
import { playAlarm, prepareAlarm } from '../lib/benchAlarm';
import { adjustTimer, pauseTimer, resetTimer, startTimer, timeLeft, timerStatus, type TimerStatus } from '../lib/benchTimer';
import { newSession, restoreSession, toggleAdded, toggleWeighed, type BenchLine, type BenchMode, type BenchSession } from '../lib/benchSession';

/** A finished timer sounds again this often until someone deals with it: one beep is easy to miss at the stove. */
export const ALARM_REPEAT_MS = 8000;
const TICK_MS = 250;

const keyFor = (batchId: string) => `formularium.bench.${batchId}`;

function load(batchId: string, lines: BenchLine[]): BenchSession {
    try {
        const raw = localStorage.getItem(keyFor(batchId));
        return restoreSession(raw ? JSON.parse(raw) : null, lines);
    } catch {
        return newSession(lines);
    }
}

/**
 * Everything about making one batch at the bench. It is saved on this device after every change, so closing the tab,
 * locking the phone or losing signal costs nothing: ticks come back, and timers carry on from the right time.
 */
export function useBenchSession(batchId: string, lines: BenchLine[]) {
    const [session, setSession] = useState<BenchSession>(() => load(batchId, lines));
    const [now, setNow] = useState(() => Date.now());
    const lastAlarm = useRef(0);

    useEffect(() => {
        try {
            localStorage.setItem(keyFor(batchId), JSON.stringify(session));
        } catch {
            // storage full or blocked: the bench still works, it just won't remember
        }
    }, [batchId, session]);

    // The clock only ticks while a timer has been started and not yet put away
    const anyStarted = Object.values(session.timers).some(t => t.endsAt !== null);
    useEffect(() => {
        if (!anyStarted) return;
        const id = setInterval(() => setNow(Date.now()), TICK_MS);
        return () => clearInterval(id);
    }, [anyStarted]);

    const statusOf = useCallback((phase: string): TimerStatus => {
        const timer = session.timers[phase];
        return timer ? timerStatus(timer, now) : 'idle';
    }, [session.timers, now]);

    const leftOf = useCallback((phase: string): number => {
        const timer = session.timers[phase];
        return timer ? timeLeft(timer, now) : 0;
    }, [session.timers, now]);

    const finished = Object.keys(session.timers).filter(phase => statusOf(phase) === 'done');
    const anyFinished = finished.length > 0;

    // Sound the alarm as soon as a timer finishes, and again every few seconds until it is dismissed
    useEffect(() => {
        if (!anyFinished) { lastAlarm.current = 0; return; }
        if (now - lastAlarm.current >= ALARM_REPEAT_MS) {
            lastAlarm.current = now;
            playAlarm();
        }
    }, [anyFinished, now]);

    const update = useCallback((change: (s: BenchSession) => BenchSession) => setSession(prev => change(prev)), []);
    const updateTimer = useCallback((phase: string, change: (t: BenchSession['timers'][string]) => BenchSession['timers'][string]) => {
        setSession(prev => (prev.timers[phase] ? { ...prev, timers: { ...prev.timers, [phase]: change(prev.timers[phase]) } } : prev));
    }, []);

    return {
        session,
        now,
        finished,
        statusOf,
        leftOf,
        toggleWeighed: (id: string) => update(s => toggleWeighed(s, lines, id)),
        toggleAdded: (id: string) => update(s => toggleAdded(s, lines, id)),
        setMode: (mode: BenchMode) => update(s => ({ ...s, mode })),
        startTimer: (phase: string) => { prepareAlarm(); const t = Date.now(); setNow(t); updateTimer(phase, timer => startTimer(timer, t)); },
        pauseTimer: (phase: string) => { const t = Date.now(); setNow(t); updateTimer(phase, timer => pauseTimer(timer, t)); },
        resetTimer: (phase: string) => updateTimer(phase, resetTimer),
        adjustTimer: (phase: string, deltaMs: number) => { const t = Date.now(); updateTimer(phase, timer => adjustTimer(timer, deltaMs, t)); },
        startOver: () => { setSession(newSession(lines)); lastAlarm.current = 0; },
    };
}
