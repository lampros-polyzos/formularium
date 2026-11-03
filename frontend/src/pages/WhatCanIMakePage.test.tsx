import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WhatCanIMakePage from './WhatCanIMakePage';
import type { Recipe } from '../lib/pantry';
import type { CatalogIngredient } from '../lib/substitutions';

const mocks = vi.hoisted(() => ({
    user: { id: 'u1', email: 'sam@example.com' },
    state: { value: { status: 'loading' } as unknown },
    reload: vi.fn(),
}));

vi.mock('../hooks/usePantry', () => ({ usePantry: () => ({ state: mocks.state.value, reload: mocks.reload }) }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: mocks.user, session: null, username: null, isLoading: false }) }));
vi.mock('../components/StudioLayout', () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));

const ing = (id: string, inci: string, fn: string, extra: Partial<CatalogIngredient> = {}): CatalogIngredient =>
    ({ id, inci_name: inci, trade_name: id, function: fn, min_usage_pct: null, max_usage_pct: null, ...extra }) as CatalogIngredient;

const OIL = ing('oil', 'Prunus Armeniaca Kernel Oil', 'Emollient');
const BUTTER = ing('butter', 'Butyrospermum Parkii Butter', 'Emollient');
const GEL = ing('gel', 'Xanthan Gum', 'Thickener');

const recipe = (id: string, name: string, source: 'own' | 'community', ingredients: CatalogIngredient[]): Recipe => ({
    id, name, source, author: source === 'community' ? 'Ana' : null,
    lines: ingredients.map(ingredient => ({ ingredient, phase: 'A' as const, percentage: 100 / ingredients.length })),
});

function ready(recipes: Recipe[], stash: CatalogIngredient[], lots = stash.map((i, n) => ({ id: `l${n}`, ingredient_id: i.id, amount_left_g: 500, expiration_date: null }))) {
    mocks.state.value = { status: 'ready', data: { lots, stashIngredients: stash, recipes, limited: false } };
}

const renderPage = () => render(<MemoryRouter><WhatCanIMakePage /></MemoryRouter>);
const titles = () => screen.getAllByRole('listitem').filter(li => li.querySelector('a')).map(li => within(li).getAllByRole('link')[0].textContent);

beforeEach(() => { mocks.reload.mockReset(); });
afterEach(cleanup);

describe('What can I make?', () => {
    it('says it is checking while loading', () => {
        mocks.state.value = { status: 'loading' };
        renderPage();
        expect(screen.getByText(/Checking your stash/)).toBeInTheDocument();
    });

    it('shows the problem and lets you try again', () => {
        mocks.state.value = { status: 'error', message: 'Could not load your stash: boom' };
        renderPage();
        expect(screen.getByRole('alert')).toHaveTextContent('boom');
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
        expect(mocks.reload).toHaveBeenCalledTimes(1);
    });

    it('sends you to the stash when it is empty', () => {
        ready([recipe('r1', 'Balm', 'own', [OIL])], []);
        renderPage();
        expect(screen.getByText('Your stash is empty')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Go to My Stash' })).toHaveAttribute('href', '/stash');
    });

    it('ranks recipes by how much you already have, and links each to its page', () => {
        ready([
            recipe('far', 'Needs everything', 'own', [GEL, ing('x', 'Something Else', 'Fragrance')]),
            recipe('full', 'All in stock', 'community', [OIL]),
        ], [OIL], undefined);
        renderPage();
        fireEvent.click(screen.getByRole('button', { name: 'Everything' }));
        expect(titles()).toEqual(['All in stock', 'Needs everything']);
        expect(screen.getByRole('link', { name: 'All in stock' })).toHaveAttribute('href', '/community/full');
        expect(screen.getByRole('link', { name: 'Needs everything' })).toHaveAttribute('href', '/studio/far');
    });

    it('hides far-off recipes at first and offers to show them', () => {
        ready([recipe('far', 'Needs everything', 'own', [GEL])], [OIL]);
        renderPage();
        expect(screen.queryByText('Needs everything')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Show all 1 recipes/ }));
        expect(screen.getByText('Needs everything')).toBeInTheDocument();
    });

    it('filters by where the recipe came from', () => {
        ready([recipe('a', 'Mine one', 'own', [OIL]), recipe('b', 'Shared one', 'community', [OIL])], [OIL]);
        renderPage();
        fireEvent.click(screen.getByRole('button', { name: 'Community' }));
        expect(titles()).toEqual(['Shared one']);
        fireEvent.click(screen.getByRole('button', { name: 'Mine' }));
        expect(titles()).toEqual(['Mine one']);
    });

    it('suggests a stand-in from the stash for a missing ingredient', () => {
        ready([recipe('r', 'Body balm', 'community', [OIL, GEL])], [BUTTER, GEL]);
        renderPage();
        fireEvent.click(screen.getByRole('button', { name: 'Everything' }));
        fireEvent.click(screen.getByRole('button', { name: 'Show ingredients' }));
        expect(screen.getByText(/^Use/)).toHaveTextContent('Use butter');
    });

    it('recalculates amounts for a different batch size', () => {
        const small = ing('oil', OIL.inci_name, 'Emollient');
        ready([recipe('r', 'Balm', 'own', [small])], [small], [{ id: 'l', ingredient_id: 'oil', amount_left_g: 150, expiration_date: null }]);
        renderPage();
        expect(screen.getByText('Ready to make')).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText(/Batch size/), { target: { value: '500' } });
        expect(screen.queryByText('Ready to make')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Everything' }));
        expect(screen.getByText(/You have 0 of 1/)).toBeInTheDocument();
        expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '30');
    });

    it('warns when a water-based recipe has no preservative to use', () => {
        const aqua = ing('aqua', 'Aqua', 'Solvent');
        const pres = ing('pres', 'Phenoxyethanol', 'Preservative');
        ready([recipe('r', 'Toner', 'own', [aqua, pres, OIL])], [aqua, OIL]);
        renderPage();
        fireEvent.click(screen.getByRole('button', { name: 'Everything' }));
        expect(screen.getByText(/Do not skip it/)).toBeInTheDocument();
    });

    it('notes when only the newest community recipes were checked', () => {
        ready([recipe('r', 'Balm', 'own', [OIL])], [OIL]);
        (mocks.state.value as { data: { limited: boolean } }).data.limited = true;
        renderPage();
        expect(screen.getByText(/200 newest community recipes/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Mine' }));
        expect(screen.queryByText(/200 newest community recipes/)).not.toBeInTheDocument();
    });
});
