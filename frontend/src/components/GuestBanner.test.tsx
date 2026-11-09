import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import GuestBanner from './GuestBanner';

const mocks = vi.hoisted(() => ({ user: null as null | { username: string; guest?: boolean }, signOut: vi.fn(), navigate: vi.fn() }));

vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: mocks.user, signOut: mocks.signOut }) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate }));

beforeEach(() => { mocks.user = null; mocks.signOut.mockReset().mockResolvedValue(undefined); mocks.navigate.mockReset(); });
afterEach(cleanup);

describe('the demo banner', () => {
    it('is shown to a guest, saying that the work is temporary', () => {
        mocks.user = { username: 'guest-1a2b3c4d', guest: true };
        render(<GuestBanner />);
        expect(screen.getByRole('status')).toHaveTextContent('You are using the demo');
        expect(screen.getByRole('status')).toHaveTextContent('deleted after about a day');
    });

    it('is not shown to a real member, or to nobody', () => {
        mocks.user = { username: 'sam' };
        const { rerender } = render(<GuestBanner />);
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
        mocks.user = null;
        rerender(<GuestBanner />);
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('"Create a free account" ends the demo and opens the sign-up form on the home page', async () => {
        mocks.user = { username: 'guest-1a2b3c4d', guest: true };
        render(<GuestBanner />);
        fireEvent.click(screen.getByRole('button', { name: 'Create a free account' }));

        await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/?signup=1'));
        expect(mocks.signOut).toHaveBeenCalledOnce();
        expect(mocks.signOut.mock.invocationCallOrder[0]).toBeLessThan(mocks.navigate.mock.invocationCallOrder[0]);   // signed out first
    });
});
