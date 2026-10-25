import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import { useAuth } from '../contexts/AuthContext';

// Mock the useAuth hook
vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

describe('ProtectedRoute', () => {
  it('displays a loading state when auth is still initializing', () => {
    vi.mocked(useAuth).mockReturnValue({ isLoading: true, user: null, session: null });

    const { container } = render(
      <MemoryRouter>
        <ProtectedRoute />
      </MemoryRouter>
    );

    // Verify the loading spinner is present via its CSS class
    expect(container.querySelector('.animate-spin')).toBeDefined();
  });

  it('redirects unauthenticated users to the root landing page', () => {
    vi.mocked(useAuth).mockReturnValue({ isLoading: false, user: null, session: null });

    render(
      <MemoryRouter initialEntries={['/studio']}>
        <Routes>
          <Route path="/" element={<div>Public Landing Page</div>} />
          <Route element={<ProtectedRoute />}>
            <Route path="/studio" element={<div>Private Studio Content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    // Verify redirect occurred
    expect(screen.getByText('Public Landing Page')).toBeDefined();
    expect(screen.queryByText('Private Studio Content')).toBeNull();
  });

  it('renders the protected content for authenticated users', () => {
    vi.mocked(useAuth).mockReturnValue({
      isLoading: false,
      user: { id: '123', email: 'user@example.com' } as any,
      session: { access_token: 'token' } as any,
    });

    render(
      <MemoryRouter initialEntries={['/studio']}>
        <Routes>
          <Route path="/" element={<div>Public Landing Page</div>} />
          <Route element={<ProtectedRoute />}>
            <Route path="/studio" element={<div>Private Studio Content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    // Verify the protected content is rendered
    expect(screen.getByText('Private Studio Content')).toBeDefined();
    expect(screen.queryByText('Public Landing Page')).toBeNull();
  });
});