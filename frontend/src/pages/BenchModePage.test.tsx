import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BenchModePage from './BenchModePage';

const mocks = vi.hoisted(() => ({ getBatch: vi.fn() }));

vi.mock('../lib/batches', async (importOriginal) => ({ ...(await importOriginal<typeof import('../lib/batches')>()), getBatch: mocks.getBatch }));
vi.mock('../lib/benchAlarm', () => ({ playAlarm: vi.fn(), prepareAlarm: vi.fn() }));

const batch = (over: Record<string, unknown> = {}) => ({
    id: 'b1', formulation_id: 'f1', name: 'Day Cream', lot_number: '261108-1', batch_size_g: 100, made_on: '2026-11-08', status: 'active',
    target_ph: 5.5, measured_ph: null, final_weight_g: null, notes: null, stash_deducted: true, created_at: '2026-11-08T10:00:00Z', ...over,
});
const lines = [
    { id: 'l1', batch_id: 'b1', ingredient_id: 'w', name: 'Distilled Water', inci_name: 'Aqua', phase: 'A', percentage: 70, planned_g: 70, actual_g: 70 },
    { id: 'l2', batch_id: 'b1', ingredient_id: 'g', name: 'Glycerin', inci_name: 'Glycerin', phase: 'A', percentage: 10, planned_g: 10, actual_g: 11 },
];
const detail = (over: Record<string, unknown> = {}) => ({ batch: batch(over), lines, usage: [], checks: [] });

const settle = () => act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); });

async function open() {
    render(
        <MemoryRouter initialEntries={['/batches/b1/bench']}>
            <Routes>
                <Route path="/batches/:id/bench" element={<BenchModePage />} />
                <Route path="/batches/:id" element={<p>THE BATCH PAGE</p>} />
                <Route path="/batches" element={<p>ALL BATCHES</p>} />
            </Routes>
        </MemoryRouter>
    );
    await settle();
}

beforeEach(() => {
    localStorage.clear();
    mocks.getBatch.mockReset().mockResolvedValue(detail());
});
afterEach(cleanup);

describe('the bench page', () => {
    it('shows a message while the batch loads', async () => {
        mocks.getBatch.mockReturnValue(new Promise(() => {}));
        await open();
        expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    it('opens the bench for a batch, with what was weighed out as the amounts', async () => {
        await open();
        expect(screen.getByRole('region', { name: 'Bench mode' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Day Cream' })).toBeInTheDocument();
        expect(screen.getByRole('checkbox', { name: /Glycerin/ })).toHaveTextContent('11g'); // the 11 g recorded, not the 10 g planned
    });

    it('goes back to the batch when you leave', async () => {
        await open();
        fireEvent.click(screen.getByRole('button', { name: 'Leave bench mode' }));
        expect(screen.getByText('THE BATCH PAGE')).toBeInTheDocument();
    });

    it.each([['voided', 'undone'], ['discarded', 'discarded']])('does not open the bench for a batch that is %s', async (status, word) => {
        mocks.getBatch.mockResolvedValue(detail({ status }));
        await open();
        expect(screen.queryByRole('region', { name: 'Bench mode' })).not.toBeInTheDocument();
        expect(screen.getByRole('heading')).toHaveTextContent(`Day Cream is ${word}`);
        fireEvent.click(screen.getByRole('link', { name: 'Back to the batch' }));
        expect(screen.getByText('THE BATCH PAGE')).toBeInTheDocument();
    });

    it('says so, with a way out, when the batch cannot be loaded', async () => {
        mocks.getBatch.mockRejectedValue(new Error('Could not load this batch.'));
        await open();
        expect(screen.getByRole('alert')).toHaveTextContent('Could not load this batch.');
        fireEvent.click(screen.getByRole('link', { name: 'Your batches' }));
        expect(screen.getByText('ALL BATCHES')).toBeInTheDocument();
    });
});
