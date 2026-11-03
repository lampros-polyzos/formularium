import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BlogPage from './BlogPage';
import BlogArticlePage from './BlogArticlePage';
import LearnHubPage from './LearnHubPage';
import { SettingsProvider } from '../contexts/SettingsContext';
import { ARTICLES } from '../content/articles';

const mocks = vi.hoisted(() => ({
    user: null as { id: string } | null,
    posts: [
        { id: 'post-1', title: 'My notes on cold-process butters', write_up: 'I tried melting shea at different temperatures and cooling it fast. Here is what happened to the grain.', tags: ['butters'], created_at: '2026-10-28T10:00:00Z', author_name: 'Sam' },
    ] as Record<string, unknown>[],
    error: null as unknown,
}));

vi.mock('../lib/supabase', () => {
    // Chainable query builder: .select().eq().eq().order() resolves to the table's rows
    const query = (result: () => unknown): Record<string, unknown> => ({
        eq: () => query(result),
        order: () => Promise.resolve(result()),
    });
    return {
        supabase: {
            auth: { signOut: vi.fn() },
            from: (table: string) => ({
                select: () => query(() => table === 'community_posts'
                    ? (mocks.error ? { data: null, error: mocks.error } : { data: mocks.posts, error: null })
                    : { data: [], error: null }),
            }),
            channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
            removeChannel: vi.fn(),
        },
    };
});

vi.mock('../contexts/AuthContext', () => ({
    useAuth: () => ({ user: mocks.user, session: null, username: null, isLoading: false }),
}));

afterEach(() => {
    cleanup();
    mocks.user = null;
    mocks.error = null;
});

function renderAt(path: string) {
    return render(
        <SettingsProvider>
            <MemoryRouter initialEntries={[path]}>
                <Routes>
                    <Route path="/blog" element={<BlogPage />} />
                    <Route path="/blog/:slug" element={<BlogArticlePage />} />
                    <Route path="/learn" element={<LearnHubPage />} />
                </Routes>
            </MemoryRouter>
        </SettingsProvider>
    );
}

describe('Blog page', () => {
    it('lists every article', () => {
        renderAt('/blog');
        expect(screen.getByRole('heading', { level: 1, name: /formulator's blog/i })).toBeInTheDocument();
        for (const article of ARTICLES) {
            expect(screen.getAllByText(article.title).length).toBeGreaterThan(0);
        }
    });

    it('filters by category and search, and recovers from an empty result', () => {
        renderAt('/blog');
        fireEvent.click(screen.getByRole('button', { name: /^Safety/ }));
        expect(screen.queryByText(/first formula: a simple 100 g lotion/i)).not.toBeInTheDocument();
        expect(screen.getByText(/preservatives 101/i)).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText(/search articles/i), { target: { value: 'zzzznothing' } });
        expect(screen.getByText(/no articles match/i)).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /clear filters/i }));
        expect(screen.getAllByText(/preservatives 101/i).length).toBeGreaterThan(0);
    });
});

describe('Blog with community articles', () => {
    it('merges community education posts into the feed', async () => {
        renderAt('/blog');
        expect(await screen.findByText('My notes on cold-process butters')).toBeInTheDocument();
        expect(screen.getAllByText(/preservatives 101/i).length).toBeGreaterThan(0);
        expect(screen.getByText(/by Sam/)).toBeInTheDocument();
    });

    it('filters to community articles only', async () => {
        renderAt('/blog');
        await screen.findByText('My notes on cold-process butters');
        fireEvent.click(within(screen.getByRole('group', { name: /filter by category/i })).getByRole('button', { name: /^Community/ }));
        expect(screen.getByText('My notes on cold-process butters')).toBeInTheDocument();
        expect(screen.queryByText(/preservatives 101/i)).not.toBeInTheDocument();
    });

    it('opens on the community filter from the URL', async () => {
        renderAt('/blog?filter=community');
        expect(await screen.findByText('My notes on cold-process butters')).toBeInTheDocument();
        expect(screen.queryByText(/preservatives 101/i)).not.toBeInTheDocument();
    });

    it('searches across both kinds', async () => {
        renderAt('/blog');
        await screen.findByText('My notes on cold-process butters');
        fireEvent.change(screen.getByLabelText(/search articles/i), { target: { value: 'grain' } });
        expect(screen.getByText('My notes on cold-process butters')).toBeInTheDocument();
    });

    it('tells logged-out visitors the full post is for members, and logged-in members get a link', async () => {
        const { unmount } = renderAt('/blog');
        expect(await screen.findByText(/sign in to read the full post/i)).toBeInTheDocument();
        unmount();

        mocks.user = { id: 'u1' };
        renderAt('/blog');
        const link = await screen.findByRole('link', { name: /my notes on cold-process butters/i });
        expect(link).toHaveAttribute('href', '/community/post-1');
    });

    it('still shows the guides if community posts fail to load', async () => {
        mocks.error = { message: 'boom' };
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        renderAt('/blog');
        await waitFor(() => expect(spy).toHaveBeenCalled());
        expect(screen.getAllByText(/preservatives 101/i).length).toBeGreaterThan(0);
        spy.mockRestore();
    });
});

describe('Blog article page', () => {
    it('renders the article with takeaways, recipe and table of contents', () => {
        renderAt('/blog/first-lotion-step-by-step');
        expect(screen.getByRole('heading', { level: 1, name: /your first formula/i })).toBeInTheDocument();
        expect(screen.getByText(/key takeaways/i)).toBeInTheDocument();
        expect(screen.getByText('Simple everyday lotion')).toBeInTheDocument();
        expect(screen.getByText('73.2%')).toBeInTheDocument();
        const toc = screen.getByRole('navigation', { name: /on this page/i });
        expect(within(toc).getByText('The formula')).toBeInTheDocument();
        expect(screen.getByText(/keep reading/i)).toBeInTheDocument();
    });

    it('renders inline links and bold text without raw markup', () => {
        renderAt('/blog/first-lotion-step-by-step');
        expect(document.body.textContent).not.toContain('**');
        expect(document.body.textContent).not.toMatch(/\]\(\//);
        const links = screen.getAllByRole('link', { name: /home lab starter kit/i });
        expect(links.length).toBeGreaterThan(0);
        for (const link of links) expect(link).toHaveAttribute('href', '/blog/home-lab-starter-kit');
    });

    it('renders the thickeners article for beginners, with every section, no raw markup and working links', () => {
        renderAt('/blog/thickeners-and-stable-emulsions');
        expect(screen.getByRole('heading', { level: 1, name: /why emulsions separate/i })).toBeInTheDocument();
        expect(screen.getAllByText('Beginner').length).toBeGreaterThan(0);
        const toc = within(screen.getByRole('navigation', { name: /on this page/i }));
        for (const heading of ['Why every emulsion wants to separate', 'Four ways an emulsion fails', 'Meet the main families', 'How to choose the right one', 'How to add a thickener without lumps', 'Fixing common problems', 'Quick checklist']) {
            expect(toc.getByText(heading)).toBeInTheDocument();
        }
        expect(document.body.textContent).not.toContain('**');
        expect(document.body.textContent).not.toMatch(/\]\(/);
        expect(screen.getByRole('link', { name: 'regulation text' })).toHaveAttribute('href', expect.stringContaining('eur-lex.europa.eu'));
        expect(screen.getByRole('link', { name: 'HLB calculator' })).toHaveAttribute('href', '/tools?tool=hlb');
        expect(screen.getByText(/Planning to sell in the EU/)).toBeInTheDocument();
    });

    it('covers the four instability mechanisms and the main thickener families', () => {
        const text = ARTICLES.find(a => a.slug === 'thickeners-and-stable-emulsions')!.body
            .map(b => ('text' in b ? b.text : 'items' in b ? b.items.join(' ') : 'rows' in b ? b.rows.flat().join(' ') : '')).join(' ');
        for (const word of ['Creaming', 'Flocculation', 'Coalescence', 'Ostwald ripening', 'Stokes', 'yield stress', 'shear-thinning', 'Carbomer', 'Xanthan', 'Gellan', 'Carrageenan', 'Alginate', 'Konjac', 'HEC', 'HPMC', 'Bentonite', 'Fumed silica', 'Turbiscan', 'Dynamic light scattering', 'Thixotropy']) {
            expect(text.toLowerCase(), word).toContain(word.toLowerCase());
        }
    });

    it('shows a friendly message for an unknown article', () => {
        renderAt('/blog/does-not-exist');
        expect(screen.getByText(/couldn't find that article/i)).toBeInTheDocument();
    });
});

describe('Learn hub', () => {
    it('opens on the learning path', () => {
        renderAt('/learn');
        expect(screen.getByRole('heading', { name: /learn to formulate/i })).toBeInTheDocument();
        expect(screen.getByText('Learn the language')).toBeInTheDocument();
    });

    it('switches tabs', () => {
        renderAt('/learn');
        fireEvent.click(screen.getByRole('tab', { name: /glossary/i }));
        expect(screen.getByText('Challenge test')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('tab', { name: /troubleshooting/i }));
        expect(screen.getByText(/my cream or lotion separates/i)).toBeInTheDocument();
    });

    it('opens the tab named in the URL', () => {
        renderAt('/learn?tab=faq');
        expect(screen.getByText(/do i need a preservative in every product/i)).toBeInTheDocument();
    });

    it('searches across the whole hub', () => {
        renderAt('/learn');
        fireEvent.change(screen.getByLabelText(/search the learn hub/i), { target: { value: 'grainy' } });
        expect(screen.getByText(/result/i)).toBeInTheDocument();
        expect(screen.getByText(/it feels grainy or gritty/i)).toBeInTheDocument();
        expect(screen.queryByRole('tab', { name: /glossary/i })).not.toBeInTheDocument();
    });

    it('converts percentages to grams', () => {
        renderAt('/learn');
        fireEvent.change(screen.getByLabelText(/batch size/i), { target: { value: '250' } });
        fireEvent.change(screen.getByLabelText(/percentage/i), { target: { value: '3' } });
        expect(screen.getByText('7.5 g')).toBeInTheDocument();
    });
});
