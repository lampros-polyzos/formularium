import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LandingPage from './LandingPage';
import { SettingsProvider } from '../contexts/SettingsContext';

vi.mock('../lib/supabase', () => {
    const builder = (): Record<string, unknown> => {
        const b: Record<string, unknown> = {};
        for (const m of ['select', 'eq', 'order', 'limit', 'in', 'ilike', 'or']) b[m] = () => b;
        b.then = (resolve: (v: unknown) => void) => resolve({ data: [], error: null });
        return b;
    };
    return { supabase: { auth: { signOut: vi.fn() }, from: () => builder(), channel: vi.fn(), removeChannel: vi.fn() } };
});
vi.mock('../contexts/AuthContext', () => {
    const value = { user: null, session: null, username: null, isLoading: false };
    return { useAuth: () => value };
});

afterEach(cleanup);

async function renderAt(path: string) {
    render(<SettingsProvider><MemoryRouter initialEntries={[path]}><LandingPage /></MemoryRouter></SettingsProvider>);
    await act(async () => { await Promise.resolve(); });
}

describe('Landing page after an account is deleted', () => {
    it('confirms the deletion once, and the notice can be dismissed', async () => {
        await renderAt('/?account=deleted');
        expect(screen.getByRole('status')).toHaveTextContent('Your account and data have been deleted');
        fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
        expect(screen.queryByText(/have been deleted/)).not.toBeInTheDocument();
    });

    it('shows no notice on a normal visit', async () => {
        await renderAt('/');
        expect(screen.queryByText(/have been deleted/)).not.toBeInTheDocument();
    });
});
