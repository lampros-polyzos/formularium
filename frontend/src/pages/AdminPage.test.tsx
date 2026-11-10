import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminPage from './AdminPage';
import { ApiError } from '../lib/apiClient';
import type { AdminDetail, AdminMember } from '../lib/adminClient';

const mocks = vi.hoisted(() => ({
    user: null as null | { id: string; admin?: boolean },
    adminStatus: vi.fn(),
    searchMembers: vi.fn(),
    openMember: vi.fn(),
    performAction: vi.fn(),
}));
vi.mock('../lib/adminClient', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../lib/adminClient')>()),
    adminStatus: mocks.adminStatus, searchMembers: mocks.searchMembers, openMember: mocks.openMember, performAction: mocks.performAction,
}));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('../contexts/SettingsContext', () => ({ useSettings: () => ({ formatDate: (d: string) => d }) }));
vi.mock('../components/Header', () => ({ default: ({ title }: { title: string }) => <h2>{title}</h2> }));

const member = (over: Partial<AdminMember> = {}): AdminMember => ({
    id: 'm1', email: 'sam@example.com', username: 'sam', emailVerified: true, hasPassword: true, passwordSignInOff: false, googleLinked: false, moderator: false, twoStepOn: true,
    passkeys: 0, passkeysUsed: 0, createdAt: '2026-11-01', lastLoginAt: null, ...over,
});
const detail = (over: Partial<AdminMember> = {}): AdminDetail => ({ member: member(over), events: [{ type: 'login_success', at: '2026-11-02' }], devices: [{ description: 'Chrome on Windows', firstSeenAt: '2026-11-01', lastSeenAt: '2026-11-02' }], history: [] });

const renderPage = () => render(<MemoryRouter><AdminPage /></MemoryRouter>);
const type = (label: string | RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

async function findSam() {
    type('Email address or username', 'sam');
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    fireEvent.click(await screen.findByRole('button', { name: /sam@example.com/ }));
    return screen.findByRole('article');
}

beforeEach(() => {
    mocks.user = { id: 'a1', admin: true };
    mocks.adminStatus.mockReset().mockResolvedValue({ admin: true, secondFactor: true });
    mocks.searchMembers.mockReset().mockResolvedValue([member()]);
    mocks.openMember.mockReset().mockResolvedValue(detail());
    mocks.performAction.mockReset().mockResolvedValue(detail({ twoStepOn: false }));
});
afterEach(cleanup);

describe('the admin page', () => {
    it('is only for administrators, and asks the server nothing otherwise', () => {
        mocks.user = { id: 'x' };
        renderPage();
        expect(screen.getByText('This page is for administrators.')).toBeInTheDocument();
        expect(mocks.adminStatus).not.toHaveBeenCalled();
    });

    it('trusts the server over the page: a refused status shows the same message', async () => {
        mocks.adminStatus.mockResolvedValue({ admin: false, secondFactor: false });
        renderPage();
        expect(await screen.findByText('This page is for administrators.')).toBeInTheDocument();
    });

    it('explains an administrator without a second factor instead of showing the tool', async () => {
        mocks.adminStatus.mockResolvedValue({ admin: true, secondFactor: false });
        renderPage();
        expect(await screen.findByRole('alert')).toHaveTextContent(/two-step verification or a passkey/);
        expect(screen.queryByLabelText('Email address or username')).not.toBeInTheDocument();
    });

    it('cannot search for fewer than three characters', async () => {
        renderPage();
        await screen.findByLabelText('Email address or username');
        type('Email address or username', 'sa');
        expect(screen.getByRole('button', { name: 'Search' })).toBeDisabled();
    });

    it('shows a member\'s state, events and browsers after a search', async () => {
        renderPage();
        await screen.findByLabelText('Email address or username');
        const card = await findSam();
        expect(mocks.searchMembers).toHaveBeenCalledWith('sam');
        expect(within(card).getByText('Two-step verification').nextSibling).toHaveTextContent('On');
        expect(within(card).getByText('Signed in')).toBeInTheDocument();
        expect(within(card).getByText(/Chrome on Windows/)).toBeInTheDocument();
    });

    it('says when nobody matches, and shows the server\'s message when the search is refused', async () => {
        renderPage();
        await screen.findByLabelText('Email address or username');
        mocks.searchMembers.mockResolvedValueOnce([]);
        type('Email address or username', 'nobody');
        fireEvent.click(screen.getByRole('button', { name: 'Search' }));
        expect(await screen.findByText('No member matches.')).toBeInTheDocument();

        mocks.searchMembers.mockRejectedValueOnce(new ApiError(429, 'too_many_actions', 'Wait a while.'));
        fireEvent.click(screen.getByRole('button', { name: 'Search' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Wait a while.');
    });

    it('offers only the actions that would change something', async () => {
        renderPage();
        await screen.findByLabelText('Email address or username');
        const card = await findSam();
        const names = within(card).getAllByRole('button').map(b => b.textContent);
        expect(names).toEqual(['Make moderator', 'Switch off two-step verification', 'Sign out every device']);
    });

    it('needs a reason and the password before an action can be confirmed, then sends both', async () => {
        renderPage();
        await screen.findByLabelText('Email address or username');
        await findSam();
        fireEvent.click(screen.getByRole('button', { name: 'Switch off two-step verification' }));
        const confirmButton = screen.getByRole('button', { name: 'Confirm' });
        expect(confirmButton).toBeDisabled();

        type(/Reason/, 'lost phone, confirmed by email');
        expect(confirmButton).toBeDisabled();
        type('Your password', 'my password');
        expect(confirmButton).toBeEnabled();
        fireEvent.click(confirmButton);

        await waitFor(() => expect(mocks.performAction).toHaveBeenCalledWith('m1', { action: 'reset_two_step', reason: 'lost phone, confirmed by email', password: 'my password' }));
        expect(await screen.findByRole('status')).toHaveTextContent(/The member was told by email/);
        expect(screen.queryByLabelText('Your password')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Switch off two-step verification' })).not.toBeInTheDocument();   // nothing left to switch off
    });

    it('keeps the form and clears the password when the server refuses', async () => {
        mocks.performAction.mockRejectedValue(new ApiError(401, 'invalid_credentials', 'Your password is not right.'));
        renderPage();
        await screen.findByLabelText('Email address or username');
        await findSam();
        fireEvent.click(screen.getByRole('button', { name: 'Make moderator' }));
        type(/Reason/, 'asked by email');
        type('Your password', 'wrong');
        fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

        expect(await screen.findByRole('alert')).toHaveTextContent('Your password is not right.');
        expect(screen.getByLabelText('Your password')).toHaveValue('');
        expect(screen.getByLabelText(/Reason/)).toHaveValue('asked by email');
    });

    it('cancelling forgets the password', async () => {
        renderPage();
        await screen.findByLabelText('Email address or username');
        await findSam();
        fireEvent.click(screen.getByRole('button', { name: 'Make moderator' }));
        type('Your password', 'secret');
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        fireEvent.click(screen.getByRole('button', { name: 'Make moderator' }));
        expect(screen.getByLabelText('Your password')).toHaveValue('');
    });
});
