import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LandingPage from './LandingPage';
import { SettingsProvider } from '../contexts/SettingsContext';
import { ARTICLES } from '../content/articles';

const asked = vi.hoisted(() => ({ limits: [] as number[] }));

vi.mock('../lib/communityApi', () => ({
    fetchRecipePreviews: (limit: number) => { asked.limits.push(limit); return Promise.resolve([]); },
}));
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

describe('The landing page demo', () => {
    it('offers "Try the demo" to a visitor who is not signed in', async () => {
        await renderAt('/');
        expect(screen.getByRole('button', { name: 'Try the demo' })).toBeInTheDocument();
    });

    it('opens the sign-up form from the demo banner\'s link, and cleans the address', async () => {
        await renderAt('/?signup=1');
        expect(screen.getByLabelText(/Username/i)).toBeInTheDocument();   // only the sign-up form asks for a username
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

    it('previews shared recipes through the narrow public preview, which needs no sign-in', async () => {
        asked.limits.length = 0;
        await renderAt('/');
        expect(asked.limits).toEqual([3]);
    });
});
