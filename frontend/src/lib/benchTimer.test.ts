import { describe, expect, it } from 'vitest';
import { MINUTE, SECOND, adjustTimer, formatClock, isTimerState, newTimer, pauseTimer, resetTimer, startTimer, timeLeft, timerStatus } from './benchTimer';

const NOW = 1_000_000;

describe('a timer', () => {
    it('starts idle at its full length', () => {
        const t = newTimer(20);
        expect(t).toEqual({ totalMs: 20 * MINUTE, remainingMs: 20 * MINUTE, endsAt: null });
        expect(timerStatus(t, NOW)).toBe('idle');
        expect(timeLeft(t, NOW)).toBe(20 * MINUTE);
    });

    it('counts down from the moment it ends, not from ticks, so it stays right after the phone sleeps', () => {
        const running = startTimer(newTimer(20), NOW);
        expect(timerStatus(running, NOW)).toBe('running');
        expect(timeLeft(running, NOW)).toBe(20 * MINUTE);
        // the screen was off for 15 minutes: nothing ticked, but the answer is still right
        expect(timeLeft(running, NOW + 15 * MINUTE)).toBe(5 * MINUTE);
        expect(timerStatus(running, NOW + 15 * MINUTE)).toBe('running');
    });

    it('is done when its time is up, and never shows negative time', () => {
        const running = startTimer(newTimer(5), NOW);
        expect(timerStatus(running, NOW + 5 * MINUTE)).toBe('done');
        expect(timeLeft(running, NOW + 99 * MINUTE)).toBe(0);
    });

    it('pauses with what is left, and resumes from there', () => {
        const paused = pauseTimer(startTimer(newTimer(20), NOW), NOW + 8 * MINUTE);
        expect(paused).toMatchObject({ endsAt: null, remainingMs: 12 * MINUTE });
        expect(timerStatus(paused, NOW + 60 * MINUTE)).toBe('paused'); // time passing does not move a paused timer
        const resumed = startTimer(paused, NOW + 30 * MINUTE);
        expect(timeLeft(resumed, NOW + 30 * MINUTE)).toBe(12 * MINUTE);
        expect(timeLeft(resumed, NOW + 40 * MINUTE)).toBe(2 * MINUTE);
    });

    it('starting a timer that is already running changes nothing', () => {
        const running = startTimer(newTimer(20), NOW);
        expect(startTimer(running, NOW + MINUTE)).toBe(running);
    });

    it('pausing a timer that is not running changes nothing', () => {
        const idle = newTimer(20);
        expect(pauseTimer(idle, NOW)).toBe(idle);
    });

    it('starts again from the full length once it has finished', () => {
        const finished = startTimer(newTimer(5), NOW);
        const again = startTimer(finished, NOW + 6 * MINUTE);
        expect(timerStatus(again, NOW + 6 * MINUTE)).toBe('running');
        expect(timeLeft(again, NOW + 6 * MINUTE)).toBe(5 * MINUTE);
    });

    it('resets to its full length', () => {
        const reset = resetTimer(pauseTimer(startTimer(newTimer(20), NOW), NOW + 5 * MINUTE));
        expect(reset).toEqual(newTimer(20));
    });

    it('a timer paused right at the end counts as done', () => {
        const paused = pauseTimer(startTimer(newTimer(5), NOW), NOW + 5 * MINUTE);
        expect(timerStatus(paused, NOW + 6 * MINUTE)).toBe('done');
    });
});

describe('adjusting a timer', () => {
    it('lengthens or shortens one that has not started', () => {
        const t = adjustTimer(newTimer(20), 5 * MINUTE, NOW);
        expect(t).toMatchObject({ totalMs: 25 * MINUTE, remainingMs: 25 * MINUTE });
        expect(adjustTimer(t, -10 * MINUTE, NOW)).toMatchObject({ totalMs: 15 * MINUTE, remainingMs: 15 * MINUTE });
    });

    it('never goes below a minute', () => {
        expect(adjustTimer(newTimer(2), -10 * MINUTE, NOW)).toMatchObject({ totalMs: MINUTE, remainingMs: MINUTE });
    });

    it('moves what is left on a paused timer, within its length', () => {
        const paused = pauseTimer(startTimer(newTimer(20), NOW), NOW + 8 * MINUTE); // 12 min left
        expect(adjustTimer(paused, 5 * MINUTE, NOW)).toMatchObject({ totalMs: 25 * MINUTE, remainingMs: 17 * MINUTE });
        expect(adjustTimer(paused, -20 * MINUTE, NOW).remainingMs).toBe(SECOND); // not zero: that would read as finished
    });

    it('leaves a running timer alone', () => {
        const running = startTimer(newTimer(20), NOW);
        expect(adjustTimer(running, 5 * MINUTE, NOW + MINUTE)).toBe(running);
    });

    it('treats a finished timer as ready to be set again', () => {
        const finished = startTimer(newTimer(5), NOW);
        expect(adjustTimer(finished, 5 * MINUTE, NOW + 6 * MINUTE)).toEqual({ totalMs: 10 * MINUTE, remainingMs: 10 * MINUTE, endsAt: null });
    });
});

describe('formatClock', () => {
    it('shows minutes and seconds, and hours when there are any', () => {
        expect(formatClock(20 * MINUTE)).toBe('20:00');
        expect(formatClock(4 * MINUTE + 5 * SECOND)).toBe('4:05');
        expect(formatClock(59 * SECOND)).toBe('0:59');
        expect(formatClock(65 * MINUTE)).toBe('1:05:00');
    });

    it('rounds up, so it only reads 0:00 when the time is really up', () => {
        expect(formatClock(1)).toBe('0:01');
        expect(formatClock(999)).toBe('0:01');
        expect(formatClock(1001)).toBe('0:02');
        expect(formatClock(0)).toBe('0:00');
        expect(formatClock(-5000)).toBe('0:00');
    });
});

describe('isTimerState', () => {
    it('accepts what a timer looks like when saved, and refuses anything else', () => {
        expect(isTimerState(newTimer(5))).toBe(true);
        expect(isTimerState(startTimer(newTimer(5), NOW))).toBe(true);
        for (const bad of [null, undefined, 'x', 5, {}, { totalMs: 'a', remainingMs: 1, endsAt: null }, { totalMs: 1000, remainingMs: 1, endsAt: null }, { totalMs: MINUTE, remainingMs: -1, endsAt: null }, { totalMs: MINUTE, remainingMs: 1, endsAt: 'soon' }]) {
            expect(isTimerState(bad), JSON.stringify(bad)).toBe(false);
        }
    });
});
