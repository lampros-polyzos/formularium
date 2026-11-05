import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AuthModal from './AuthModal';
import { AuthError } from '../lib/authClient';

const mocks = vi.hoisted(() => ({ login: vi.fn(), register: vi.fn(), loginWithGoogle: vi.fn() }));

vi.mock('../lib/authClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/authClient')>()),
  login: mocks.login,
  register: mocks.register,
  loginWithGoogle: mocks.loginWithGoogle,
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
});
