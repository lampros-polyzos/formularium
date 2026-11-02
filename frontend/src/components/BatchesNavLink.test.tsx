import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BatchesNavLink from './BatchesNavLink';
import { notifyBatchesChanged } from '../hooks/useDueChecks';

const mocks = vi.hoisted(() => ({
    count: vi.fn(),
    auth: { user: { id: 'u1' } as { id: string } | null },
}));

vi.mock('../lib/batches', () => ({ countDueChecks: mocks.count }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => mocks.auth }));

const show = async () => {
    render(<MemoryRouter><BatchesNavLink /></MemoryRouter>);
    await act(async () => { await Promise.resolve(); });
};

beforeEach(() => {
    mocks.count.mockReset().mockResolvedValue(0);
    mocks.auth.user = { id: 'u1' };
});
afterEach(cleanup);

describe('BatchesNavLink', () => {
    it('links to the batches page with no badge when nothing is due', async () => {
        await show();
        expect(screen.getByRole('link', { name: 'Batches' })).toHaveAttribute('href', '/batches');
        expect(screen.queryByLabelText(/due/)).not.toBeInTheDocument();
    });

    it('shows how many check-ins are due', async () => {
        mocks.count.mockResolvedValue(3);
        await show();
        expect(screen.getByLabelText('3 check-ins due')).toHaveTextContent('3');
    });

    it('says "1 check-in" in the singular', async () => {
        mocks.count.mockResolvedValue(1);
        await show();
        expect(screen.getByLabelText('1 check-in due')).toBeInTheDocument();
    });

    it('updates when batches change, without a reload', async () => {
        await show();
        mocks.count.mockResolvedValue(2);
        await act(async () => { notifyBatchesChanged(); });
        expect(screen.getByLabelText('2 check-ins due')).toBeInTheDocument();
    });

    it('never gets in the way if the count cannot be loaded', async () => {
        mocks.count.mockRejectedValue(new Error('table missing'));
        await show();
        expect(screen.getByRole('link', { name: 'Batches' })).toBeInTheDocument();
        expect(screen.queryByLabelText(/due/)).not.toBeInTheDocument();
    });

    it('does not ask the database when nobody is signed in', async () => {
        mocks.auth.user = null;
        await show();
        expect(mocks.count).not.toHaveBeenCalled();
    });
});
