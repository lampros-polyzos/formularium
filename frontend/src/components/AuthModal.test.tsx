import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import AuthModal from './AuthModal';
import { supabase } from '../lib/supabase';

// Mock Supabase and Turnstile
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

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue({ data: { user: {} }, error: null }),
      signUp: vi.fn().mockResolvedValue({ data: { user: {} }, error: null }),
      signInWithOAuth: vi.fn().mockResolvedValue({ error: null }),
    },
  },
}));

describe('AuthModal', () => {
  it('submits the login form with email and password', async () => {
    render(<AuthModal isOpen={true} onClose={vi.fn()} />);

    // Target inputs
    fireEvent.change(screen.getByLabelText(/Email address/i), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/Password/i), {
      target: { value: 'password123' },
    });

    // Wait until the button becomes enabled
    const submitButton = screen.getByRole('button', { name: /Sign In/i });
    await waitFor(() => {
      expect(submitButton).toBeEnabled();
    });

    // Submit
    fireEvent.click(submitButton);

    // Verify payload includes captchaToken
    await waitFor(() => {
      expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
        options: {
          captchaToken: 'mock-captcha-token',
        },
      });
    });
  });
});