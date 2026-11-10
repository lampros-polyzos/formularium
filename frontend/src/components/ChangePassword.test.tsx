import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ChangePassword from './ChangePassword';
import { ApiError } from '../lib/apiClient';

const mocks = vi.hoisted(() => ({ user: null as null | { username: string; hasPassword?: boolean }, changePassword: vi.fn() }));

vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('../lib/passwordClient', () => ({ changePassword: mocks.changePassword }));

beforeEach(() => {
    mocks.user = { username: 'sam', hasPassword: true };
    mocks.changePassword.mockReset().mockResolvedValue(undefined);
});
afterEach(cleanup);

const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const fill = (current = 'the old password', next = 'a brand new password', again = next) => {
    type('Current password', current);
    type('New password', next);
    type('Repeat the new password', again);
};
const submit = () => screen.getByRole('button', { name: /Change password|Changing/ });

describe('the Password section of the settings', () => {
    it('shows nothing when nobody is signed in', () => {
        mocks.user = null;
        const { container } = render(<ChangePassword />);
        expect(container).toBeEmptyDOMElement();
    });

    it('for an account that only uses Google, explains the email route instead of showing a form', () => {
        mocks.user = { username: 'sam', hasPassword: false };
        render(<ChangePassword />);
        expect(screen.getByText(/You sign in with Google, so there is no password to change/)).toBeInTheDocument();
        expect(screen.getByText(/Forgot your password\?/)).toBeInTheDocument();
        expect(screen.queryByLabelText('Current password')).not.toBeInTheDocument();
    });

    it('treats an account whose state is not known as one that has a password', () => {
        mocks.user = { username: 'sam' };   // an older session, from before the field existed
        render(<ChangePassword />);
        expect(screen.getByLabelText('Current password')).toBeInTheDocument();
    });

    it('cannot be sent until all three fields are right: the current one, a long enough new one, and the same again', () => {
        render(<ChangePassword />);
        expect(submit()).toBeDisabled();

        fill('the old password', 'short', 'short');
        expect(submit()).toBeDisabled();   // under 10 characters

        fill('', 'a brand new password');
        expect(submit()).toBeDisabled();   // no current password

        fill('the old password', 'a brand new password', 'a brand new passwore');
        expect(submit()).toBeDisabled();   // the two new ones differ
        expect(screen.getByText('The two new passwords are not the same.')).toBeInTheDocument();

        fill();
        expect(submit()).toBeEnabled();
        expect(screen.queryByText('The two new passwords are not the same.')).not.toBeInTheDocument();
    });

    it('sends the current and the new password, then empties the fields and confirms', async () => {
        render(<ChangePassword />);
        fill();
        fireEvent.click(submit());

        await waitFor(() => expect(mocks.changePassword).toHaveBeenCalledExactlyOnceWith({ currentPassword: 'the old password', newPassword: 'a brand new password' }));
        expect(await screen.findByRole('status')).toHaveTextContent('Password changed. Your other devices were signed out');
        for (const label of ['Current password', 'New password', 'Repeat the new password']) expect(screen.getByLabelText(label)).toHaveValue('');
        expect(submit()).toBeDisabled();   // nothing is left to send twice
    });

    it('shows the server\'s reason (a wrong password, a leaked one) and keeps what was typed, so only the fault needs fixing', async () => {
        mocks.changePassword.mockRejectedValueOnce(new ApiError(401, 'invalid_credentials', 'Your current password is not right.'));
        render(<ChangePassword />);
        fill('wrong one');
        fireEvent.click(submit());

        expect(await screen.findByRole('alert')).toHaveTextContent('Your current password is not right.');
        expect(screen.getByLabelText('Current password')).toHaveValue('wrong one');
        expect(screen.getByLabelText('New password')).toHaveValue('a brand new password');
        expect(screen.queryByRole('status')).not.toBeInTheDocument();

        mocks.changePassword.mockRejectedValueOnce(new ApiError(400, 'password_breached', 'That password has appeared in a known data breach, so it is not safe to use. Please choose a different one.'));
        type('Current password', 'the old password');
        fireEvent.click(submit());
        expect(await screen.findByRole('alert')).toHaveTextContent('known data breach');
    });

    it('says something sensible when the failure carries no message, and clears the old confirmation when typing again', async () => {
        mocks.changePassword.mockResolvedValueOnce(undefined).mockRejectedValueOnce('boom');
        render(<ChangePassword />);
        fill();
        fireEvent.click(submit());
        expect(await screen.findByRole('status')).toBeInTheDocument();

        type('Current password', 'typing again');
        expect(screen.queryByRole('status')).not.toBeInTheDocument();   // the old "changed" message does not linger

        fill();
        fireEvent.click(submit());
        expect(await screen.findByRole('alert')).toHaveTextContent('could not be changed');
    });

    it('works only once at a time: while it is sending, it cannot be sent again', async () => {
        let finish: () => void = () => {};
        mocks.changePassword.mockReturnValue(new Promise<void>(resolve => { finish = resolve; }));
        render(<ChangePassword />);
        fill();
        fireEvent.click(submit());

        const working = await screen.findByRole('button', { name: 'Changing...' });
        expect(working).toBeDisabled();
        fireEvent.submit(working.closest('form')!);   // pressing Enter in a field
        expect(mocks.changePassword).toHaveBeenCalledTimes(1);
        finish();
        await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument());
    });
});
