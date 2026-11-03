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
    updateBatch: vi.fn(),
    voidBatch: vi.fn(),
    addCheck: vi.fn(),
}));

vi.mock('../lib/batches', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../lib/batches')>()),
    listBatches: mocks.listBatches,
    getBatch: mocks.getBatch,
    completeCheck: mocks.completeCheck,
    updateBatch: mocks.updateBatch,
    voidBatch: mocks.voidBatch,
    addCheck: mocks.addCheck,
    countDueChecks: vi.fn().mockResolvedValue(0),
}));
vi.mock('../lib/supabase', () => ({ supabase: { auth: { signOut: vi.fn() }, from: vi.fn(), channel: vi.fn(), removeChannel: vi.fn() } }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: null, session: null, username: null, isLoading: false }) }));
vi.mock('../contexts/SettingsContext', () => ({
    useSettings: () => ({ currency: '$', setCurrency: vi.fn(), dateFormat: 'en-US', setDateFormat: vi.fn(), warningDays: 30, setWarningDays: vi.fn(), formatDate: (d: string) => d }),
}));

// happy-dom has no confirm dialog
const confirmDialog = vi.fn();
Object.defineProperty(window, 'confirm', { value: confirmDialog, configurable: true, writable: true });

const day = (offset: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return isoDate(d);
};

const check = (id: string, label: string, offset: number, extra: Record<string, unknown> = {}) => ({
    id, batch_id: 'b1', label, due_on: day(offset), checked_at: null, result: null, observations: [], measured_ph: null, notes: null, ...extra,
});

const batch = (over: Record<string, unknown> = {}) => ({
    id: 'b1', formulation_id: 'f1', name: 'Day Cream', lot_number: '261103-1', batch_size_g: 100, made_on: day(-2), status: 'active',
    target_ph: 5.5, measured_ph: null, final_weight_g: null, notes: null, stash_deducted: true, created_at: '2026-11-03T10:00:00Z', ...over,
});

beforeEach(() => {
    confirmDialog.mockReset();
    Object.values(mocks).forEach(m => m.mockReset());
    mocks.completeCheck.mockResolvedValue(undefined);
    mocks.updateBatch.mockResolvedValue(undefined);
    mocks.voidBatch.mockResolvedValue(undefined);
    mocks.addCheck.mockResolvedValue(undefined);
});
afterEach(cleanup);

async function renderList() {
    render(<MemoryRouter><BatchesPage /></MemoryRouter>);
    await act(async () => { await Promise.resolve(); });
}

describe('BatchesPage', () => {
    it('lists batches with their lot, size, status and check-in progress', async () => {
        mocks.listBatches.mockResolvedValue([
            { ...batch(), batch_checks: [check('c1', '24 hours', -1, { checked_at: '2026-11-02T10:00:00Z', result: 'good' }), check('c2', '1 week', 5)] },
        ]);
        await renderList();
        expect(screen.getByText('Day Cream')).toBeInTheDocument();
        expect(screen.getByText(/Lot 261103-1/)).toBeInTheDocument();
        expect(within(screen.getByRole('link', { name: /Day Cream/ })).getByText('In progress')).toBeInTheDocument();
        expect(screen.getByText(/1 of 2 check-ins done/)).toBeInTheDocument();
        expect(screen.getByText(/all good so far/)).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /Day Cream/ })).toHaveAttribute('href', '/batches/b1');
    });

    it('puts check-ins that are due or overdue at the top, only for batches in progress', async () => {
        mocks.listBatches.mockResolvedValue([
            { ...batch(), batch_checks: [check('c1', '24 hours', -3), check('c2', '1 week', 4)] },
            { ...batch({ id: 'b2', name: 'Old Balm', lot_number: 'X-1', status: 'discarded' }), batch_checks: [check('c3', '4 weeks', -9)] },
        ]);
        await renderList();
        const due = screen.getByRole('region', { name: /Check-ins due \(1\)/ });
        expect(within(due).getByText(/Day Cream/)).toBeInTheDocument();
        expect(within(due).getByText('3 days overdue')).toBeInTheDocument();
        expect(within(due).queryByText(/Old Balm/)).not.toBeInTheDocument();
    });

    it('filters closed batches into their own tab', async () => {
        mocks.listBatches.mockResolvedValue([
            { ...batch(), batch_checks: [] },
            { ...batch({ id: 'b2', name: 'Old Balm', lot_number: 'X-1', status: 'discarded' }), batch_checks: [] },
        ]);
        await renderList();
        expect(screen.queryByText('Old Balm')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('tab', { name: /Closed/ }));
        expect(screen.getByText('Old Balm')).toBeInTheDocument();
        expect(screen.getByText('Discarded')).toBeInTheDocument();
        expect(screen.queryByText('Day Cream')).not.toBeInTheDocument();
    });

    it('has the Studio sidebar with Batches highlighted, and a way back to the Studio', async () => {
        mocks.listBatches.mockResolvedValue([]);
        await renderList();
        const nav = screen.getByRole('navigation', { name: 'Studio' });
        expect(within(nav).getByRole('link', { name: /Batches/ })).toHaveAttribute('aria-current', 'page');
        expect(within(nav).getByRole('link', { name: 'My Stash' })).toHaveAttribute('href', '/stash');
        expect(screen.getByRole('button', { name: /Back to Studio/ })).toBeInTheDocument();
    });

    it('explains how to make a first batch when there are none', async () => {
        mocks.listBatches.mockResolvedValue([]);
        await renderList();
        expect(screen.getByText('No batches yet')).toBeInTheDocument();
        expect(screen.getByText(/choose Make batch/)).toBeInTheDocument();
    });

    it('tells you plainly when the batch log is not set up', async () => {
        mocks.listBatches.mockRejectedValue(new Error("The batch log isn't set up in your database yet."));
        await renderList();
        expect(screen.getByRole('alert')).toHaveTextContent(/isn't set up in your database yet/);
    });
});

const detail = (over: { batch?: Record<string, unknown>; checks?: unknown[]; usage?: unknown[] } = {}) => ({
    batch: batch(over.batch),
    lines: [
        { id: 'l1', batch_id: 'b1', ingredient_id: 'gly', name: 'Glycerin', inci_name: 'Glycerin', phase: 'A', percentage: 5, planned_g: 5, actual_g: 5 },
        { id: 'l2', batch_id: 'b1', ingredient_id: 'shea', name: 'Shea Butter', inci_name: null, phase: 'B', percentage: 25, planned_g: 25, actual_g: 26 },
    ],
    usage: over.usage ?? [{ id: 'u1', batch_ingredient_id: 'l1', grams: 5, label: 'LOT-1' }],
    checks: over.checks ?? [check('c1', '24 hours', -1), check('c2', '1 week', 6)],
});

async function renderDetail(data = detail()) {
    mocks.getBatch.mockResolvedValue(data);
    render(
        <MemoryRouter initialEntries={['/batches/b1']}>
            <Routes><Route path="/batches/:id" element={<BatchDetailPage />} /></Routes>
        </MemoryRouter>
    );
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });
}

describe('BatchDetailPage', () => {
    it('shows what went in, what was weighed and where it came from', async () => {
        await renderDetail();
        expect(screen.getByRole('heading', { name: 'Day Cream' })).toBeInTheDocument();
        expect(screen.getByText('5 g from LOT-1')).toBeInTheDocument();
        expect(screen.getByText('26 g')).toBeInTheDocument();
        expect(screen.getByText(/5 g was taken out of your stash/)).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /Make it again/ })).toHaveAttribute('href', '/studio/f1');
    });

    it('has the Studio sidebar with Batches highlighted, and a way back to the Studio', async () => {
        await renderDetail();
        const nav = screen.getByRole('navigation', { name: 'Studio' });
        expect(within(nav).getByRole('link', { name: /Batches/ })).toHaveAttribute('aria-current', 'page');
        expect(screen.getByRole('button', { name: /Back to Studio/ })).toBeInTheDocument();
    });

    it('keeps the sidebar and the way back even when the batch cannot be loaded', async () => {
        mocks.getBatch.mockRejectedValue(new Error('Could not load this batch.'));
        render(
            <MemoryRouter initialEntries={['/batches/b1']}>
                <Routes><Route path="/batches/:id" element={<BatchDetailPage />} /></Routes>
            </MemoryRouter>
        );
        await act(async () => { await Promise.resolve(); });
        await act(async () => { await Promise.resolve(); });
        expect(screen.getByRole('alert')).toHaveTextContent('Could not load this batch.');
        expect(screen.getByRole('navigation', { name: 'Studio' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Back to Studio/ })).toBeInTheDocument();
    });

    it('records a check-in and reloads the batch', async () => {
        await renderDetail();
        fireEvent.click(screen.getAllByRole('button', { name: 'Record check-in' })[0]);
        fireEvent.click(screen.getByLabelText('Looks good'));
        fireEvent.click(screen.getByLabelText('Smell changed'));
        fireEvent.change(screen.getAllByLabelText(/Measured pH/)[0], { target: { value: '5.4' } }); // the form opens above the results section
        const loadsBefore = mocks.getBatch.mock.calls.length;
        fireEvent.click(screen.getByRole('button', { name: 'Save check-in' }));

        await waitFor(() => expect(mocks.completeCheck).toHaveBeenCalledTimes(1));
        expect(mocks.completeCheck).toHaveBeenCalledWith('c1', { result: 'good', observations: ['odor'], measured_ph: 5.4, notes: '' });
        await waitFor(() => expect(mocks.getBatch.mock.calls.length).toBeGreaterThan(loadsBefore));
    });

    it('will not call a batch with mold "good": it records a failure and warns to stop using it', async () => {
        await renderDetail();
        fireEvent.click(screen.getAllByRole('button', { name: 'Record check-in' })[0]);
        fireEvent.click(screen.getByLabelText('Looks good'));
        fireEvent.click(screen.getByLabelText('Mold, spots or fuzz'));
        expect(screen.getByRole('alert')).toHaveTextContent(/Stop using this batch/);
        fireEvent.click(screen.getByRole('button', { name: 'Save check-in' }));

        await waitFor(() => expect(mocks.completeCheck).toHaveBeenCalled());
        expect(mocks.completeCheck.mock.calls[0][1]).toMatchObject({ result: 'failed', observations: ['mold'] });
    });

    it('needs a result before a check-in can be saved', async () => {
        await renderDetail();
        fireEvent.click(screen.getAllByRole('button', { name: 'Record check-in' })[0]);
        expect(screen.getByRole('button', { name: 'Save check-in' })).toBeDisabled();
    });

    it('warns when a recorded check failed and offers to mark the batch discarded', async () => {
        await renderDetail(detail({ checks: [check('c1', '24 hours', -1, { checked_at: '2026-11-02T10:00:00Z', result: 'failed', observations: ['mold'] })] }));
        expect(screen.getByRole('alert')).toHaveTextContent(/may not be safe to use/);
        fireEvent.click(screen.getByRole('button', { name: 'Mark as discarded' }));
        await waitFor(() => expect(mocks.updateBatch).toHaveBeenCalledWith('b1', { status: 'discarded' }));
    });

    it('shows nothing alarming when all checks are fine', async () => {
        await renderDetail(detail({ checks: [check('c1', '24 hours', -1, { checked_at: '2026-11-02T10:00:00Z', result: 'good' })] }));
        expect(screen.queryByText(/may not be safe/)).not.toBeInTheDocument();
    });

    it('undoing the batch asks first, and does nothing if you say no', async () => {
        await renderDetail();
        confirmDialog.mockReturnValue(false);
        fireEvent.click(screen.getByRole('button', { name: 'Undo batch and restore stash' }));
        expect(confirmDialog).toHaveBeenCalledWith(expect.stringContaining('5 g will be put back'));
        expect(mocks.voidBatch).not.toHaveBeenCalled();
    });

    it('undoes the batch and restores the stash when you confirm', async () => {
        await renderDetail();
        confirmDialog.mockReturnValue(true);
        fireEvent.click(screen.getByRole('button', { name: 'Undo batch and restore stash' }));
        await waitFor(() => expect(mocks.voidBatch).toHaveBeenCalledWith('b1'));
        expect(await screen.findByText(/Your stash was restored/)).toBeInTheDocument();
    });

    it('offers "never made" instead for a batch that did not use stash', async () => {
        await renderDetail(detail({ batch: { stash_deducted: false }, usage: [] }));
        expect(screen.queryByRole('button', { name: /restore stash/ })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Mark as never made' })).toBeInTheDocument();
        expect(screen.getByText(/did not change your stash/)).toBeInTheDocument();
    });

    it('shows an undone batch as read-only', async () => {
        await renderDetail(detail({ batch: { status: 'voided' } }));
        expect(screen.getByText(/stash amounts were put back/)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Record check-in' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Undo batch/ })).not.toBeInTheDocument();
    });

    it('saves measurements and notes', async () => {
        await renderDetail();
        fireEvent.change(screen.getByLabelText(/Measured pH/), { target: { value: '5.3' } });
        fireEvent.change(screen.getByLabelText(/Final weight/), { target: { value: '96' } });
        fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'smooth' } });
        expect(screen.getByText(/Yield 96% of 100 g/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        await waitFor(() => expect(mocks.updateBatch).toHaveBeenCalledWith('b1', { measured_ph: 5.3, final_weight_g: 96, notes: 'smooth' }));
    });

    it('adds a check-in of your own', async () => {
        await renderDetail();
        fireEvent.change(screen.getByLabelText(/Add your own check-in/), { target: { value: 'after summer heat' } });
        fireEvent.click(screen.getByRole('button', { name: 'Add' }));
        await waitFor(() => expect(mocks.addCheck).toHaveBeenCalledWith('b1', 'after summer heat', isoDate()));
    });

    it('explains a batch it cannot load', async () => {
        mocks.getBatch.mockRejectedValue(new Error('Could not load this batch.'));
        render(<MemoryRouter initialEntries={['/batches/zz']}><Routes><Route path="/batches/:id" element={<BatchDetailPage />} /></Routes></MemoryRouter>);
        expect(await screen.findByRole('alert')).toHaveTextContent('Could not load this batch.');
    });
});
