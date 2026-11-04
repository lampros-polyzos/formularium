import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LandingPage from './LandingPage';
import { SettingsProvider } from '../contexts/SettingsContext';
import { ARTICLES } from '../content/articles';

const asked = vi.hoisted(() => ({ postTypes: [] as unknown[] }));

vi.mock('../lib/supabase', () => {
    const builder = (): Record<string, unknown> => {
        const b: Record<string, unknown> = {};
        for (const m of ['select', 'order', 'limit', 'in', 'ilike', 'or']) b[m] = () => b;
        b.eq = (column: string, value: unknown) => { if (column === 'post_type') asked.postTypes.push(value); return b; };
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

describe('The landing page blog preview', () => {
    it('shows the three newest of our own articles', async () => {
        await renderAt('/');
        const section = screen.getByRole('heading', { name: 'New to formulating? Start here' }).closest('section')!;
        for (const article of ARTICLES.slice(0, 3)) expect(section).toHaveTextContent(article.title);
        expect(section).not.toHaveTextContent(/from the community|Sign in to read the full post/i);
        expect(section).toHaveTextContent('Plain-language guides for home formulators, free for everyone.');
    });

    it('only previews shared recipes from the community, never member articles', async () => {
        asked.postTypes.length = 0;
        await renderAt('/');
        expect(asked.postTypes).toEqual(['formulation']);
    });
});
