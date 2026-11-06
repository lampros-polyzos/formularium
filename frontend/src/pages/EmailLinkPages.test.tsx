import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import VerifyEmailPage from './VerifyEmailPage';
import ResetPasswordPage from './ResetPasswordPage';
import { AuthError } from '../lib/authClient';

const mocks = vi.hoisted(() => ({ verifyEmail: vi.fn(), resetPassword: vi.fn() }));
vi.mock('../lib/authClient', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../lib/authClient')>()),
    verifyEmail: mocks.verifyEmail,
    resetPassword: mocks.resetPassword,
}));

beforeEach(() => {
    mocks.verifyEmail.mockReset().mockResolvedValue(undefined);
    mocks.resetPassword.mockReset().mockResolvedValue(undefined);
});
afterEach(cleanup);

const at = (path: string, page: React.ReactNode) => render(<MemoryRouter initialEntries={[path]}>{page}</MemoryRouter>);

describe('the confirmation link page', () => {
    it('uses the link once and says the address is confirmed, with a way to sign in', async () => {
        at('/verify-email?token=abc', <VerifyEmailPage />);
        expect(await screen.findByText(/email address is confirmed/)).toBeInTheDocument();
        expect(mocks.verifyEmail).toHaveBeenCalledTimes(1);
        expect(mocks.verifyEmail).toHaveBeenCalledWith('abc');
        expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/?signin=1');
    });

    it('says why when the link is used up or expired', async () => {
        mocks.verifyEmail.mockRejectedValue(new AuthError('invalid_token', 'This link has expired or was already used.', 400));
        at('/verify-email?token=old', <VerifyEmailPage />);
        expect(await screen.findByRole('alert')).toHaveTextContent('This link has expired or was already used.');
    });

    it('does not call the backend when there is no token in the address', () => {
        at('/verify-email', <VerifyEmailPage />);
        expect(screen.getByRole('alert')).toHaveTextContent('incomplete');
        expect(mocks.verifyEmail).not.toHaveBeenCalled();
    });
});

describe('the password reset page', () => {
    const fill = (a: string, b: string) => {
        fireEvent.change(screen.getByLabelText('New password'), { target: { value: a } });
        fireEvent.change(screen.getByLabelText('New password again'), { target: { value: b } });
    };

    it('sets the new password with the token from the link, then offers to sign in', async () => {
        at('/reset-password?token=tok', <ResetPasswordPage />);
        fill('a brand new password', 'a brand new password');
        fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
        await waitFor(() => expect(mocks.resetPassword).toHaveBeenCalledWith({ token: 'tok', password: 'a brand new password' }));
        expect(await screen.findByText(/password was changed/)).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/?signin=1');
    });

    it('does not send anything when the two passwords differ', () => {
        at('/reset-password?token=tok', <ResetPasswordPage />);
        fill('a brand new password', 'something different');
        fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
        expect(screen.getByRole('alert')).toHaveTextContent('not the same');
        expect(mocks.resetPassword).not.toHaveBeenCalled();
    });

    it('shows what the server said when the link no longer works, and keeps what was typed', async () => {
        mocks.resetPassword.mockRejectedValue(new AuthError('invalid_token', 'This link has expired or was already used. Please ask for a new one.', 400));
        at('/reset-password?token=old', <ResetPasswordPage />);
        fill('a brand new password', 'a brand new password');
        fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('expired or was already used');
        expect(screen.getByLabelText('New password')).toHaveValue('a brand new password');
    });

    it('cannot be submitted without a token in the address', () => {
        at('/reset-password', <ResetPasswordPage />);
        expect(screen.getByRole('alert')).toHaveTextContent('incomplete');
        expect(screen.getByRole('button', { name: 'Change password' })).toBeDisabled();
    });
});
