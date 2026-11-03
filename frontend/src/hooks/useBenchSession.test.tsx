import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ALARM_REPEAT_MS, useBenchSession } from './useBenchSession';
import { MINUTE } from '../lib/benchTimer';
import type { BenchLine } from '../lib/benchSession';

const mocks = vi.hoisted(() => ({ playAlarm: vi.fn(), prepareAlarm: vi.fn() }));
vi.mock('../lib/benchAlarm', () => ({ playAlarm: mocks.playAlarm, prepareAlarm: mocks.prepareAlarm }));

const line = (id: string, phase: string, grams: number): BenchLine => ({ id, name: id, inciName: null, phase, grams });
const LINES = [line('water', 'A', 140), line('oil', 'B', 40), line('pres', 'C', 1)];
const KEY = 'formularium.bench.b1';
const START = new Date('2026-11-08T10:00:00Z');

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
    localStorage.clear();
    mocks.playAlarm.mockReset();
    mocks.prepareAlarm.mockReset();
});
afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

const mount = (lines = LINES) => renderHook(() => useBenchSession('b1', lines));
const pass = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
// Time as a phone sees it: a second at a time, each tick drawn, instead of one big jump
const passSlowly = (ms: number) => { for (let elapsed = 0; elapsed < ms; elapsed += 1000) pass(1000); };

describe('remembering the bench', () => {
    it('saves every tick on this device and brings it back after a reload', () => {
        const first = mount();
        act(() => first.result.current.toggleWeighed('water'));
        act(() => first.result.current.toggleWeighed('oil'));
        act(() => first.result.current.setMode('timers'));
        first.unmount();

        const second = mount();
        expect(second.result.current.session.weighed).toEqual(['water', 'oil']);
        expect(second.result.current.session.mode).toBe('timers');
    });

    it('keeps each batch separate', () => {
        const a = renderHook(() => useBenchSession('b1', LINES));
        act(() => a.result.current.toggleWeighed('water'));
        const b = renderHook(() => useBenchSession('b2', LINES));
        expect(b.result.current.session.weighed).toEqual([]);
    });

    it('starts fresh, without breaking, when what was saved is damaged', () => {
        localStorage.setItem(KEY, '{not json');
        expect(mount().result.current.session.weighed).toEqual([]);
        localStorage.setItem(KEY, JSON.stringify({ weighed: 'water', added: 3, timers: 7 }));
        expect(mount().result.current.session.weighed).toEqual([]);
    });

    it('works even when the device will not let it save', () => {
        const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full'); });
        const { result } = mount();
        expect(() => act(() => result.current.toggleWeighed('water'))).not.toThrow();
        expect(result.current.session.weighed).toEqual(['water']);
        spy.mockRestore();
    });

    it('does not carry over ticks for ingredients that are no longer in the batch', () => {
        localStorage.setItem(KEY, JSON.stringify({ mode: 'weigh', weighed: ['water', 'removed'], added: [], timers: {} }));
        expect(mount().result.current.session.weighed).toEqual(['water']);
    });

    it('clears everything on "start over"', () => {
        const { result } = mount();
        act(() => result.current.toggleWeighed('water'));
        act(() => result.current.startTimer('A'));
        act(() => result.current.startOver());
        expect(result.current.session.weighed).toEqual([]);
        expect(result.current.statusOf('A')).toBe('idle');
        expect(JSON.parse(localStorage.getItem(KEY)!).weighed).toEqual([]);
    });
});

describe('phase timers', () => {
    it('starts at the phase\'s suggested length, and counts down', () => {
        const { result } = mount();
        expect(result.current.statusOf('A')).toBe('idle');
        expect(result.current.leftOf('A')).toBe(20 * MINUTE);
        expect(result.current.leftOf('C')).toBe(5 * MINUTE);

        act(() => result.current.startTimer('A'));
        expect(result.current.statusOf('A')).toBe('running');
        pass(3 * MINUTE);
        expect(result.current.leftOf('A')).toBe(17 * MINUTE);
        expect(result.current.statusOf('B')).toBe('idle'); // the others are untouched
    });

    it('wakes the sound up from the tap that starts a timer, so a later beep is allowed', () => {
        const { result } = mount();
        act(() => result.current.startTimer('A'));
        expect(mocks.prepareAlarm).toHaveBeenCalledTimes(1);
    });

    it('pauses and resumes where it left off', () => {
        const { result } = mount();
        act(() => result.current.startTimer('A'));
        pass(5 * MINUTE);
        act(() => result.current.pauseTimer('A'));
        expect(result.current.statusOf('A')).toBe('paused');
        pass(10 * MINUTE);
        expect(result.current.leftOf('A')).toBe(15 * MINUTE);
        act(() => result.current.startTimer('A'));
        pass(MINUTE);
        expect(result.current.leftOf('A')).toBe(14 * MINUTE);
    });

    it('changes the length of a timer that is not running, and resets it', () => {
        const { result } = mount();
        act(() => result.current.adjustTimer('A', 5 * MINUTE));
        expect(result.current.leftOf('A')).toBe(25 * MINUTE);
        act(() => result.current.startTimer('A'));
        act(() => result.current.adjustTimer('A', 5 * MINUTE)); // not while running
        expect(result.current.leftOf('A')).toBe(25 * MINUTE);
        act(() => result.current.resetTimer('A'));
        expect(result.current.statusOf('A')).toBe('idle');
        expect(result.current.leftOf('A')).toBe(25 * MINUTE);
    });

    it('carries on from the right time after a reload, even if the screen was off', () => {
        const first = mount();
        act(() => first.result.current.startTimer('A'));
        first.unmount();
        vi.setSystemTime(new Date(START.getTime() + 12 * MINUTE)); // twelve minutes pass with nothing running

        const second = mount();
        expect(second.result.current.statusOf('A')).toBe('running');
        expect(second.result.current.leftOf('A')).toBe(8 * MINUTE);
    });

    it('shows a timer that ran out while the page was closed as finished', () => {
        const first = mount();
        act(() => first.result.current.startTimer('C'));
        first.unmount();
        vi.setSystemTime(new Date(START.getTime() + 30 * MINUTE));
        const second = mount();
        expect(second.result.current.statusOf('C')).toBe('done');
        expect(second.result.current.finished).toEqual(['C']);
    });
});

describe('the alarm', () => {
    const startFiveMinuteTimer = () => {
        const hook = mount();
        act(() => hook.result.current.startTimer('C'));
        return hook;
    };

    it('stays quiet while a timer is running', () => {
        startFiveMinuteTimer();
        pass(4 * MINUTE);
        expect(mocks.playAlarm).not.toHaveBeenCalled();
    });

    it('sounds as soon as the timer finishes', () => {
        const { result } = startFiveMinuteTimer();
        pass(5 * MINUTE + 500);
        expect(result.current.statusOf('C')).toBe('done');
        expect(result.current.finished).toEqual(['C']);
        expect(mocks.playAlarm).toHaveBeenCalledTimes(1);
    });

    it('keeps sounding every few seconds until it is dealt with: one beep is easy to miss', () => {
        startFiveMinuteTimer();
        pass(5 * MINUTE + 500);
        passSlowly(ALARM_REPEAT_MS * 2);
        expect(mocks.playAlarm.mock.calls.length).toBeGreaterThanOrEqual(3);
    });

    it('stops when the timer is stopped', () => {
        const { result } = startFiveMinuteTimer();
        pass(5 * MINUTE + 500);
        act(() => result.current.resetTimer('C'));
        const sounded = mocks.playAlarm.mock.calls.length;
        passSlowly(ALARM_REPEAT_MS * 3);
        expect(mocks.playAlarm).toHaveBeenCalledTimes(sounded);
        expect(result.current.finished).toEqual([]);
    });

    it('sounds again for the next timer that finishes', () => {
        const { result } = startFiveMinuteTimer();
        pass(5 * MINUTE + 500);
        act(() => result.current.resetTimer('C'));
        mocks.playAlarm.mockClear();
        act(() => result.current.startTimer('C'));
        pass(5 * MINUTE + 500);
        expect(mocks.playAlarm).toHaveBeenCalledTimes(1);
    });
});
