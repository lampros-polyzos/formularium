import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BatchesPage from './BatchesPage';
import BatchDetailPage from './BatchDetailPage';
import { isoDate } from '../lib/batches';

const mocks = vi.hoisted(() => ({
    listBatches: vi.fn(),
    getBatch: vi.fn(),
    completeCheck: vi.fn(),
    downloadTextFile: vi.fn(),
}));

vi.mock('../lib/batches', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../lib/batches')>()),
    listBatches: mocks.listBatches,
    getBatch: mocks.getBatch,
    completeCheck: mocks.completeCheck,
    countDueChecks: vi.fn().mockResolvedValue(0),
}));
vi.mock('../lib/accountData', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../lib/accountData')>()),
    downloadTextFile: mocks.downloadTextFile,
}));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: null, session: null, username: null, isLoading: false }) }));
vi.mock('../contexts/SettingsContext', () => ({
    useSettings: () => ({ currency: '$', setCurrency: vi.fn(), dateFormat: 'en-US', setDateFormat: vi.fn(), warningDays: 30, setWarningDays: vi.fn(), formatDate: (d: string) => d }),
}));

const day = (offset: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return isoDate(d);
};
const check = (id: string, label: string, offset: number, extra: Record<string, unknown> = {}) => ({
    id, batch_id: 'b1', label, due_on: day(offset), checked_at: null, result: null, observations: [], measured_ph: null, notes: null, ...extra,
});
const batch = (over: Record<string, unknown> = {}) => ({
    id: 'b1', formulation_id: 'f1', name: 'Day Cream', lot_number: '261103-1', batch_size_g: 100, made_on: day(-8), status: 'active',
    target_ph: 5.5, measured_ph: null, final_weight_g: null, notes: null, stash_deducted: true, created_at: '2026-11-03T10:00:00Z', ...over,
});

const settle = () => act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });

beforeEach(() => {
    Object.values(mocks).forEach(m => m.mockReset());
    mocks.completeCheck.mockResolvedValue(undefined);
});
afterEach(cleanup);

describe('answering check-ins from the Batches page', () => {
    const render_ = async () => {
        render(<MemoryRouter><BatchesPage /></MemoryRouter>);
        await settle();
    };

    it('lets you answer "how does it look?" right in the due list, then updates the list', async () => {
        const first = [{ ...batch(), batch_checks: [check('c1', '1 week', -1), check('c2', '4 weeks', 20)] }];
        const after = [{ ...batch(), batch_checks: [check('c1', '1 week', -1, { checked_at: new Date().toISOString(), result: 'good' }), check('c2', '4 weeks', 20)] }];
        mocks.listBatches.mockResolvedValueOnce(first).mockResolvedValue(after);
        await render_();

        const due = screen.getByRole('region', { name: /Check-ins due \(1\)/ });
        fireEvent.click(within(due).getByRole('button', { name: 'Looks good' }));
        await waitFor(() => expect(screen.queryByRole('region', { name: /Check-ins due/ })).not.toBeInTheDocument());

        expect(mocks.completeCheck).toHaveBeenCalledWith('c1', { result: 'good', observations: [], measured_ph: null, notes: '' });
        expect(mocks.listBatches).toHaveBeenCalledTimes(2);
        expect(screen.getByText(/1 of 2 check-ins done/)).toBeInTheDocument(); // the progress on the card caught up too
    });

    it('records a problem with the details, and keeps the rest of the list', async () => {
        mocks.listBatches.mockResolvedValue([{ ...batch(), batch_checks: [check('c1', '1 week', 0)] }]);
        await render_();
        fireEvent.click(screen.getByRole('button', { name: 'A problem' }));
        fireEvent.click(screen.getByLabelText('Mold, spots or fuzz'));
        expect(screen.getByRole('alert')).toHaveTextContent(/Stop using this batch/);
        expect(screen.getByRole('link', { name: /Why: mold, spots or fuzz/i })).toHaveAttribute('href', '/learn?q=mold');
        fireEvent.click(screen.getByRole('button', { name: 'Save check-in' }));
        await waitFor(() => expect(mocks.completeCheck).toHaveBeenCalled());
        expect(mocks.completeCheck.mock.calls[0][1]).toMatchObject({ result: 'failed', observations: ['mold'] });
    });
});

describe('calendar reminders on a batch', () => {
    async function open(data: { batch?: Record<string, unknown>; checks?: unknown[] } = {}) {
        mocks.getBatch.mockResolvedValue({
            batch: batch(data.batch), lines: [], usage: [],
            checks: data.checks ?? [check('c1', '24 hours', -7, { checked_at: '2026-11-04T09:00:00Z', result: 'good' }), check('c2', '1 week', 0), check('c3', '4 weeks', 20)],
        });
        render(
            <MemoryRouter initialEntries={['/batches/b1']}>
                <Routes><Route path="/batches/:id" element={<BatchDetailPage />} /></Routes>
            </MemoryRouter>
        );
        await settle();
    }

    it('offers a calendar file with a reminder for each check-in still to do', async () => {
        await open();
        fireEvent.click(screen.getByRole('button', { name: /Add to my calendar/ }));
        expect(mocks.downloadTextFile).toHaveBeenCalledTimes(1);
        const [filename, content, type] = mocks.downloadTextFile.mock.calls[0];
        expect(filename).toBe('Day_Cream_261103-1_checkins.ics');
        expect(type).toBe('text/calendar');
        expect(content).toContain('UID:check-c2@formularium');
        expect(content).toContain('UID:check-c3@formularium');
        expect(content).not.toContain('check-c1@'); // already done
        expect(content).toContain(`${window.location.origin}/batches/b1`);
    });

    it('is not offered when every check-in is done', async () => {
        await open({ checks: [check('c1', '24 hours', -7, { checked_at: '2026-11-04T09:00:00Z', result: 'good' })] });
        expect(screen.queryByRole('button', { name: /Add to my calendar/ })).not.toBeInTheDocument();
    });

    it('is not offered for a batch that is no longer in progress', async () => {
        await open({ batch: { status: 'discarded' } });
        expect(screen.queryByRole('button', { name: /Add to my calendar/ })).not.toBeInTheDocument();
    });

    it('shows why a recorded check-in noticed what it did', async () => {
        await open({ checks: [check('c1', '1 week', -1, { checked_at: '2026-11-04T09:00:00Z', result: 'minor', observations: ['grainy'] })] });
        expect(screen.getByRole('link', { name: /Why: grainy or gritty/i })).toHaveAttribute('href', '/learn?q=grainy');
    });
});
