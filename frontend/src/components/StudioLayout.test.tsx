import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StudioLayout from './StudioLayout';
import StudioSidebar, { type StudioSection } from './StudioSidebar';
import ToolsPage from '../pages/ToolsPage';

const mocks = vi.hoisted(() => ({
    signOut: vi.fn(),
    due: 0,
    user: { id: 'u1', email: 'sam@example.com' } as { id: string; email: string } | null,
}));

vi.mock('../lib/supabase', () => {
    // The header's notification bell reads and listens for notifications when someone is signed in
    const builder = (): Record<string, unknown> => {
        const b: Record<string, unknown> = {};
        for (const m of ['select', 'eq', 'order', 'limit', 'is', 'in', 'update']) b[m] = () => b;
        b.then = (resolve: (v: unknown) => void) => resolve({ data: [], error: null });
        return b;
    };
    return {
        supabase: {
            auth: { signOut: mocks.signOut },
            from: () => builder(),
            channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
            removeChannel: vi.fn(),
        },
    };
});
vi.mock('../lib/batches', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../lib/batches')>()),
    countDueChecks: () => Promise.resolve(mocks.due),
}));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: mocks.user, session: null, username: null, isLoading: false }) }));
vi.mock('../contexts/SettingsContext', () => ({
    useSettings: () => ({ currency: '$', setCurrency: vi.fn(), dateFormat: 'en-US', setDateFormat: vi.fn(), warningDays: 30, setWarningDays: vi.fn(), formatDate: (d: string) => d }),
}));

const settle = () => act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); });

beforeEach(() => {
    mocks.signOut.mockReset().mockResolvedValue(undefined);
    mocks.due = 0;
    mocks.user = { id: 'u1', email: 'sam@example.com' };
});
afterEach(cleanup);

async function renderSidebar(active: StudioSection | null = 'stash', path = '/stash') {
    render(
        <MemoryRouter initialEntries={[path]}>
            <Routes>
                <Route path="*" element={<StudioSidebar active={active} />} />
                <Route path="/" element={<p>HOME</p>} />
            </Routes>
        </MemoryRouter>
    );
    await settle();
}

describe('the Studio sidebar', () => {
    it('lists every Studio page, in order, linking to the right place', async () => {
        await renderSidebar();
        const nav = screen.getByRole('navigation', { name: 'Studio' });
        const links = within(nav).getAllByRole('link').map(a => [a.textContent, a.getAttribute('href')]);
        expect(links).toEqual([
            ['My Formulations', '/studio'],
            ['Batches', '/batches'],
            ['My Stash', '/stash'],
            ['Containers', '/containers'],
            ['Calculators', '/tools'],
            ['Ingredients Library', '/library'],
        ]);
        expect(within(nav).getByRole('button', { name: 'Settings' })).toBeInTheDocument();
    });

    it('gives every item an icon', async () => {
        await renderSidebar();
        const nav = screen.getByRole('navigation', { name: 'Studio' });
        for (const row of [...within(nav).getAllByRole('link'), within(nav).getByRole('button', { name: 'Settings' })]) {
            expect(row.querySelector('svg'), row.textContent ?? '').not.toBeNull();
        }
    });

    it.each([
        ['formulations', 'My Formulations'], ['batches', 'Batches'], ['stash', 'My Stash'],
        ['containers', 'Containers'], ['tools', 'Calculators'], ['library', 'Ingredients Library'],
    ] as const)('shows when you are on %s, and only there', async (section, label) => {
        await renderSidebar(section);
        const current = screen.getAllByRole('link').filter(a => a.getAttribute('aria-current') === 'page');
        expect(current.map(a => a.textContent)).toEqual([label]);
    });

    it('marks nothing as current for a page outside the list', async () => {
        await renderSidebar(null);
        expect(screen.getAllByRole('link').some(a => a.hasAttribute('aria-current'))).toBe(false);
    });

    it('shows how many check-ins are due next to Batches', async () => {
        mocks.due = 3;
        await renderSidebar();
        expect(screen.getByLabelText('3 check-ins due')).toBeInTheDocument();
    });

    it('shows who is signed in', async () => {
        await renderSidebar();
        expect(screen.getByText('sam@example.com')).toBeInTheDocument();
    });

    it('opens the settings from any page without leaving it', async () => {
        await renderSidebar('batches', '/batches');
        fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
        expect(screen.getByRole('heading', { name: 'Global Settings' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Batches' })).toHaveAttribute('aria-current', 'page');
    });

    it('shows the settings above the whole page, not trapped inside the sticky sidebar where the top bar would cover it', async () => {
        await renderSidebar('stash');
        fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
        const heading = screen.getByRole('heading', { name: 'Global Settings' });
        expect(heading.closest('aside')).toBeNull();
        expect((heading.closest('.fixed') as HTMLElement).parentElement).toBe(document.body);
    });

    it('takes the settings away again when they are closed', async () => {
        await renderSidebar();
        fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
        fireEvent.click(screen.getByRole('button', { name: '×' }));
        expect(screen.queryByRole('heading', { name: 'Global Settings' })).not.toBeInTheDocument();
        expect(document.body.querySelector('.fixed')).toBeNull();
    });

    it('signs out and goes home', async () => {
        await renderSidebar();
        fireEvent.click(screen.getByRole('button', { name: 'Sign Out' }));
        await settle();
        expect(mocks.signOut).toHaveBeenCalledTimes(1);
        expect(screen.getByText('HOME')).toBeInTheDocument();
    });
});

describe('the Studio layout', () => {
    function renderLayout(active: StudioSection) {
        render(
            <MemoryRouter initialEntries={['/somewhere']}>
                <Routes>
                    <Route path="/somewhere" element={<StudioLayout active={active} title="Some page"><main>PAGE CONTENT</main></StudioLayout>} />
                    <Route path="/studio" element={<p>STUDIO HOME</p>} />
                </Routes>
            </MemoryRouter>
        );
    }

    it('puts the sidebar, the title and the page together', async () => {
        renderLayout('stash');
        await settle();
        expect(screen.getByRole('navigation', { name: 'Studio' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Some page' })).toBeInTheDocument();
        expect(screen.getByText('PAGE CONTENT')).toBeInTheDocument();
    });

    it('offers "Back to Studio" at the top left of every other page, and it goes there', async () => {
        renderLayout('batches');
        await settle();
        fireEvent.click(screen.getByRole('button', { name: /Back to Studio/ }));
        expect(screen.getByText('STUDIO HOME')).toBeInTheDocument();
    });

    it('does not offer it on the Studio home itself', async () => {
        renderLayout('formulations');
        await settle();
        expect(screen.queryByRole('button', { name: /Back to Studio/ })).not.toBeInTheDocument();
    });
});

describe('Calculators, which is public', () => {
    const renderTools = async () => {
        render(<MemoryRouter initialEntries={['/tools']}><Routes><Route path="/tools" element={<ToolsPage />} /><Route path="/studio" element={<p>STUDIO HOME</p>} /></Routes></MemoryRouter>);
        await settle();
    };

    it('offers the way back to the Studio when you are signed in', async () => {
        await renderTools();
        fireEvent.click(screen.getByRole('button', { name: /Back to Studio/ }));
        expect(screen.getByText('STUDIO HOME')).toBeInTheDocument();
    });

    it('does not when you are not', async () => {
        mocks.user = null;
        await renderTools();
        expect(screen.queryByRole('button', { name: /Back to Studio/ })).not.toBeInTheDocument();
    });
});
