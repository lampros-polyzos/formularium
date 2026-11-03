import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ShoppingListPage from './ShoppingListPage';
import type { StashLot } from '../lib/batchPlan';
import type { Recipe } from '../lib/pantry';
import type { CatalogIngredient } from '../lib/substitutions';

const mocks = vi.hoisted(() => ({
    state: { value: { status: 'loading' } as unknown },
    reload: vi.fn(),
    settings: { warningDays: 30, lowStockGrams: 20 },
}));

vi.mock('../hooks/useShoppingData', () => ({ useShoppingData: () => ({ state: mocks.state.value, reload: mocks.reload }) }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('../contexts/SettingsContext', () => ({
    useSettings: () => ({ ...mocks.settings, formatDate: (d: string | null) => (d ? `on ${d.slice(0, 10)}` : '—') }),
}));
vi.mock('../components/StudioLayout', () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));

const ing = (id: string, inci_name: string, trade_name = id): CatalogIngredient =>
    ({ id, inci_name, trade_name, function: null, min_usage_pct: null, max_usage_pct: null });
const WATER = ing('water', 'Aqua');
const SHEA = ing('shea', 'Butyrospermum Parkii Butter', 'Shea Butter');
const GLY = ing('gly', 'Glycerin', 'Glycerin');

const recipe = (id: string, name: string, lines: [CatalogIngredient, number][], targetWeightG: number | null = 100): Recipe =>
    ({ id, name, source: 'own', targetWeightG, lines: lines.map(([ingredient, percentage]) => ({ ingredient, phase: 'A' as const, percentage })) });
const lot = (id: string, ingredient_id: string, amount: number | null, expiration_date: string | null = null): StashLot =>
    ({ id, ingredient_id, amount_left_g: amount, expiration_date });

const LOTION = recipe('lotion', 'Body Lotion', [[WATER, 80], [SHEA, 10], [GLY, 5]]);
const BALM = recipe('balm', 'Lip Balm', [[SHEA, 40]], 50);

function ready(formulas: Recipe[], lots: StashLot[] = []) {
    mocks.state.value = { status: 'ready', data: { formulas, lots, stashIngredients: [WATER, SHEA, GLY] } };
}
const renderPage = () => render(<MemoryRouter><ShoppingListPage /></MemoryRouter>);
const choose = (name: string) => fireEvent.click(screen.getByRole('checkbox', { name }));
const table = () => within(screen.getByRole('region', { name: 'Shopping list' }));
const rowFor = (name: string) => table().getByRole('cell', { name: new RegExp(`^${name}`) }).closest('tr') as HTMLElement;

beforeEach(() => {
    mocks.reload.mockReset();
    mocks.settings = { warningDays: 30, lowStockGrams: 20 };
    window.print = vi.fn();
});
afterEach(cleanup);

describe('the combined shopping list', () => {
    it('shows loading, then problems with a way to try again', () => {
        mocks.state.value = { status: 'loading' };
        const { unmount } = renderPage();
        expect(screen.getByText(/Loading your formulas/)).toBeInTheDocument();
        unmount();
        mocks.state.value = { status: 'error', message: 'Could not load your stash: boom' };
        renderPage();
        expect(screen.getByRole('alert')).toHaveTextContent('boom');
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
        expect(mocks.reload).toHaveBeenCalled();
    });

    it('points to starting a formula when there are none', () => {
        ready([]);
        renderPage();
        expect(screen.getByRole('link', { name: 'Start a formula' })).toHaveAttribute('href', '/studio/start');
    });

    it('starts with nothing chosen and nothing to print', () => {
        ready([LOTION, BALM]);
        renderPage();
        expect(screen.getByText('Nothing chosen yet.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Print this list/ })).toBeDisabled();
    });

    it('adds up the chosen formulas, and says what each one needs the ingredient for', () => {
        ready([LOTION, BALM]);
        renderPage();
        choose('Body Lotion');
        choose('Lip Balm');
        const shea = rowFor('Shea Butter');
        expect(shea).toHaveTextContent('30 g'); // 10 g for the lotion, 20 g for the balm at 50 g
        expect(within(shea).getAllByRole('listitem').map(li => li.textContent)).toEqual(['Body Lotion 10 g · missing', 'Lip Balm 20 g · missing']);
        expect(screen.getByRole('heading', { name: 'To buy: 2 ingredients, 35 g' })).toBeInTheDocument();
        expect(table().queryByText('Aqua')).not.toBeInTheDocument(); // water is not bought
    });

    it('starts each batch at the size the formula was written for, and recalculates when it is changed', () => {
        ready([LOTION, BALM]);
        renderPage();
        choose('Lip Balm');
        expect(screen.getByLabelText('Batch size for Lip Balm in grams')).toHaveValue(50);
        fireEvent.change(screen.getByLabelText('Batch size for Lip Balm in grams'), { target: { value: '200' } });
        expect(rowFor('Shea Butter')).toHaveTextContent('80 g');
    });

    it('uses 100 g when a formula has no batch size, and ignores a batch size that is not a number', () => {
        ready([recipe('x', 'Plain', [[SHEA, 10]], null)]);
        renderPage();
        choose('Plain');
        expect(rowFor('Shea Butter')).toHaveTextContent('10 g');
        fireEvent.change(screen.getByLabelText('Batch size for Plain in grams'), { target: { value: '' } });
        expect(rowFor('Shea Butter')).toHaveTextContent('10 g');
    });

    it('subtracts the stash, and shows which recipe the stock covers and which is short', () => {
        ready([LOTION, BALM], [lot('1', 'shea', 15), lot('2', 'gly', 100)]);
        renderPage();
        choose('Body Lotion');
        choose('Lip Balm');
        const shea = rowFor('Shea Butter');
        expect(within(shea).getAllByRole('listitem').map(li => li.textContent)).toEqual(['Body Lotion 10 g · in stock', 'Lip Balm 20 g · have 5 g of 20 g']);
        expect(within(shea).getAllByText('15 g', { selector: 'td' })).toHaveLength(2); // have 15 g, buy 15 g
        expect(shea).toHaveAttribute('data-buy', 'true');
        expect(rowFor('Glycerin')).toHaveAttribute('data-buy', 'false');
        expect(screen.getByRole('heading', { name: 'To buy: 1 ingredients, 15 g' })).toBeInTheDocument();
    });

    it('gives the stock to the formula chosen first', () => {
        ready([LOTION, BALM], [lot('1', 'shea', 20)]);
        renderPage();
        choose('Lip Balm');
        choose('Body Lotion');
        expect(within(rowFor('Shea Butter')).getAllByRole('listitem').map(li => li.textContent)).toEqual(['Lip Balm 20 g · in stock', 'Body Lotion 10 g · missing']);
    });

    it('can show only what needs buying', () => {
        ready([LOTION], [lot('1', 'gly', 100)]);
        renderPage();
        choose('Body Lotion');
        expect(table().getByText('Glycerin')).toBeInTheDocument();
        fireEvent.click(screen.getByLabelText('Only what I need to buy'));
        expect(table().queryByText('Glycerin')).not.toBeInTheDocument();
        expect(table().getByText('Shea Butter')).toBeInTheDocument();
    });

    it('says when you have everything', () => {
        ready([LOTION], [lot('1', 'shea', 100), lot('2', 'gly', 100)]);
        renderPage();
        choose('Body Lotion');
        expect(screen.getByRole('heading', { name: 'You have everything' })).toBeInTheDocument();
    });

    it('lets you tick off what you have bought', () => {
        ready([LOTION]);
        renderPage();
        choose('Body Lotion');
        fireEvent.click(screen.getByRole('checkbox', { name: 'Got Shea Butter' }));
        expect(rowFor('Shea Butter')).toHaveClass('opacity-50');
        expect(rowFor('Glycerin')).not.toHaveClass('opacity-50');
    });

    it('prints on request', () => {
        ready([LOTION]);
        renderPage();
        choose('Body Lotion');
        fireEvent.click(screen.getByRole('button', { name: /Print this list/ }));
        expect(window.print).toHaveBeenCalledTimes(1);
    });

    it('has a heading for the printout that names the formulas and batch sizes, but is only for paper', () => {
        ready([LOTION]);
        renderPage();
        choose('Body Lotion');
        const heading = screen.getByRole('heading', { name: 'Shopping list', level: 1 });
        expect(heading.parentElement).toHaveClass('hidden', 'print:block');
        expect(heading.parentElement).toHaveTextContent('Body Lotion (100 g)');
        expect(screen.getByRole('region', { name: 'Choose formulas' })).toHaveClass('print:hidden');
    });
});

describe('stash alerts on the shopping list', () => {
    const alerts = () => within(screen.getByRole('region', { name: 'Stash alerts' }));
    const today = new Date();
    const inDays = (n: number) => { const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

    it('shows expired, expiring and low stock even before anything is chosen', () => {
        ready([LOTION], [lot('1', 'shea', 100, inDays(-3)), lot('2', 'gly', 100, inDays(10)), lot('3', 'water', 5)]);
        renderPage();
        const items = alerts().getAllByRole('listitem');
        expect(items).toHaveLength(3);
        expect(items[0]).toHaveTextContent('Shea Butter');
        expect(items[0]).toHaveTextContent('Expired');
        expect(items[0]).toHaveTextContent('It is not counted as stock');
        expect(items[1]).toHaveTextContent('Glycerin');
        expect(items[1]).toHaveTextContent('Expiring soon');
        expect(items[1]).toHaveTextContent('in 10 days');
        expect(items[2]).toHaveTextContent('Low stock');
        expect(items[2]).toHaveTextContent('Only 5 g in stock');
    });

    it('says when an alert is about something a chosen formula needs', () => {
        ready([LOTION], [lot('1', 'shea', 100, inDays(5))]);
        renderPage();
        expect(alerts().getByRole('listitem')).not.toHaveTextContent('You need it for the list below');
        choose('Body Lotion');
        expect(alerts().getByRole('listitem')).toHaveTextContent('You need it for the list below');
    });

    it('warns when the chosen formulas would leave an ingredient nearly gone', () => {
        ready([LOTION], [lot('1', 'shea', 25)]);
        renderPage();
        expect(screen.queryByRole('region', { name: 'Stash alerts' })).not.toBeInTheDocument();
        choose('Body Lotion');
        expect(alerts().getByRole('listitem')).toHaveTextContent('Will run low');
        expect(alerts().getByRole('listitem')).toHaveTextContent('Only 15 g would be left');
    });

    it('follows the warning window and the low-stock level from the settings', () => {
        mocks.settings = { warningDays: 3, lowStockGrams: 2 };
        ready([], [lot('1', 'shea', 100, inDays(10)), lot('2', 'gly', 5)]);
        renderPage();
        expect(screen.queryByRole('region', { name: 'Stash alerts' })).not.toBeInTheDocument();
    });

    it('has no alerts section when the stash is fine, and nothing to print with nothing chosen', () => {
        ready([LOTION], [lot('1', 'shea', 100, inDays(200))]);
        renderPage();
        expect(screen.queryByRole('region', { name: 'Stash alerts' })).not.toBeInTheDocument();
    });

    it('lets you print the alerts even when no formula is chosen', () => {
        ready([LOTION], [lot('1', 'shea', 100, inDays(-1))]);
        renderPage();
        expect(screen.getByRole('button', { name: /Print this list/ })).toBeEnabled();
    });
});
