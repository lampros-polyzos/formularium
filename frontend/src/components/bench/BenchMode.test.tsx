import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BenchMode from './BenchMode';
import type { BatchLine } from '../../types/batches';

const mocks = vi.hoisted(() => ({ playAlarm: vi.fn(), prepareAlarm: vi.fn(), request: vi.fn(), release: vi.fn() }));
vi.mock('../../lib/benchAlarm', () => ({ playAlarm: mocks.playAlarm, prepareAlarm: mocks.prepareAlarm }));

const line = (id: string, name: string, phase: string, grams: number, inci: string | null = null): BatchLine =>
    ({ id, batch_id: 'b1', ingredient_id: id, name, inci_name: inci, phase, percentage: grams / 2, planned_g: grams, actual_g: grams });
const LINES = [
    line('water', 'Distilled Water', 'A', 140, 'Aqua'),
    line('gly', 'Glycerin', 'A', 10),
    line('oil', 'Jojoba Oil', 'B', 36),
    line('emul', 'Olivem 1000', 'B', 8),
    line('pres', 'Euxyl PE 9010', 'C', 1.9),
    line('vite', 'Vitamin E', 'C', 0.5),
];
const BATCH = { id: 'b1', name: 'Day Cream', lot_number: '261108-1' };
const onExit = vi.fn();

const open = (lines = LINES) => render(<BenchMode batch={BATCH} lines={lines} onExit={onExit} />);
const row = (name: RegExp | string) => screen.getByRole('checkbox', { name });
const tab = (name: RegExp) => screen.getByRole('tab', { name });
const weighAll = (names = LINES.map(l => l.name)) => { for (const name of names) fireEvent.click(row(new RegExp(name))); };

beforeEach(() => {
    localStorage.clear();
    mocks.playAlarm.mockReset();
    mocks.prepareAlarm.mockReset();
    onExit.mockReset();
    mocks.release.mockReset().mockResolvedValue(undefined);
    mocks.request.mockReset().mockResolvedValue({ release: mocks.release });
    Object.defineProperty(navigator, 'wakeLock', { value: { request: mocks.request }, configurable: true });
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));
});
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    Reflect.deleteProperty(navigator, 'wakeLock');
});

describe('weighing', () => {
    it('shows each ingredient with its weight as the biggest thing, grouped by phase', () => {
        open();
        expect(screen.getByRole('heading', { name: 'Day Cream' })).toBeInTheDocument();
        expect(screen.getByText(/Lot 261108-1/)).toBeInTheDocument();
        const phases = screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent);
        expect(phases).toEqual(['Phase A · Water phase', 'Phase B · Oil phase', 'Phase C · Cool-down phase']);
        expect(row(/Distilled Water/)).toHaveTextContent('140g');
        expect(row(/Euxyl PE 9010/)).toHaveTextContent('1.9g'); // no trailing zeros
        expect(row(/Distilled Water/)).toHaveAttribute('aria-checked', 'false');
    });

    it('ticks an ingredient as weighed, and keeps a running total', () => {
        open();
        expect(screen.getByLabelText('Weighed total')).toHaveTextContent('0 g');
        fireEvent.click(row(/Distilled Water/));
        fireEvent.click(row(/Jojoba Oil/));
        expect(row(/Distilled Water/)).toHaveAttribute('aria-checked', 'true');
        expect(screen.getByLabelText('Weighed total')).toHaveTextContent('176 g');
        expect(screen.getByLabelText('Weighed total').closest('footer')).toHaveTextContent('of 196.4 g'); // the whole batch
    });

    it('takes a tick back', () => {
        open();
        fireEvent.click(row(/Distilled Water/));
        fireEvent.click(row(/Distilled Water/));
        expect(row(/Distilled Water/)).toHaveAttribute('aria-checked', 'false');
        expect(screen.getByLabelText('Weighed total')).toHaveTextContent('0 g');
    });

    it('shows how far along each phase is and how many are weighed', () => {
        open();
        fireEvent.click(row(/Glycerin/));
        const phaseA = screen.getByRole('region', { name: 'Phase A' });
        expect(within(phaseA).getByText('10 / 150 g')).toBeInTheDocument();
        expect(tab(/Weigh/)).toHaveTextContent('1/6');
        expect(screen.getByRole('progressbar', { name: 'Weighed' })).toHaveAttribute('aria-valuenow', '1');
    });

    it('lets you leave', () => {
        open();
        fireEvent.click(screen.getByRole('button', { name: 'Leave bench mode' }));
        expect(onExit).toHaveBeenCalledTimes(1);
    });

    it('says so when there is nothing to make', () => {
        open([]);
        expect(screen.getByText(/no ingredients to make/)).toBeInTheDocument();
    });
});

describe('the checker: making sure nothing is left out', () => {
    it('switches to it by itself as soon as the last ingredient is weighed', () => {
        open();
        weighAll(LINES.slice(0, -1).map(l => l.name));
        expect(tab(/Weigh/)).toHaveAttribute('aria-selected', 'true');
        fireEvent.click(row(/Vitamin E/));
        expect(tab(/Add to mix/)).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByText(/Everything is weighed\. Tick each one as it goes into the mix/)).toBeInTheDocument();
    });

    it('does not let you add something that has not been weighed', () => {
        open();
        fireEvent.click(row(/Distilled Water/));
        fireEvent.click(tab(/Add to mix/));
        expect(screen.getByText(/5 ingredients are not weighed yet/)).toBeInTheDocument();
        expect(row(/Distilled Water/)).toBeEnabled();
        expect(row(/Glycerin/)).toBeDisabled();
        expect(within(row(/Glycerin/)).getByText('Weigh it first')).toBeInTheDocument();
        fireEvent.click(row(/Glycerin/));
        expect(row(/Glycerin/)).toHaveAttribute('aria-checked', 'false');
    });

    it('counts what has gone in, and lists exactly what is still to add', () => {
        open();
        weighAll();
        fireEvent.click(row(/Distilled Water/));
        fireEvent.click(row(/Glycerin/));
        expect(screen.getByText('Added 2 of 6')).toBeInTheDocument();
        expect(screen.getByRole('status')).toHaveTextContent('Still to add: Jojoba Oil, Olivem 1000, Euxyl PE 9010 and 1 more');
        expect(tab(/Add to mix/)).toHaveTextContent('2/6');
    });

    it('names the last things still to add, so you know what is missing', () => {
        open();
        weighAll();
        for (const l of LINES.slice(0, 4)) fireEvent.click(row(new RegExp(l.name)));
        expect(screen.getByRole('status')).toHaveTextContent('Still to add: Euxyl PE 9010, Vitamin E');
    });

    it('is finished only when every ingredient has gone in, and says nothing was left out', () => {
        open();
        weighAll();
        for (const l of LINES.slice(0, -1)) fireEvent.click(row(new RegExp(l.name)));
        expect(screen.queryByRole('region', { name: 'Finished' })).not.toBeInTheDocument();
        fireEvent.click(row(/Vitamin E/));
        const done = screen.getByRole('region', { name: 'Finished' });
        expect(done).toHaveTextContent('Everything is in the mix');
        expect(done).toHaveTextContent('Nothing was left out');
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
        fireEvent.click(within(done).getByRole('button', { name: 'Back to the batch' }));
        expect(onExit).toHaveBeenCalledTimes(1);
    });

    it('un-weighing something you already added takes it back out of the mix list', () => {
        open();
        weighAll();
        fireEvent.click(row(/Distilled Water/)); // added
        fireEvent.click(tab(/Weigh/));
        fireEvent.click(row(/Distilled Water/)); // not weighed after all
        fireEvent.click(tab(/Add to mix/));
        expect(row(/Distilled Water/)).toBeDisabled();
        expect(row(/Distilled Water/)).toHaveAttribute('aria-checked', 'false');
        expect(screen.getByText('Added 0 of 6')).toBeInTheDocument();
    });

    it('keeps the order of the phases, with what to do in each', () => {
        open();
        weighAll();
        expect(screen.getByText('Heat to 70-75 °C and hold, stirring')).toBeInTheDocument();
        expect(screen.getByText('Add below 40-45 °C and stir well')).toBeInTheDocument();
    });
});

describe('remembering', () => {
    it('keeps your ticks and where you were if the page is closed and opened again', () => {
        const first = open();
        weighAll();
        fireEvent.click(row(/Distilled Water/));
        first.unmount();

        open();
        expect(tab(/Add to mix/)).toHaveAttribute('aria-selected', 'true');
        expect(row(/Distilled Water/)).toHaveAttribute('aria-checked', 'true');
        expect(screen.getByText('Added 1 of 6')).toBeInTheDocument();
    });

    // (Without the app's dialogs around it, asking falls back to the browser's, which the test stubs; it answers a moment later)
    const answered = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

    it('starts over when asked, after checking', async () => {
        open();
        weighAll();
        fireEvent.click(screen.getByRole('button', { name: 'Start over' }));
        await answered();
        expect(confirm).toHaveBeenCalled();
        expect(tab(/Weigh/)).toHaveAttribute('aria-selected', 'true'); // it was on the checker; a fresh start means weighing again
        fireEvent.click(tab(/Weigh/));
        expect(screen.getByLabelText('Weighed total')).toHaveTextContent('0 g');
    });

    it('does not start over if you change your mind', async () => {
        vi.stubGlobal('confirm', vi.fn().mockReturnValue(false));
        open();
        weighAll();
        fireEvent.click(screen.getByRole('button', { name: 'Start over' }));
        await answered();
        expect(tab(/Add to mix/)).toHaveAttribute('aria-selected', 'true');
    });
});

describe('phase timers', () => {
    beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-08T10:00:00Z')); });

    const seconds = (n: number) => { for (let i = 0; i < n; i++) act(() => { vi.advanceTimersByTime(1000); }); };
    const timer = (phase: string) => screen.getByRole('region', { name: `Phase ${phase} timer` });

    it('has a timer for each phase, with advice and a sensible length', () => {
        open();
        fireEvent.click(tab(/Timers/));
        expect(screen.getAllByRole('timer').map(t => t.textContent)).toEqual(['20:00', '20:00', '5:00']);
        expect(within(timer('A')).getByText('Heat to 70-75 °C and hold, stirring')).toBeInTheDocument();
    });

    it('starts, counts down in big numbers, pauses and resumes', () => {
        open();
        fireEvent.click(tab(/Timers/));
        fireEvent.click(within(timer('C')).getByRole('button', { name: /Start/ }));
        expect(mocks.prepareAlarm).toHaveBeenCalled();
        seconds(90);
        expect(within(timer('C')).getByRole('timer')).toHaveTextContent('3:30');

        fireEvent.click(within(timer('C')).getByRole('button', { name: /Pause/ }));
        seconds(60);
        expect(within(timer('C')).getByRole('timer')).toHaveTextContent('3:30');
        fireEvent.click(within(timer('C')).getByRole('button', { name: /Resume/ }));
        seconds(30);
        expect(within(timer('C')).getByRole('timer')).toHaveTextContent('3:00');
    });

    it('lets you change the time before starting, and reset it afterwards', () => {
        open();
        fireEvent.click(tab(/Timers/));
        fireEvent.click(within(timer('C')).getByRole('button', { name: '+5 min' }));
        fireEvent.click(within(timer('C')).getByRole('button', { name: '−1 min' }));
        expect(within(timer('C')).getByRole('timer')).toHaveTextContent('9:00');
        fireEvent.click(within(timer('C')).getByRole('button', { name: /Start/ }));
        expect(within(timer('C')).queryByRole('button', { name: '+5 min' })).not.toBeInTheDocument(); // not while it is running
        seconds(10);
        fireEvent.click(within(timer('C')).getByRole('button', { name: /Pause/ }));
        fireEvent.click(within(timer('C')).getByRole('button', { name: 'Reset phase C timer' }));
        expect(within(timer('C')).getByRole('timer')).toHaveTextContent('9:00');
    });

    it('shows the running timer in the top bar on every tab, and goes to the timers when tapped', () => {
        open();
        fireEvent.click(tab(/Timers/));
        fireEvent.click(within(timer('A')).getByRole('button', { name: /Start/ }));
        fireEvent.click(tab(/Weigh/));
        const pill = screen.getByRole('button', { name: /Phase A timer: 20:00 left/ });
        seconds(60);
        expect(screen.getByRole('button', { name: /Phase A timer: 19:00 left/ })).toBeInTheDocument();
        fireEvent.click(pill);
        expect(tab(/Timers/)).toHaveAttribute('aria-selected', 'true');
    });

    it('shows the soonest-ending timer when several are running', () => {
        open();
        fireEvent.click(tab(/Timers/));
        fireEvent.click(within(timer('A')).getByRole('button', { name: /Start/ }));
        fireEvent.click(within(timer('C')).getByRole('button', { name: /Start/ }));
        expect(screen.getByRole('button', { name: /Phase C timer: 5:00 left/ })).toBeInTheDocument();
    });

    it('raises the alarm when a timer ends, on whichever tab you are on, until you stop it', () => {
        open();
        fireEvent.click(tab(/Timers/));
        fireEvent.click(within(timer('C')).getByRole('button', { name: /Start/ }));
        fireEvent.click(tab(/Weigh/));
        seconds(5 * 60 + 1);

        expect(screen.getByRole('alert')).toHaveTextContent('Phase C timer is done');
        expect(mocks.playAlarm).toHaveBeenCalled();
        fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Open' }));
        expect(within(timer('C')).getByText("Time's up")).toBeInTheDocument();

        fireEvent.click(within(timer('C')).getByRole('button', { name: 'Stop alarm' }));
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(within(timer('C')).getByRole('timer')).toHaveTextContent('5:00');
        const sounded = mocks.playAlarm.mock.calls.length;
        seconds(30);
        expect(mocks.playAlarm).toHaveBeenCalledTimes(sounded);
    });

    it('names every timer that is done', () => {
        open();
        fireEvent.click(tab(/Timers/));
        fireEvent.click(within(timer('C')).getByRole('button', { name: '−5 min' })); // 1 minute
        fireEvent.click(within(timer('C')).getByRole('button', { name: /Start/ }));
        seconds(61);
        expect(screen.getByRole('alert')).toHaveTextContent('Phase C timer is done');
    });

    it('keeps a timer going across a reload', () => {
        const first = open();
        fireEvent.click(tab(/Timers/));
        fireEvent.click(within(timer('A')).getByRole('button', { name: /Start/ }));
        seconds(120);
        first.unmount();
        vi.setSystemTime(new Date(Date.now() + 3 * 60 * 1000));

        open();
        expect(within(timer('A')).getByRole('timer')).toHaveTextContent('15:00');
    });
});

describe('the screen', () => {
    it('is asked to stay awake while you work, and let go when you leave', async () => {
        const view = open();
        await act(async () => { await Promise.resolve(); });
        expect(mocks.request).toHaveBeenCalledWith('screen');
        view.unmount();
        await act(async () => { await Promise.resolve(); });
        expect(mocks.release).toHaveBeenCalled();
    });

    it('works on a phone that cannot keep the screen awake', () => {
        Reflect.deleteProperty(navigator, 'wakeLock');
        expect(() => open()).not.toThrow();
        expect(screen.getByRole('region', { name: 'Bench mode' })).toBeInTheDocument();
    });

    it('covers the whole screen, above the rest of the app', () => {
        open();
        const bench = screen.getByRole('region', { name: 'Bench mode' });
        expect(bench.classList.contains('fixed')).toBe(true);
        expect(bench.classList.contains('inset-0')).toBe(true);
    });
});
