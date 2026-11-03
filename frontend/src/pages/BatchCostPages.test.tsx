import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BatchesPage from './BatchesPage';
import BatchDetailPage from './BatchDetailPage';

const mocks = vi.hoisted(() => ({
    listBatches: vi.fn(),
    getBatch: vi.fn(),
    downloadBatchRecord: vi.fn(),
}));

vi.mock('../lib/batches', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../lib/batches')>()),
    listBatches: mocks.listBatches,
    getBatch: mocks.getBatch,
    countDueChecks: vi.fn().mockResolvedValue(0),
}));
vi.mock('../lib/batchRecord', () => ({ downloadBatchRecord: mocks.downloadBatchRecord }));
vi.mock('../lib/supabase', () => ({ supabase: { auth: { signOut: vi.fn() }, from: vi.fn(), channel: vi.fn(), removeChannel: vi.fn() } }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: null, session: null, username: null, isLoading: false }) }));
vi.mock('../contexts/SettingsContext', () => ({
    useSettings: () => ({ currency: '€', setCurrency: vi.fn(), dateFormat: 'en-US', setDateFormat: vi.fn(), warningDays: 30, setWarningDays: vi.fn(), formatDate: (d: string) => d }),
}));

const batch = (over: Record<string, unknown> = {}) => ({
    id: 'b1', formulation_id: 'f1', name: 'Day Cream', lot_number: '261108-1', batch_size_g: 200, made_on: '2026-11-08', status: 'active',
    target_ph: 5.5, measured_ph: null, final_weight_g: null, notes: null, stash_deducted: true, created_at: '2026-11-08T10:00:00Z',
    container_id: null, container_name: null, container_volume_ml: null, container_count: null, container_unit_price: null, density_g_ml: null,
    ingredient_cost: 0.74, unpriced_count: 1, ...over,
});

const lines: Record<string, unknown>[] = [
    { id: 'l1', batch_id: 'b1', ingredient_id: 'w', name: 'Distilled Water', inci_name: 'Aqua', phase: 'A', percentage: 70, planned_g: 140, actual_g: 140, cost: 0.14, cost_estimated: false },
    { id: 'l2', batch_id: 'b1', ingredient_id: 'gly', name: 'Glycerin', inci_name: 'Glycerin', phase: 'A', percentage: 5, planned_g: 10, actual_g: 10, cost: 0.6, cost_estimated: true },
    { id: 'l3', batch_id: 'b1', ingredient_id: 'shea', name: 'Shea Butter', inci_name: null, phase: 'B', percentage: 25, planned_g: 50, actual_g: 50, cost: null, cost_estimated: false },
];

const detail = (over: Record<string, unknown> = {}, theLines: Record<string, unknown>[] = lines) => ({ batch: batch(over), lines: theLines, usage: [], checks: [] });

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

beforeEach(() => {
    Object.values(mocks).forEach(m => m.mockReset());
    mocks.downloadBatchRecord.mockResolvedValue(undefined);
    vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('a batch: what it cost', () => {
    it('shows what each ingredient cost, with ~ where part of it was an estimate, and "no price" where it was unknown', async () => {
        await renderDetail();
        const row = (name: string) => screen.getByText(name).closest('tr')!;
        expect(row('Distilled Water')).toHaveTextContent('€0.14');
        expect(row('Glycerin')).toHaveTextContent('~€0.60');
        expect(row('Shea Butter')).toHaveTextContent('no price');
    });

    it('totals it, per 100 g, and says how much is guessed and missing', async () => {
        await renderDetail();
        const cost = screen.getByRole('group', { name: 'Cost of this batch' });
        expect(cost).toHaveTextContent('About €0.74 for the ingredients');
        expect(cost).toHaveTextContent('€0.37 per 100 g');
        expect(cost).toHaveTextContent('1 ingredient had no price, so the real cost is higher');
        expect(cost).toHaveTextContent('Marked ~');
    });

    it('is exact, with no "about", when everything was priced from stash lots', async () => {
        await renderDetail(detail({ unpriced_count: 0 }, lines.map(l => ({ ...l, cost: 0.1, cost_estimated: false }))));
        const cost = screen.getByRole('group', { name: 'Cost of this batch' });
        expect(cost).toHaveTextContent('€0.74 for the ingredients');
        expect(cost).not.toHaveTextContent('About');
        expect(cost).not.toHaveTextContent('Marked ~');
    });

    it('shows the cost of one filled container, including the container, and what it was filled into', async () => {
        await renderDetail(detail({ container_name: '50 ml bottle', container_volume_ml: 50, container_count: 3.4, container_unit_price: 0.8 }));
        expect(screen.getByText(/fills 3.4 × 50 ml bottle/)).toBeInTheDocument();
        // 0.74 / 3.4 = 0.218, plus 0.80 for the bottle
        expect(screen.getByRole('group', { name: 'Cost of this batch' })).toHaveTextContent('€1.02 per 50 ml bottle including the container');
    });

    it('explains when nothing could be priced, instead of showing a cost of zero', async () => {
        await renderDetail(detail({ ingredient_cost: null, unpriced_count: 3 }, lines.map(l => ({ ...l, cost: null, cost_estimated: false }))));
        expect(screen.getByRole('group', { name: 'Cost of this batch' })).toHaveTextContent('No prices were known when this batch was made');
        expect(screen.getAllByText('no price')).toHaveLength(3);
    });

    it('still opens a batch recorded before costs existed', async () => {
        const old = detail();
        for (const key of ['ingredient_cost', 'unpriced_count', 'container_name', 'container_count'] as const) delete (old.batch as Record<string, unknown>)[key];
        old.lines.forEach(l => { delete (l as Record<string, unknown>).cost; delete (l as Record<string, unknown>).cost_estimated; });
        await renderDetail(old);
        expect(screen.getByRole('heading', { name: 'Day Cream' })).toBeInTheDocument();
        expect(screen.getByRole('group', { name: 'Cost of this batch' })).toHaveTextContent('No prices were known');
    });
});

describe('a batch: the printed record', () => {
    it('prints the record from the stored batch, in the user\'s currency', async () => {
        const data = detail();
        await renderDetail(data);
        fireEvent.click(screen.getByRole('button', { name: /Print record/ }));
        await waitFor(() => expect(mocks.downloadBatchRecord).toHaveBeenCalledTimes(1));
        expect(mocks.downloadBatchRecord).toHaveBeenCalledWith(data, '€');
    });

    it('is not available twice at once while it is being made', async () => {
        let finish!: () => void;
        mocks.downloadBatchRecord.mockReturnValue(new Promise<void>(resolve => { finish = resolve; }));
        await renderDetail();
        fireEvent.click(screen.getByRole('button', { name: /Print record/ }));
        const busy = await screen.findByRole('button', { name: /Preparing/ });
        expect(busy).toBeDisabled();
        await act(async () => { finish(); });
        expect(await screen.findByRole('button', { name: /Print record/ })).toBeEnabled();
    });

    it('says plainly when the record could not be made, and the page keeps working', async () => {
        mocks.downloadBatchRecord.mockRejectedValue(new Error('Failed to generate PDF'));
        await renderDetail();
        fireEvent.click(screen.getByRole('button', { name: /Print record/ }));
        expect(await screen.findByRole('alert')).toHaveTextContent(/Couldn't create the record/);
        expect(screen.getByRole('button', { name: /Print record/ })).toBeEnabled();
        expect(screen.getByRole('heading', { name: 'Day Cream' })).toBeInTheDocument();
    });

    it('can be printed for an undone batch too, as a record of the attempt', async () => {
        await renderDetail(detail({ status: 'voided' }));
        expect(screen.getByRole('button', { name: /Print record/ })).toBeEnabled();
    });
});

describe('the list of batches', () => {
    async function renderList(batches: Record<string, unknown>[]) {
        mocks.listBatches.mockResolvedValue(batches.map(b => ({ ...b, batch_checks: [] })));
        render(<MemoryRouter><BatchesPage /></MemoryRouter>);
        await act(async () => { await Promise.resolve(); });
    }

    it('shows what each batch filled, its pH and what it cost, so past batches can be compared', async () => {
        await renderList([batch({ container_name: '50 ml bottle', container_count: 3.4, measured_ph: 5.6, ingredient_cost: 0.74 })]);
        const card = screen.getByRole('link', { name: /Day Cream/ });
        expect(within(card).getByText(/fills 3.4 × 50 ml bottle/)).toBeInTheDocument();
        expect(within(card).getByText(/pH 5.6/)).toBeInTheDocument();
        expect(within(card).getByText(/€0.74/)).toBeInTheDocument();
    });

    it('leaves out what was never recorded', async () => {
        await renderList([batch({ ingredient_cost: null })]);
        const card = screen.getByRole('link', { name: /Day Cream/ });
        expect(card).not.toHaveTextContent('€');
        expect(card).not.toHaveTextContent('pH');
        expect(card).not.toHaveTextContent('fills');
    });
});
