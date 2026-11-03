import { describe, expect, it } from 'vitest';
import {
    allAdded, allWeighed, groupByPhase, newSession, phaseGuide, phasesOf, restoreSession, stillToAdd, stillToWeigh,
    toggleAdded, toggleWeighed, totalGrams, weighedGrams, type BenchLine, type BenchSession,
} from './benchSession';
import { MINUTE, newTimer, startTimer } from './benchTimer';

const line = (id: string, phase: string, grams: number, name = id): BenchLine => ({ id, name, inciName: null, phase, grams });
const LINES = [line('water', 'A', 140), line('gly', 'A', 10), line('oil', 'B', 36), line('emul', 'B', 8), line('pres', 'C', 2), line('vite', 'C', 1)];
const NOW = 1_000_000;

describe('phases', () => {
    it('lists the phases in use, in order', () => {
        expect(phasesOf(LINES)).toEqual(['A', 'B', 'C']);
        expect(phasesOf([line('x', 'C', 1), line('y', 'A', 1)])).toEqual(['A', 'C']);
        expect(phasesOf([])).toEqual([]);
    });

    it('groups ingredients by phase, keeping their order', () => {
        const groups = groupByPhase(LINES);
        expect(groups.map(g => g.phase)).toEqual(['A', 'B', 'C']);
        expect(groups[1].lines.map(l => l.id)).toEqual(['oil', 'emul']);
    });

    it('gives heating advice only when there is an oil phase to heat', () => {
        const heated = phaseGuide('A', ['A', 'B', 'C']);
        expect(heated.hint).toMatch(/70-75/);
        expect(heated.minutes).toBe(20);
        const toner = phaseGuide('A', ['A', 'C']);
        expect(toner.hint).not.toMatch(/70/);
        expect(toner.minutes).toBe(5);
        expect(phaseGuide('B', ['B', 'C']).hint).toMatch(/70-75/); // a waterless butter still melts
        expect(phaseGuide('C', ['A', 'C']).hint).toMatch(/below 40-45/);
        expect(phaseGuide('D', ['A', 'D'])).toMatchObject({ name: 'Phase D', minutes: 5 });
    });
});

describe('a new session', () => {
    it('starts at the weighing stage with nothing ticked and a timer for each phase', () => {
        const s = newSession(LINES);
        expect(s.mode).toBe('weigh');
        expect(s.weighed).toEqual([]);
        expect(s.added).toEqual([]);
        expect(Object.keys(s.timers)).toEqual(['A', 'B', 'C']);
        expect(s.timers.A.totalMs).toBe(20 * MINUTE);
        expect(s.timers.C.totalMs).toBe(5 * MINUTE);
    });
});

describe('weighing', () => {
    it('ticks and unticks an ingredient, and keeps a running total', () => {
        let s = newSession(LINES);
        expect(weighedGrams(LINES, s)).toBe(0);
        s = toggleWeighed(s, LINES, 'water');
        s = toggleWeighed(s, LINES, 'oil');
        expect(weighedGrams(LINES, s)).toBe(176);
        expect(totalGrams(LINES)).toBe(197);
        expect(stillToWeigh(LINES, s).map(l => l.id)).toEqual(['gly', 'emul', 'pres', 'vite']);
        s = toggleWeighed(s, LINES, 'water');
        expect(weighedGrams(LINES, s)).toBe(36);
    });

    it('adds up cleanly, without floating-point crumbs', () => {
        const small = [line('a', 'A', 0.1), line('b', 'A', 0.2), line('c', 'A', 0.7)];
        const s = small.reduce((acc, l) => toggleWeighed(acc, small, l.id), newSession(small));
        expect(weighedGrams(small, s)).toBe(1);
        expect(totalGrams(small)).toBe(1);
    });

    it('moves on to the checker as soon as the last ingredient is weighed', () => {
        let s = newSession(LINES);
        for (const l of LINES.slice(0, -1)) s = toggleWeighed(s, LINES, l.id);
        expect(s.mode).toBe('weigh');
        s = toggleWeighed(s, LINES, 'vite');
        expect(allWeighed(LINES, s)).toBe(true);
        expect(s.mode).toBe('add');
    });

    it('does not pull you away from the timers if you are looking at them', () => {
        let s: BenchSession = { ...newSession(LINES), mode: 'timers' };
        for (const l of LINES) s = toggleWeighed(s, LINES, l.id);
        expect(s.mode).toBe('timers');
    });

    it('unticking something already added takes it out of the mix list too', () => {
        let s = newSession(LINES);
        s = toggleWeighed(s, LINES, 'water');
        s = toggleAdded(s, LINES, 'water');
        expect(s.added).toEqual(['water']);
        s = toggleWeighed(s, LINES, 'water');
        expect(s.weighed).toEqual([]);
        expect(s.added).toEqual([]);
    });

    it('ignores an ingredient that is not in the batch', () => {
        const s = newSession(LINES);
        expect(toggleWeighed(s, LINES, 'nope')).toBe(s);
    });

    it('an empty batch is never "all weighed"', () => {
        expect(allWeighed([], newSession([]))).toBe(false);
        expect(allAdded([], newSession([]))).toBe(false);
    });
});

describe('adding to the mix: the check that nothing is left out', () => {
    const allWeighedSession = () => LINES.reduce((acc, l) => toggleWeighed(acc, LINES, l.id), newSession(LINES));

    it('only lets you add what has been weighed', () => {
        const s = newSession(LINES);
        expect(toggleAdded(s, LINES, 'water')).toBe(s);
        const weighed = toggleWeighed(s, LINES, 'water');
        expect(toggleAdded(weighed, LINES, 'water').added).toEqual(['water']);
    });

    it('lists exactly what is still to add, so nothing is forgotten', () => {
        let s = allWeighedSession();
        expect(stillToAdd(LINES, s)).toHaveLength(6);
        s = toggleAdded(s, LINES, 'water');
        s = toggleAdded(s, LINES, 'gly');
        s = toggleAdded(s, LINES, 'oil');
        expect(stillToAdd(LINES, s).map(l => l.id)).toEqual(['emul', 'pres', 'vite']);
        expect(allAdded(LINES, s)).toBe(false);
    });

    it('is complete only when every ingredient has gone in', () => {
        let s = allWeighedSession();
        for (const l of LINES.slice(0, -1)) s = toggleAdded(s, LINES, l.id);
        expect(allAdded(LINES, s)).toBe(false);
        s = toggleAdded(s, LINES, 'vite');
        expect(allAdded(LINES, s)).toBe(true);
        expect(stillToAdd(LINES, s)).toEqual([]);
    });

    it('lets you take back an ingredient you ticked by mistake', () => {
        let s = allWeighedSession();
        s = toggleAdded(s, LINES, 'oil');
        s = toggleAdded(s, LINES, 'oil');
        expect(s.added).toEqual([]);
    });

    it('does not tick something that is not in the batch', () => {
        const s = allWeighedSession();
        expect(toggleAdded(s, LINES, 'nope')).toBe(s);
    });
});

describe('restoring a saved session', () => {
    it('gives a fresh one when nothing usable was saved', () => {
        for (const raw of [null, undefined, 'x', 5, []]) expect(restoreSession(raw, LINES)).toEqual(newSession(LINES));
    });

    it('brings back ticks, the stage and the timers', () => {
        const saved = {
            mode: 'add', weighed: ['water', 'gly'], added: ['water'],
            timers: { A: startTimer(newTimer(25), NOW) },
        };
        const s = restoreSession(JSON.parse(JSON.stringify(saved)), LINES);
        expect(s.mode).toBe('add');
        expect(s.weighed).toEqual(['water', 'gly']);
        expect(s.added).toEqual(['water']);
        expect(s.timers.A.totalMs).toBe(25 * MINUTE);
        expect(s.timers.A.endsAt).toBe(NOW + 25 * MINUTE);
        expect(s.timers.B.totalMs).toBe(20 * MINUTE); // the others stay as they were
    });

    it('drops ingredients that are no longer in the batch, and repeats', () => {
        const s = restoreSession({ weighed: ['water', 'gone', 'water', 7], added: ['water', 'gone'] }, LINES);
        expect(s.weighed).toEqual(['water']);
        expect(s.added).toEqual(['water']);
    });

    it('never keeps something as added that is not weighed', () => {
        const s = restoreSession({ weighed: ['water'], added: ['water', 'oil'] }, LINES);
        expect(s.added).toEqual(['water']);
    });

    it('ignores damaged timers and unknown stages', () => {
        const s = restoreSession({ mode: 'dance', timers: { A: { totalMs: 'x' }, Z: newTimer(5) } }, LINES);
        expect(s.mode).toBe('weigh');
        expect(s.timers.A).toEqual(newTimer(20));
        expect(s.timers).not.toHaveProperty('Z');
    });
});
