import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AuthModal from './AuthModal';
import { AuthError } from '../lib/authClient';

const mocks = vi.hoisted(() => ({ login: vi.fn(), register: vi.fn(), loginWithGoogle: vi.fn(), resendVerification: vi.fn(), forgotPassword: vi.fn(), completeMfaLogin: vi.fn() }));

vi.mock('../lib/authClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/authClient')>()),
  login: mocks.login,
  register: mocks.register,
  loginWithGoogle: mocks.loginWithGoogle,
  resendVerification: mocks.resendVerification,
  forgotPassword: mocks.forgotPassword,
  completeMfaLogin: mocks.completeMfaLogin,
}));

vi.mock('@marsidev/react-turnstile', () => ({
  Turnstile: ({ onSuccess }: { onSuccess: (token: string) => void }) => {
    // Fire synchronously during initial mount
    const fired = React.useRef(false);
    if (!fired.current) {
      fired.current = true;
      // Queue microtask so React processes it right after initial render
      queueMicrotask(() => onSuccess('mock-captcha-token'));
    }
    return <div data-testid="turnstile-mock" />;
  },
}));

beforeEach(() => {
  vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '');   // whatever the developer's own .env says
  mocks.login.mockReset().mockResolvedValue({ id: 'u1', email: 'test@example.com', username: 'tester' });
  mocks.register.mockReset().mockResolvedValue({ id: 'u1', email: 'test@example.com', username: 'tester' });
  mocks.loginWithGoogle.mockReset();
  mocks.resendVerification.mockReset().mockResolvedValue(undefined);
  mocks.forgotPassword.mockReset().mockResolvedValue(undefined);
  mocks.completeMfaLogin.mockReset().mockResolvedValue({ id: 'u1', email: 'test@example.com', username: 'tester' });
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

const type = (label: RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('AuthModal', () => {
  it('submits the login form with email, password and the bot-check token, then closes', async () => {
    const onClose = vi.fn();
    render(<AuthModal isOpen={true} onClose={onClose} />);
    type(/Email address/i, 'test@example.com');
    type(/Password/i, 'password123');

    const submitButton = screen.getByRole('button', { name: /Sign In/i });
    await waitFor(() => expect(submitButton).toBeEnabled());
    fireEvent.click(submitButton);

    await waitFor(() => expect(mocks.login).toHaveBeenCalledWith({ email: 'test@example.com', password: 'password123', captchaToken: 'mock-captcha-token' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(screen.queryByLabelText(/Username/i)).not.toBeInTheDocument();   // only sign-up asks for a username
  });

  it('signs up with a username, and signs you straight in', async () => {
    const onClose = vi.fn();
    render(<AuthModal isOpen={true} onClose={onClose} initialMode="signup" />);
    type(/Username/i, '  sam_the_maker ');
    expect(screen.getByLabelText(/Username/i)).toHaveValue('sam_the_maker');   // spaces are not allowed in a username
    type(/Email address/i, 'sam@example.com');
    type(/Password/i, 'a long enough password');

    const submitButton = screen.getByRole('button', { name: /Sign Up/i });
    await waitFor(() => expect(submitButton).toBeEnabled());
    fireEvent.click(submitButton);

    await waitFor(() => expect(mocks.register).toHaveBeenCalledWith({
      email: 'sam@example.com', password: 'a long enough password', username: 'sam_the_maker', captchaToken: 'mock-captcha-token',
    }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('shows what the server said when the sign-in is refused, and stays open', async () => {
    mocks.login.mockRejectedValue(new AuthError('invalid_credentials', 'The email or password is not right.', 401));
    const onClose = vi.fn();
    render(<AuthModal isOpen={true} onClose={onClose} />);
    type(/Email address/i, 'test@example.com');
    type(/Password/i, 'wrong');
    const submitButton = screen.getByRole('button', { name: /Sign In/i });
    await waitFor(() => expect(submitButton).toBeEnabled());
    fireEvent.click(submitButton);

    expect(await screen.findByText('The email or password is not right.')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    await waitFor(() => expect(submitButton).toBeEnabled());
  });

  it('shows no Google button when the site has no Google client id', () => {
    render(<AuthModal isOpen={true} onClose={vi.fn()} />);
    expect(screen.queryByTestId('google-button')).not.toBeInTheDocument();
  });

  it('when the email must be confirmed first, signing up does not close the form but asks you to open the link', async () => {
    mocks.register.mockResolvedValue(null);
    const onClose = vi.fn();
    render(<AuthModal isOpen={true} onClose={onClose} initialMode="signup" />);
    type(/Username/i, 'sam');
    type(/Email address/i, 'sam@example.com');
    type(/Password/i, 'a long enough password');
    const submit = screen.getByRole('button', { name: /Sign Up/i });
    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.click(submit);

    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('sam@example.com');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('a refused sign-in for an unconfirmed email leads to the same screen, where a new link can be asked for', async () => {
    mocks.login.mockRejectedValue(new AuthError('email_not_verified', 'Please confirm your email address first.', 403));
    render(<AuthModal isOpen={true} onClose={vi.fn()} />);
    type(/Email address/i, 'sam@example.com');
    type(/Password/i, 'a long enough password');
    const submit = screen.getByRole('button', { name: /Sign In/i });
    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.click(submit);

    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
    const send = screen.getByRole('button', { name: 'Send a new link' });
    await waitFor(() => expect(send).toBeEnabled());
    fireEvent.click(send);
    await waitFor(() => expect(mocks.resendVerification).toHaveBeenCalledWith({ email: 'sam@example.com', captchaToken: 'mock-captcha-token' }));
    expect(await screen.findByText(/we sent a new link/i)).toBeInTheDocument();
  });

  it('"Forgot your password?" asks for the email and sends a reset link, saying the same whatever the address', async () => {
    render(<AuthModal isOpen={true} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Forgot your password?' }));
    expect(screen.getByRole('heading', { name: 'Reset your password' })).toBeInTheDocument();
    type(/Email address/i, 'nobody@example.com');
    const send = screen.getByRole('button', { name: 'Send reset link' });
    await waitFor(() => expect(send).toBeEnabled());
    fireEvent.click(send);

    await waitFor(() => expect(mocks.forgotPassword).toHaveBeenCalledWith({ email: 'nobody@example.com', captchaToken: 'mock-captcha-token' }));
    expect(await screen.findByText(/If that address has an account/)).toBeInTheDocument();
  });

  it('goes back to the sign-in form from the reset screen', () => {
    render(<AuthModal isOpen={true} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Forgot your password?' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back to sign in' }));
    expect(screen.getByRole('button', { name: /Sign In/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Forgot your password?' })).toBeInTheDocument();
  });

  it('offers no password reset on the sign-up form', () => {
    render(<AuthModal isOpen={true} onClose={vi.fn()} initialMode="signup" />);
    expect(screen.queryByRole('button', { name: 'Forgot your password?' })).not.toBeInTheDocument();
  });
});

describe('AuthModal: the second step', () => {
  const CHALLENGE = { mfaRequired: true, mfaToken: 'one-time-token' };

  /** Fills in and submits the password form of an account that has two-step verification. */
  const submitPassword = async () => {
    type(/Email address/i, 'test@example.com');
    type(/Password/i, 'password123');
    const button = screen.getByRole('button', { name: /Sign In/i });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
  };

  it('asks for the code after a right password, instead of closing', async () => {
    mocks.login.mockResolvedValue(CHALLENGE);
    const onClose = vi.fn();
    render(<AuthModal isOpen={true} onClose={onClose} />);
    await submitPassword();

    expect(await screen.findByText(/Two-step verification/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Code$/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Password/i)).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();   // nobody is signed in yet
  });

  it('signs in with the code and the one-time token, then closes', async () => {
    mocks.login.mockResolvedValue(CHALLENGE);
    const onClose = vi.fn();
    render(<AuthModal isOpen={true} onClose={onClose} />);
    await submitPassword();

    await screen.findByLabelText(/^Code$/i);
    const verify = screen.getByRole('button', { name: /Verify/i });
    expect(verify).toBeDisabled();   // not before there is a code
    type(/^Code$/i, ' 123456 ');
    fireEvent.click(verify);

    await waitFor(() => expect(mocks.completeMfaLogin).toHaveBeenCalledWith('one-time-token', '123456'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('takes a recovery code in the same box', async () => {
    mocks.login.mockResolvedValue(CHALLENGE);
    render(<AuthModal isOpen={true} onClose={vi.fn()} />);
    await submitPassword();
    await screen.findByLabelText(/^Code$/i);
    type(/^Code$/i, 'ABCDE-FGHIJ');
    fireEvent.click(screen.getByRole('button', { name: /Verify/i }));
    await waitFor(() => expect(mocks.completeMfaLogin).toHaveBeenCalledWith('one-time-token', 'ABCDE-FGHIJ'));
  });

  it('shows why a wrong code failed, keeps the window open and empties the box', async () => {
    mocks.login.mockResolvedValue(CHALLENGE);
    mocks.completeMfaLogin.mockRejectedValue(new AuthError('invalid_code', 'That code is not right. Check the app, or use a recovery code.', 401));
    const onClose = vi.fn();
    render(<AuthModal isOpen={true} onClose={onClose} />);
    await submitPassword();
    await screen.findByLabelText(/^Code$/i);
    type(/^Code$/i, '000000');
    fireEvent.click(screen.getByRole('button', { name: /Verify/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('That code is not right');
    expect(screen.getByLabelText(/^Code$/i)).toHaveValue('');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('goes back to the sign-in form, with the reason, when the sign-in took too long or had too many wrong codes', async () => {
    mocks.login.mockResolvedValue(CHALLENGE);
    mocks.completeMfaLogin.mockRejectedValue(new AuthError('mfa_expired', 'Too many wrong codes. Please sign in again.', 401));
    render(<AuthModal isOpen={true} onClose={vi.fn()} />);
    await submitPassword();
    await screen.findByLabelText(/^Code$/i);
    type(/^Code$/i, '000000');
    fireEvent.click(screen.getByRole('button', { name: /Verify/i }));

    expect(await screen.findByText(/Too many wrong codes/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sign In/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Code$/i)).not.toBeInTheDocument();
  });

  it('lets you go back to the form from the code screen', async () => {
    mocks.login.mockResolvedValue(CHALLENGE);
    render(<AuthModal isOpen={true} onClose={vi.fn()} />);
    await submitPassword();
    await screen.findByLabelText(/^Code$/i);
    fireEvent.click(screen.getByRole('button', { name: /Back to sign in/i }));
    expect(await screen.findByRole('button', { name: /Sign In/i })).toBeInTheDocument();
  });
});
