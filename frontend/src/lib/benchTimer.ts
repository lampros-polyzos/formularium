// Countdown timers for the bench. A running timer remembers the moment it ends rather than counting down, so it
// stays right when the phone's screen locks, the tab sleeps or the page is reloaded.

export interface TimerState {
    /** The length the timer is set to. */
    totalMs: number;
    /** What is left while it is not running. */
    remainingMs: number;
    /** When it ends, while running; null otherwise. */
    endsAt: number | null;
}

export type TimerStatus = 'idle' | 'running' | 'paused' | 'done';

export const SECOND = 1000;
export const MINUTE = 60 * SECOND;

export const newTimer = (minutes: number): TimerState => ({ totalMs: minutes * MINUTE, remainingMs: minutes * MINUTE, endsAt: null });

export function timeLeft(timer: TimerState, now: number): number {
    return timer.endsAt === null ? timer.remainingMs : Math.max(timer.endsAt - now, 0);
}

export function timerStatus(timer: TimerState, now: number): TimerStatus {
    if (timer.endsAt !== null) return timer.endsAt - now <= 0 ? 'done' : 'running';
    if (timer.remainingMs <= 0) return 'done';
    return timer.remainingMs < timer.totalMs ? 'paused' : 'idle';
}

/** Starts, resumes, or (after it has finished) starts again from the full length. */
export function startTimer(timer: TimerState, now: number): TimerState {
    if (timerStatus(timer, now) === 'done') return { ...timer, remainingMs: timer.totalMs, endsAt: now + timer.totalMs };
    if (timer.endsAt !== null) return timer;
    return { ...timer, endsAt: now + timer.remainingMs };
}

export function pauseTimer(timer: TimerState, now: number): TimerState {
    if (timer.endsAt === null) return timer;
    return { ...timer, remainingMs: timeLeft(timer, now), endsAt: null };
}

export const resetTimer = (timer: TimerState): TimerState => ({ ...timer, remainingMs: timer.totalMs, endsAt: null });

/** Makes a timer that is not running longer or shorter, never below a minute. A running timer is left alone. */
export function adjustTimer(timer: TimerState, deltaMs: number, now: number): TimerState {
    const status = timerStatus(timer, now);
    if (status === 'running') return timer;
    const totalMs = Math.max(timer.totalMs + deltaMs, MINUTE);
    if (status === 'paused') return { totalMs, remainingMs: Math.min(Math.max(timer.remainingMs + deltaMs, SECOND), totalMs), endsAt: null };
    return { totalMs, remainingMs: totalMs, endsAt: null };
}

/** "20:00", "4:05", or "1:05:00" for an hour or more. Rounds up so it only reads 0:00 when it is really over. */
export function formatClock(ms: number): string {
    const total = Math.ceil(Math.max(ms, 0) / SECOND);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

/** Whether a stored value looks like a timer, so a damaged save never breaks the bench. */
export function isTimerState(value: unknown): value is TimerState {
    if (!value || typeof value !== 'object') return false;
    const t = value as Record<string, unknown>;
    return Number.isFinite(t.totalMs) && (t.totalMs as number) >= MINUTE
        && Number.isFinite(t.remainingMs) && (t.remainingMs as number) >= 0
        && (t.endsAt === null || Number.isFinite(t.endsAt));
}
