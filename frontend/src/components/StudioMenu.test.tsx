import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import StudioLayout from './StudioLayout';
import type { StudioSection } from './StudioSidebar';

vi.mock('../lib/supabase', () => {
    const builder = (): Record<string, unknown> => {
        const b: Record<string, unknown> = {};
        for (const m of ['select', 'eq', 'order', 'limit', 'is', 'in', 'update']) b[m] = () => b;
        b.then = (resolve: (v: unknown) => void) => resolve({ data: [], error: null });
        return b;
    };
    return { supabase: { auth: { signOut: vi.fn() }, from: () => builder(), channel: () => ({ on: () => ({ subscribe: () => ({}) }) }), removeChannel: vi.fn() } };
});
vi.mock('../lib/batches', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../lib/batches')>()),
    countDueChecks: () => Promise.resolve(0),
}));
vi.mock('../contexts/AuthContext', () => {
    const value = { user: { id: 'u1', email: 'sam@example.com' }, session: null, username: null, isLoading: false };
    return { useAuth: () => value };
});
vi.mock('../contexts/SettingsContext', () => ({
    useSettings: () => ({ currency: '$', setCurrency: vi.fn(), dateFormat: 'en-US', setDateFormat: vi.fn(), warningDays: 30, setWarningDays: vi.fn(), formatDate: (d: string) => d }),
}));

afterEach(cleanup);

async function renderLayout(active: StudioSection = 'stash') {
    render(
        <MemoryRouter initialEntries={['/stash']}>
            <Routes>
                {/* "*" keeps the layout mounted when a link is followed, so its open/closed state can be seen */}
                <Route path="*" element={<StudioLayout active={active} title="My Stash"><main>PAGE</main></StudioLayout>} />
            </Routes>
        </MemoryRouter>
    );
    await act(async () => { await Promise.resolve(); });
}

const sidebar = () => document.getElementById('studio-sidebar')!;
const isOpen = () => sidebar().getAttribute('data-open') === 'true';
const backdrop = () => document.querySelector('[data-studio-backdrop]');

describe('the Studio menu on small screens', () => {
    it('starts tucked away, with a menu button in the top bar to open it', async () => {
        await renderLayout();
        const button = screen.getByRole('button', { name: 'Open menu' });
        expect(button).toHaveAttribute('aria-expanded', 'false');
        expect(button).toHaveAttribute('aria-controls', 'studio-sidebar');
        expect(isOpen()).toBe(false);
        expect(backdrop()).toBeNull();
    });

    it('keeps the menu button at the far left of the top bar, before "Back to Studio"', async () => {
        await renderLayout();
        const bar = screen.getByRole('banner');
        const buttons = Array.from(bar.querySelectorAll('button')).map(b => b.getAttribute('aria-label') ?? b.textContent?.trim());
        expect(buttons.indexOf('Open menu')).toBe(0);
        expect(buttons.some(label => label?.includes('Back to Studio'))).toBe(true);
    });

    it('slides open over the page, with a backdrop behind it', async () => {
        await renderLayout();
        fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
        expect(isOpen()).toBe(true);
        expect(backdrop()).not.toBeNull();
        expect(screen.getByRole('button', { name: 'Open menu' })).toHaveAttribute('aria-expanded', 'true');
        expect(sidebar().classList.contains('invisible')).toBe(false);
    });

    it('is out of the tab order while tucked away', async () => {
        await renderLayout();
        expect(sidebar().classList.contains('invisible')).toBe(true);
    });

    it('closes with its own close button', async () => {
        await renderLayout();
        fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
        fireEvent.click(screen.getByRole('button', { name: 'Close menu' }));
        expect(isOpen()).toBe(false);
        expect(backdrop()).toBeNull();
    });

    it('closes with Escape', async () => {
        await renderLayout();
        fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(isOpen()).toBe(false);
    });

    it('closes when the page behind it is tapped', async () => {
        await renderLayout();
        fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
        fireEvent.click(backdrop()!);
        expect(isOpen()).toBe(false);
    });

    it('closes when a page is chosen from it', async () => {
        await renderLayout();
        fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
        fireEvent.click(screen.getByRole('link', { name: 'Containers' }));
        expect(isOpen()).toBe(false);
    });

    it('closes when Settings is chosen, so the settings are not hidden behind it', async () => {
        await renderLayout();
        fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
        fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
        expect(isOpen()).toBe(false);
        expect(screen.getByRole('heading', { name: 'Global Settings' })).toBeInTheDocument();
    });

    it('does not react to Escape when it is not open', async () => {
        await renderLayout();
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(isOpen()).toBe(false);
    });

    it('is offered on the Studio home too', async () => {
        await renderLayout('formulations');
        expect(screen.getByRole('button', { name: 'Open menu' })).toBeInTheDocument();
    });
});

describe('the Studio menu on large screens', () => {
    // The screen size itself is decided by CSS, which these tests do not run, so they check the classes that do it
    it('hides the menu and close buttons, and shows the sidebar in place whatever the drawer says', async () => {
        await renderLayout();
        expect(screen.getByRole('button', { name: 'Open menu' }).classList.contains('lg:hidden')).toBe(true);
        expect(screen.getByRole('button', { name: 'Close menu' }).classList.contains('lg:hidden')).toBe(true);
        for (const cls of ['lg:sticky', 'lg:translate-x-0', 'lg:visible', 'lg:top-0']) {
            expect(sidebar().classList.contains(cls), cls).toBe(true);
        }
    });

    it('only dims the page behind the drawer on small screens', async () => {
        await renderLayout();
        fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
        expect(backdrop()!.classList.contains('lg:hidden')).toBe(true);
    });
});
