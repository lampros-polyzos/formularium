import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import AuthModal from './AuthModal';
import { supabase } from '../lib/supabase';

// Mock Supabase and Turnstile
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { signInWithPassword: vi.fn().mockResolvedValue({ data: {}, error: null }) },
  },
}));

vi.mock('@marsidev/react-turnstile', () => ({
  Turnstile: () => <div data-testid="turnstile-mock" />,
}));

describe('AuthModal', () => {
  it('submits the login form with email and password', async () => {
    const handleClose = vi.fn();
    render(<AuthModal isOpen={true} onClose={handleClose} />);

    // Fill in the form
    fireEvent.change(screen.getByLabelText(/Email address/i), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/Password/i), {
      target: { value: 'password123' },
    });

    // Submit the form
    fireEvent.click(screen.getByRole('button', { name: /Sign In/i }));

    // Verify Supabase was called correctly
    await waitFor(() => {
      expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
      });
      expect(handleClose).toHaveBeenCalled();
    });
  });
});