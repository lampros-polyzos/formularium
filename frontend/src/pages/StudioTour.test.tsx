import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StudioPage from './StudioPage';
import { NAV_ITEMS, STUDIO_TOUR_SEEN_KEY, STUDIO_WIDE_BREAKPOINT, studioTourSteps } from '../components/studioTourSteps';

const mocks = vi.hoisted(() => ({
    formulas: [] as Record<string, unknown>[],
    user: { id: 'u1', email: 'sam@example.com' },
}));

vi.mock('../lib/supabase', () => {
    const builder = (table: string): Record<string, unknown> => {
        const b: Record<string, unknown> = {};
        for (const m of ['select', 'eq', 'order', 'limit', 'is', 'in', 'update', 'delete']) b[m] = () => b;
        b.then = (resolve: (v: unknown) => void) => resolve({ data: table === 'formulations' ? mocks.formulas : [], error: null });
        return b;
    };
    return {
        supabase: {
            auth: { signOut: vi.fn() },
            from: builder,
            channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
            removeChannel: vi.fn(),
        },
    };
});
vi.mock('../lib/batches', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../lib/batches')>()),
    countDueChecks: () => Promise.resolve(0),
    listDueChecks: () => Promise.resolve([]),
}));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: mocks.user, session: null, username: null, isLoading: false }) }));
vi.mock('../contexts/SettingsContext', () => ({
    useSettings: () => ({ currency: '$', setCurrency: vi.fn(), dateFormat: 'en-US', setDateFormat: vi.fn(), warningDays: 30, setWarningDays: vi.fn(), formatDate: (d: string) => d }),
}));

const setWidth = (px: number) => Object.defineProperty(window, 'innerWidth', { value: px, configurable: true, writable: true });

function renderStudio() {
    return render(
        <MemoryRouter initialEntries={['/studio']}>
            <Routes>
                <Route path="/studio" element={<StudioPage />} />
                <Route path="/studio/start" element={<p>START PAGE</p>} />
            </Routes>
        </MemoryRouter>
    );
}

const tour = () => screen.queryByRole('dialog', { name: /./ });
const stepTitle = () => within(screen.getByRole('dialog')).getByRole('heading').textContent ?? '';
const next = () => fireEvent.click(screen.getByRole('button', { name: /^(Let's go|Next|Got it)$/ }));

beforeEach(() => {
    localStorage.clear();
    mocks.formulas = [{ id: 'f1', name: 'Day Cream', profile_id: 'ow_lotion', target_weight_g: 100, created_at: '2026-11-01', status: 'Draft' }];
    setWidth(1280);
});
afterEach(cleanup);

describe('the Studio tour', () => {
    it('starts by itself on a first visit, once the formulas are on screen', async () => {
        renderStudio();
        expect(await screen.findByText('Day Cream')).toBeInTheDocument();
        await waitFor(() => expect(tour()).toBeInTheDocument(), { timeout: 3000 });
        expect(within(screen.getByRole('dialog')).getByRole('heading', { name: /Welcome to your Studio/ })).toBeInTheDocument();
        expect(screen.getByText(/1 \/ 15/)).toBeInTheDocument();
    });

    it('walks through every step in order and ends with a button that fits the page', async () => {
        renderStudio();
        await waitFor(() => expect(tour()).toBeInTheDocument(), { timeout: 3000 });
        const seen: string[] = [];
        while (!screen.queryByRole('button', { name: 'Got it' })) {
            seen.push(stepTitle());
            next();
        }
        seen.push(stepTitle());
        expect(seen).toEqual([
            expect.stringContaining('Welcome to your Studio'),
            '1. Start a formula',
            '2. Your formulas live here',
            '3. Your menu',
            'Menu: Batches', 'Menu: My Stash', 'Menu: What can I make?', 'Menu: Shopping List', 'Menu: Containers',
            'Menu: Calculators', 'Menu: Metrics', 'Menu: Ingredients Library', 'Menu: Settings',
            '4. The top bar',
            "You're all set",
        ]);
        expect(screen.queryByRole('button', { name: 'Start formulating' })).not.toBeInTheDocument();
    });

    it('is remembered once finished, and does not start again on the next visit', async () => {
        const first = renderStudio();
        await waitFor(() => expect(tour()).toBeInTheDocument(), { timeout: 3000 });
        while (!screen.queryByRole('button', { name: 'Got it' })) next();
        fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
        expect(tour()).not.toBeInTheDocument();
        expect(localStorage.getItem(STUDIO_TOUR_SEEN_KEY)).toBe('1');
        first.unmount();

        renderStudio();
        expect(await screen.findByText('Day Cream')).toBeInTheDocument();
        await act(async () => { await new Promise(r => setTimeout(r, 700)); });
        expect(tour()).not.toBeInTheDocument();
    });

    it('is remembered when skipped, too', async () => {
        renderStudio();
        await waitFor(() => expect(tour()).toBeInTheDocument(), { timeout: 3000 });
        fireEvent.click(screen.getByRole('button', { name: 'Skip tour' }));
        expect(tour()).not.toBeInTheDocument();
        expect(localStorage.getItem(STUDIO_TOUR_SEEN_KEY)).toBe('1');
    });

    it('does not start when it has been seen, but can be replayed with the Tour button', async () => {
        localStorage.setItem(STUDIO_TOUR_SEEN_KEY, '1');
        renderStudio();
        expect(await screen.findByText('Day Cream')).toBeInTheDocument();
        await act(async () => { await new Promise(r => setTimeout(r, 700)); });
        expect(tour()).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Tour/ }));
        expect(within(screen.getByRole('dialog')).getByRole('heading', { name: /Welcome to your Studio/ })).toBeInTheDocument();
    });

    it('starts on a Studio with no formulas yet too', async () => {
        mocks.formulas = [];
        renderStudio();
        await waitFor(() => expect(tour()).toBeInTheDocument(), { timeout: 3000 });
        expect(screen.getByText('Create new formulation')).toBeInTheDocument();
    });

    it('goes back a step and closes with Escape', async () => {
        renderStudio();
        await waitFor(() => expect(tour()).toBeInTheDocument(), { timeout: 3000 });
        next();
        expect(stepTitle()).toBe('1. Start a formula');
        fireEvent.click(screen.getByRole('button', { name: 'Back' }));
        expect(within(screen.getByRole('dialog')).getByRole('heading', { name: /Welcome to your Studio/ })).toBeInTheDocument();
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(tour()).not.toBeInTheDocument();
    });

    it('does not block the page from being used once closed', async () => {
        localStorage.setItem(STUDIO_TOUR_SEEN_KEY, '1');
        renderStudio();
        fireEvent.click(await screen.findByRole('button', { name: '+ New Formulation' }));
        expect(screen.getByText('START PAGE')).toBeInTheDocument();
    });
});

describe('what the Studio tour points at', () => {
    const targetsOf = (wide: boolean) => studioTourSteps(wide).flatMap(s => (s.target ? [s.target] : []));
    const NAV = ['nav-batches', 'nav-stash', 'nav-pantry', 'nav-shopping', 'nav-containers', 'nav-tools', 'nav-metrics', 'nav-library', 'nav-settings'];

    it('points at each sidebar entry in turn on a wide screen, and at the menu button on a narrow one', () => {
        expect(targetsOf(true)).toEqual(['studio-new', 'studio-formulas', 'studio-sidebar', ...NAV, 'header']);
        expect(targetsOf(false)).toEqual(['studio-new', 'studio-formulas', 'studio-menu', 'header']);
        expect(STUDIO_WIDE_BREAKPOINT).toBe(1024);
    });

    it('opens and closes with a centered welcome and goodbye that point at nothing', () => {
        for (const wide of [true, false]) {
            const steps = studioTourSteps(wide);
            expect(steps[0].target).toBeUndefined();
            expect(steps.at(-1)!.target).toBeUndefined();
        }
        expect(studioTourSteps(true)).toHaveLength(15);
        expect(studioTourSteps(false)).toHaveLength(6);
    });

    it('only points at things that are really on the page', async () => {
        renderStudio();
        expect(await screen.findByText('Day Cream')).toBeInTheDocument();
        for (const target of new Set([...targetsOf(true), ...targetsOf(false)])) {
            expect(document.querySelector(`[data-tour="${target}"]`), target).not.toBeNull();
        }
    });

    it('points each menu step at the entry it is about', async () => {
        renderStudio();
        expect(await screen.findByText('Day Cream')).toBeInTheDocument();
        for (const item of NAV_ITEMS) {
            const el = document.querySelector(`[data-tour="${item.target}"]`)!;
            expect(el.textContent, item.target).toContain(item.label);
            expect(studioTourSteps(true).find(s => s.target === item.target)!.title).toBe(`Menu: ${item.label}`);
        }
    });

    it('covers every entry of the sidebar, apart from the Studio home you are already on', async () => {
        renderStudio();
        expect(await screen.findByText('Day Cream')).toBeInTheDocument();
        const nav = within(screen.getByRole('navigation', { name: 'Studio' }));
        const labels = [...nav.getAllByRole('link'), nav.getByRole('button', { name: 'Settings' })].map(e => e.textContent?.trim() ?? '');
        const covered = NAV_ITEMS.map(i => i.label);
        for (const label of labels) {
            if (label === 'My Formulations') continue;
            expect(covered, `the tour should mention "${label}"`).toContain(label);
        }
        expect(covered).toHaveLength(labels.length - 1);
    });

    it('gives every entry real detail, not just a name', () => {
        for (const item of NAV_ITEMS) {
            const { container } = render(<div>{item.body}</div>);
            expect(container.textContent!.length, item.label).toBeGreaterThan(150);
            expect(item.short.length, item.label).toBeGreaterThan(20);
            cleanup();
        }
    });

    it('lists every entry in the one narrow-screen step', () => {
        const { container } = render(<div>{studioTourSteps(false).find(s => s.target === 'studio-menu')!.body}</div>);
        const items = [...container.querySelectorAll('li')].map(li => li.textContent ?? '');
        expect(items).toHaveLength(NAV_ITEMS.length);
        NAV_ITEMS.forEach((item, n) => expect(items[n]).toContain(item.label));
    });
});

describe('the Studio tour on a narrow screen', () => {
    it('points at the menu button instead of the hidden sidebar', async () => {
        setWidth(500);
        renderStudio();
        await waitFor(() => expect(tour()).toBeInTheDocument(), { timeout: 3000 });
        next(); next(); next();
        expect(stepTitle()).toBe('3. Your menu');
        expect(within(screen.getByRole('dialog')).getAllByRole('listitem')).toHaveLength(NAV_ITEMS.length);
    });
});
