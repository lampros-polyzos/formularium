import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CheckInPrompt from './CheckInPrompt';
import { isoDate, type DueCheck } from '../lib/batches';

const mocks = vi.hoisted(() => ({
    user: { id: 'u1' } as { id: string } | null,
    listDueChecks: vi.fn(),
    countDueChecks: vi.fn(),
    completeCheck: vi.fn(),
}));

vi.mock('../lib/batches', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../lib/batches')>()),
    listDueChecks: mocks.listDueChecks,
    countDueChecks: mocks.countDueChecks,
    completeCheck: mocks.completeCheck,
}));
vi.mock('../lib/supabase', () => ({ supabase: {} }));
// A stable object: a new one on every render would re-run the effects forever
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: mocks.user, session: null, username: null, isLoading: false }) }));

const day = (offset: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return isoDate(d);
};
const due = (id: string, name: string, label: string, offset: number): DueCheck => ({
    id, batch_id: `b-${id}`, label, due_on: day(offset), checked_at: null, result: null, observations: [], measured_ph: null, notes: null,
    batch: { id: `b-${id}`, name, lot_number: `L-${id}`, target_ph: 5.5 },
});

const settle = () => act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });
const renderPrompt = async () => {
    render(<MemoryRouter><CheckInPrompt /></MemoryRouter>);
    await settle();
};

beforeEach(() => {
    mocks.user = { id: 'u1' };
    mocks.listDueChecks.mockReset().mockResolvedValue([]);
    mocks.countDueChecks.mockReset().mockResolvedValue(0);
    mocks.completeCheck.mockReset().mockResolvedValue(undefined);
});
afterEach(cleanup);

describe('the Studio prompt', () => {
    it('shows nothing when no check-in is due', async () => {
        await renderPrompt();
        expect(screen.queryByRole('region')).not.toBeInTheDocument();
    });

    it('shows nothing when signed out, and does not even ask', async () => {
        mocks.user = null;
        await renderPrompt();
        expect(screen.queryByRole('region')).not.toBeInTheDocument();
        expect(mocks.listDueChecks).not.toHaveBeenCalled();
    });

    it('asks how each due batch looks, oldest first as the server returns them', async () => {
        mocks.listDueChecks.mockResolvedValue([due('1', 'Day Cream', '1 week', -2), due('2', 'Body Butter', '24 hours', 0)]);
        mocks.countDueChecks.mockResolvedValue(2);
        await renderPrompt();
        const prompt = screen.getByRole('region', { name: 'Time to check on your batches' });
        expect(within(prompt).getByText('Day Cream')).toBeInTheDocument();
        expect(within(prompt).getByText('Body Butter')).toBeInTheDocument();
        expect(within(prompt).getAllByText('How does it look?')).toHaveLength(2);
        expect(within(prompt).getByText('2 days overdue')).toBeInTheDocument();
        expect(within(prompt).queryByText(/See all/)).not.toBeInTheDocument();
    });

    it('points to the rest when more are due than shown', async () => {
        mocks.listDueChecks.mockResolvedValue([due('1', 'Day Cream', '1 week', 0), due('2', 'Body Butter', '24 hours', 0), due('3', 'Toner', '24 hours', 0)]);
        mocks.countDueChecks.mockResolvedValue(7);
        await renderPrompt();
        expect(screen.getByRole('link', { name: /See all 7 due/ })).toHaveAttribute('href', '/batches');
    });

    it('takes an answered check-in off the list straight away', async () => {
        mocks.listDueChecks
            .mockResolvedValueOnce([due('1', 'Day Cream', '1 week', 0), due('2', 'Body Butter', '24 hours', 0)])
            .mockResolvedValue([due('2', 'Body Butter', '24 hours', 0)]);
        mocks.countDueChecks.mockResolvedValue(2);
        await renderPrompt();

        const row = screen.getByText('Day Cream').closest('li')!;
        fireEvent.click(within(row).getByRole('button', { name: 'Looks good' }));
        await waitFor(() => expect(screen.queryByText('Day Cream')).not.toBeInTheDocument());
        expect(mocks.completeCheck).toHaveBeenCalledWith('1', expect.objectContaining({ result: 'good' }));
        expect(screen.getByText('Body Butter')).toBeInTheDocument();
    });

    it('goes away when the last one is answered', async () => {
        mocks.listDueChecks.mockResolvedValueOnce([due('1', 'Day Cream', '1 week', 0)]).mockResolvedValue([]);
        await renderPrompt();
        fireEvent.click(screen.getByRole('button', { name: 'Looks good' }));
        await waitFor(() => expect(screen.queryByRole('region')).not.toBeInTheDocument());
    });

    it('stays out of the way if the check-ins cannot be loaded', async () => {
        mocks.listDueChecks.mockRejectedValue(new Error("The batch log isn't set up in your database yet."));
        await renderPrompt();
        expect(screen.queryByRole('region')).not.toBeInTheDocument();
    });
});
