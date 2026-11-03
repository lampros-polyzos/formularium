import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MetricsPage from './MetricsPage';
import type { MetricBatch, MetricLine, MetricsInput } from '../lib/metrics';

const mocks = vi.hoisted(() => ({ state: { value: { status: 'loading' } as unknown }, reload: vi.fn() }));

vi.mock('../hooks/useMetricsData', () => ({ useMetricsData: () => ({ state: mocks.state.value, reload: mocks.reload }) }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('../contexts/SettingsContext', () => ({
    useSettings: () => ({ currency: '$', warningDays: 30, lowStockGrams: 20, formatDate: (d: string | null) => (d ? `on ${d.slice(0, 10)}` : '—') }),
}));
vi.mock('../components/StudioLayout', () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));

const now = new Date();
const daysAgo = (n: number) => { const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

const batch = (id: string, made_on: string, over: Partial<MetricBatch> = {}): MetricBatch =>
    ({ id, formulation_id: 'f1', name: 'Body Lotion', batch_size_g: 100, made_on, status: 'active', checks: [], ...over });
const line = (batch_id: string, ingredient_id: string, name: string, actual_g: number, cost: number | null = null): MetricLine => ({ batch_id, ingredient_id, name, actual_g, cost });

const input = (over: Partial<MetricsInput> = {}): MetricsInput =>
    ({ batches: [], lines: [], formulas: [], favorites: [], lots: [], stashNames: new Map(), sharedCount: 0, ...over });
const ready = (over: Partial<MetricsInput> = {}) => { mocks.state.value = { status: 'ready', input: input(over) }; };
const renderPage = () => render(<MemoryRouter><MetricsPage /></MemoryRouter>);
const region = (name: string) => within(screen.getByRole('region', { name }));

const BATCHES = [
    batch('a', daysAgo(2), { batch_size_g: 100, ingredient_cost: 4, container_name: '50 ml jar', container_volume_ml: 50, container_count: 2, container_unit_price: 0.5 }),
    batch('b', daysAgo(9), { batch_size_g: 200, ingredient_cost: 6, container_name: '50 ml jar', container_volume_ml: 50, container_count: 4, container_unit_price: 0.5, formulation_id: 'f2', name: 'Face Cream' }),
    batch('c', daysAgo(400), { batch_size_g: 300, ingredient_cost: 10 }),
];
const LINES = [
    line('a', 'shea', 'Shea Butter', 10, 2), line('b', 'shea', 'Shea Butter', 20, 4), line('c', 'shea', 'Shea Butter', 30, 6),
    line('a', 'gly', 'Glycerin', 5, 0.2), line('b', 'gly', 'Glycerin', 5, 0.2),
    line('b', 'rose', 'Rose Oil', 1, 8),
];

beforeEach(() => mocks.reload.mockReset());
afterEach(cleanup);

describe('the Metrics page', () => {
    it('shows loading, then problems with a way to try again', () => {
        mocks.state.value = { status: 'loading' };
        const { unmount } = renderPage();
        expect(screen.getByText(/Adding up your batches/)).toBeInTheDocument();
        unmount();
        mocks.state.value = { status: 'error', message: 'Could not load your batches: boom' };
        renderPage();
        expect(screen.getByRole('alert')).toHaveTextContent('boom');
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
        expect(mocks.reload).toHaveBeenCalled();
    });

    it('invites you to make a first batch, and still shows the stash and formulas', () => {
        ready({ lots: [{ id: 'l1', ingredient_id: 'x', amount_left_g: 10, expiration_date: null, price_per_g: 1 }], stashNames: new Map([['x', 'Old Thing']]) });
        renderPage();
        expect(screen.getByText('No batches yet')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Open the Studio' })).toHaveAttribute('href', '/studio');
        expect(screen.queryByRole('region', { name: 'Overview' })).not.toBeInTheDocument();
        expect(screen.getByRole('region', { name: 'Your stash' })).toBeInTheDocument();
        expect(screen.getByRole('region', { name: 'Sitting idle' })).toHaveTextContent('Old Thing');
    });

    it('shows the totals for everything you have made', () => {
        ready({ batches: BATCHES, lines: LINES });
        renderPage();
        const overview = region('Overview');
        expect(overview.getByText('Batches made').nextElementSibling).toHaveTextContent('3');
        expect(overview.getByText('Total made').nextElementSibling).toHaveTextContent('600 g');
        expect(overview.getByText('Spent on ingredients').nextElementSibling).toHaveTextContent('$20.00');
        expect(overview.getByText('Average per batch').nextElementSibling).toHaveTextContent('$6.67');
        expect(overview.getByText('Containers filled').nextElementSibling).toHaveTextContent('6');
        expect(overview.getByText('Different ingredients').nextElementSibling).toHaveTextContent('3');
        expect(screen.getByText(/Dearest batch:/)).toHaveTextContent('Body Lotion at $10.00');
    });

    it('limits everything to the chosen time range', () => {
        ready({ batches: BATCHES, lines: LINES });
        renderPage();
        fireEvent.click(screen.getByRole('button', { name: 'Last 30 days' }));
        const overview = region('Overview');
        expect(overview.getByText('Batches made').nextElementSibling).toHaveTextContent('2');
        expect(overview.getByText('Total made').nextElementSibling).toHaveTextContent('300 g');
        expect(screen.getByRole('button', { name: 'Last 30 days' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('ranks ingredients by use, and can rank them by grams or money instead', () => {
        ready({ batches: BATCHES, lines: LINES });
        renderPage();
        const list = () => within(screen.getByRole('list', { name: 'Ingredients' })).getAllByRole('listitem').map(li => li.textContent);
        expect(list()[0]).toContain('Shea Butter');
        expect(list()[0]).toContain('3 batches');
        expect(list()[1]).toContain('Glycerin');
        fireEvent.click(screen.getByRole('button', { name: 'Most spent' }));
        expect(list().map(t => t?.slice(0, 8))).toEqual(['Shea But', 'Rose Oil', 'Glycerin']);
        expect(list()[0]).toContain('$12.00');
        fireEvent.click(screen.getByRole('button', { name: 'Most grams' }));
        expect(list()[0]).toContain('60 g');
    });

    it('explains when there are no prices to rank by', () => {
        ready({ batches: [batch('a', daysAgo(1))], lines: [line('a', 'shea', 'Shea', 5)] });
        renderPage();
        fireEvent.click(screen.getByRole('button', { name: 'Most spent' }));
        expect(screen.getByText(/No prices recorded yet/)).toBeInTheDocument();
    });

    it('lists the formulas you make most, with the date of the last batch', () => {
        ready({ batches: BATCHES, lines: LINES });
        renderPage();
        const items = within(screen.getByRole('list', { name: 'Formulas' })).getAllByRole('listitem');
        expect(items[0]).toHaveTextContent('Body Lotion');
        expect(items[0]).toHaveTextContent('2 batches');
        expect(items[0]).toHaveTextContent(`last made on ${daysAgo(2)}`);
    });

    it('shows batches per month, can switch to grams or money, and has every figure in a table', () => {
        ready({ batches: BATCHES, lines: LINES });
        renderPage();
        const chart = screen.getByRole('img', { name: /Batches per month/ });
        expect(chart.getAttribute('aria-label')).toMatch(/: 2|: 1/);
        fireEvent.click(screen.getByRole('button', { name: 'Spent' }));
        expect(screen.getByRole('img', { name: /Spent on ingredients per month/ })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Grams' }));
        expect(screen.getByRole('img', { name: /Grams made per month/ }).getAttribute('aria-label')).toContain('g');
        expect(screen.getByText('Show as a table')).toBeInTheDocument();
        expect(screen.getAllByRole('row').length).toBeGreaterThan(12);
    });

    it('shows how your containers are used', () => {
        ready({ batches: BATCHES, lines: LINES });
        renderPage();
        const items = within(screen.getByRole('list', { name: 'Containers' })).getAllByRole('listitem');
        expect(items[0]).toHaveTextContent('50 ml jar');
        expect(items[0]).toHaveTextContent('2 batches');
        expect(items[0]).toHaveTextContent('6 filled · 50 ml each · $3.00');
        expect(items[1]).toHaveTextContent('No container recorded');
    });

    it('tells you check-ins have not started, or shows the results with words as well as colour', () => {
        ready({ batches: BATCHES, lines: LINES });
        const { unmount } = renderPage();
        expect(screen.getByText(/No check-ins done yet/)).toBeInTheDocument();
        unmount();
        const done = (result: 'good' | 'minor' | 'failed', observations: string[] = []) => ({ result, observations, checked_at: '2026-11-02T00:00:00Z' });
        ready({ batches: [batch('a', daysAgo(2), { checks: [done('good'), done('minor', ['separation']), done('failed', ['separation', 'mold'])] })], lines: [] });
        renderPage();
        const results = within(screen.getByRole('list', { name: 'Check-in results' })).getAllByRole('listitem').map(li => li.textContent?.replace(/\s+/g, ' ').trim());
        expect(results).toEqual(['Looks good 1', 'Minor change 1', 'Failed 1']);
        const problems = within(screen.getByRole('list', { name: 'Problems noticed' })).getAllByRole('listitem');
        expect(problems[0]).toHaveTextContent('Separation or oil on top2×');
    });

    it('shows yield, losses and what was thrown away', () => {
        ready({ batches: [batch('a', daysAgo(2), { batch_size_g: 100, final_weight_g: 90 }), batch('b', daysAgo(3), { batch_size_g: 200, status: 'discarded', ingredient_cost: 5 })], lines: [] });
        renderPage();
        const panel = region('Yield and waste');
        expect(panel.getByText('Average yield').nextElementSibling).toHaveTextContent('90%');
        expect(panel.getByText('Thrown away').nextElementSibling).toHaveTextContent('1 batch');
        expect(panel.getByText('Wasted on ingredients').nextElementSibling).toHaveTextContent('$5.00');
    });

    it('shows how your starred ingredients are used, and the ones never used', () => {
        ready({ batches: BATCHES, lines: LINES, favorites: [{ id: 'shea', name: 'Shea Butter' }, { id: 'ghost', name: 'Ghost Oil' }] });
        renderPage();
        const panel = region('Favourite ingredients');
        expect(panel.getByRole('list', { name: 'Favourites in use' })).toHaveTextContent('Shea Butter');
        expect(panel.getByText(/Never used:/).parentElement).toHaveTextContent('Ghost Oil');
        expect(panel.getByText(/Used a lot, not starred:/).parentElement).toHaveTextContent('Glycerin');
    });

    it('suggests starring when nothing is starred', () => {
        ready({ batches: BATCHES, lines: LINES });
        renderPage();
        expect(screen.getByText(/You have not starred any ingredients yet/)).toBeInTheDocument();
    });

    it('describes the stash and the formulas', () => {
        ready({
            batches: BATCHES, lines: LINES,
            lots: [
                { id: 'l1', ingredient_id: 'a', amount_left_g: 100, expiration_date: '2020-01-01', price_per_g: 0.5 },
                { id: 'l2', ingredient_id: 'b', amount_left_g: 5, expiration_date: null, price_per_g: null },
            ],
            stashNames: new Map([['a', 'Old Oil'], ['b', 'Dust']]),
            formulas: [{ id: 'f1', name: 'Body Lotion', created_at: null, ingredientCount: 6 }, { id: 'f9', name: 'Lonely Toner', created_at: null, ingredientCount: 4 }],
            sharedCount: 3,
        });
        renderPage();
        const stash = region('Your stash');
        expect(stash.getByText('Value').nextElementSibling).toHaveTextContent('$50.00');
        expect(stash.getByText('Expired').nextElementSibling).toHaveTextContent('1');
        expect(stash.getByText('Running low').nextElementSibling).toHaveTextContent('1');
        expect(region('Sitting idle').getByRole('list', { name: 'Idle stash' })).toHaveTextContent('Old Oil');
        const library = region('Your formulas');
        expect(library.getByText('Shared with the community').nextElementSibling).toHaveTextContent('3');
        expect(library.getByText(/Never made:/).parentElement).toHaveTextContent('Lonely Toner');
    });

    it('writes highlights in plain words', () => {
        ready({ batches: [batch('a', daysAgo(1)), batch('b', daysAgo(8))], lines: [] });
        renderPage();
        expect(region('Highlights').getByText('You have made something in 2 weeks in a row.')).toBeInTheDocument();
    });
});
