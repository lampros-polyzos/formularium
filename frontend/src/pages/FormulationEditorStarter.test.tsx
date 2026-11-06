import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FormulationEditor from './FormulationEditor';
import { LIBRARY, PROFILES } from '../lib/starterLibraryFixture';
import { saveDraft } from '../lib/draftStore';

const mocks = vi.hoisted(() => ({
    auth: { user: { id: 'u1', email: 'u@example.com' }, session: {}, username: 'tester', isLoading: false },
    library: [] as unknown[],
    stash: [] as { ingredient_id: string; amount_left_g: number | null }[],
    libraryError: false,
    libraryQueries: 0,
}));

vi.mock('../lib/saveFormulation', () => ({ saveFormulation: vi.fn().mockResolvedValue('f-new') }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('../contexts/SettingsContext', () => ({
    useSettings: () => ({ currency: '$', dateFormat: 'en-US', warningDays: 30, setCurrency: vi.fn(), setDateFormat: vi.fn(), setWarningDays: vi.fn(), formatDate: (d: string) => d }),
}));
vi.mock('../components/FormulationCostCalculator', () => ({ default: () => <div /> }));

// The ingredient library and the stash come from the backend
vi.mock('../lib/libraryApi', () => ({
    searchIngredients: (search: { anyOf?: { value: string }[] }) => {
        // The editor looks ingredients up for substitutes too; only count the template's own request
        if (search.anyOf?.some(f => /olivem/i.test(f.value))) mocks.libraryQueries += 1;
        return mocks.libraryError ? Promise.reject(new Error('down')) : Promise.resolve(mocks.library);
    },
    fetchStash: () => Promise.resolve(mocks.stash),
    fetchContainers: () => Promise.resolve([]),
    fetchIngredientByInci: () => Promise.resolve(null),
    fetchFavorites: () => Promise.resolve([]),
    addFavorite: () => Promise.resolve(),
    removeFavorite: () => Promise.resolve(),
}));

// The formula and its product type come from the backend
vi.mock('../lib/formulasApi', async () => {
    const { PROFILES: profiles } = await import('../lib/starterLibraryFixture');
    return {
        fetchProfile: (id: string) => (profiles[id] ? Promise.resolve(profiles[id]) : Promise.reject(new Error('That product type does not exist.'))),
        fetchFormula: () => Promise.reject(new Error('That formula does not exist.')),
        createFormula: vi.fn(),
    };
});


const settle = async (ms = 0) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };

function Where() {
    const location = useLocation();
    return <output data-testid="where">{location.pathname}{location.search}</output>;
}

async function openAt(path: string) {
    render(
        <MemoryRouter initialEntries={[path]}>
            <Where />
            <Routes>
                <Route path="/studio/new" element={<FormulationEditor />} />
                <Route path="/studio/:id" element={<FormulationEditor />} />
            </Routes>
        </MemoryRouter>
    );
    await settle(50);
    await settle(50);
    await settle(600);
}

const phaseBlock = (letter: string) => screen.getByText(new RegExp(`PHASE ${letter}`)).parentElement!.parentElement!;
const stashOf = (...trades: string[]) => trades.map(t => ({ ingredient_id: LIBRARY.find(r => r.trade_name === t)!.id, amount_left_g: 500 }));

beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    localStorage.setItem('formularium.editorTourSeen', '1');
    mocks.library = LIBRARY;
    mocks.stash = [];
    mocks.libraryError = false;
    mocks.libraryQueries = 0;
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ alerts: [], recommendations: [] }) });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('starting a formula from a template', () => {
    it('fills in the product type, name, batch size and pH, and balances the ingredients to 100%', async () => {
        await openAt('/studio/new?template=light-lotion');

        expect(screen.getByLabelText('Profile:')).toHaveValue(PROFILES.ow_lotion.id);
        expect(screen.getByRole('button', { name: 'Edit project name' })).toHaveTextContent('My light lotion');
        expect(screen.getByDisplayValue('100')).toBeInTheDocument(); // target weight
        expect(screen.getByDisplayValue('5.5')).toBeInTheDocument(); // the middle of the product type's pH range
        expect(screen.getByText(/Total: 100\.00%/)).toBeInTheDocument();
    });

    it('puts each ingredient in a sensible phase', async () => {
        await openAt('/studio/new?template=light-lotion');
        expect(within(phaseBlock('A')).getByText('Distilled Water')).toBeInTheDocument();
        expect(within(phaseBlock('B')).getByText('Olivem 1000')).toBeInTheDocument();
        expect(within(phaseBlock('B')).getByText('Jojoba Oil (Cold Pressed)')).toBeInTheDocument();
        expect(within(phaseBlock('C')).getByText('Euxyl PE 9010')).toBeInTheDocument();
        expect(within(phaseBlock('C')).getByText('Vitamin E (Mixed Tocopherols 95%)')).toBeInTheDocument();
    });

    it('marks the water as the Q.S. ingredient that fills the rest', async () => {
        await openAt('/studio/new?template=toner');
        expect(screen.getByText('Q.S. Base')).toBeInTheDocument();
        expect(within(phaseBlock('A')).getByText('Distilled Water')).toBeInTheDocument();
    });

    it('explains what was created and what to do next', async () => {
        await openAt('/studio/new?template=shampoo');
        const notice = screen.getByRole('region', { name: 'Starter template' });
        expect(notice).toHaveTextContent('Started from the Gentle shampoo template');
        expect(within(notice).getByText(/Adjust the pH to about 5.5/)).toBeInTheDocument();
        expect(within(notice).queryByRole('status')).not.toBeInTheDocument(); // nothing missing
        expect(screen.getByText('Iselux (SLMI)')).toBeInTheDocument();
    });

    it('works for a waterless product too', async () => {
        await openAt('/studio/new?template=body-butter');
        expect(screen.getByLabelText('Profile:')).toHaveValue('body_butter');
        expect(screen.getByText('Shea Butter (Refined)')).toBeInTheDocument();
        expect(screen.queryByText('Q.S. Base')).not.toBeInTheDocument();
        expect(screen.getByText(/Total: 100\.00%/)).toBeInTheDocument();
    });

    it('uses what the user already owns when there is a choice', async () => {
        mocks.stash = stashOf('Vegetable Glycerin 99.5%');
        await openAt('/studio/new?template=toner');
        expect(screen.getByText('Vegetable Glycerin 99.5%')).toBeInTheDocument();
        expect(screen.queryByText('1,3-Propanediol (Zemea)')).not.toBeInTheDocument();
    });

    it('reports what the library could not supply, and still builds the rest', async () => {
        mocks.library = LIBRARY.filter(r => !['Euxyl PE 9010', 'Olivem 1000', 'Montanov 68'].includes(r.trade_name));
        await openAt('/studio/new?template=light-lotion');
        const notice = screen.getByRole('region', { name: 'Starter template' });
        expect(within(notice).getByRole('status')).toHaveTextContent('Emulsifier, Preservative');
        expect(screen.getByText('Jojoba Oil (Cold Pressed)')).toBeInTheDocument();
    });

    it('takes the template out of the address so a refresh does not start over, and starts only once', async () => {
        await openAt('/studio/new?template=light-lotion');
        expect(screen.getByTestId('where')).toHaveTextContent(/^\/studio\/new$/);
        await settle(1000);
        expect(mocks.libraryQueries).toBe(1);
    });

    it('can be dismissed', async () => {
        await openAt('/studio/new?template=toner');
        await act(async () => { screen.getByRole('button', { name: 'Got it' }).click(); });
        expect(screen.queryByRole('region', { name: 'Starter template' })).not.toBeInTheDocument();
        expect(screen.getByText('Distilled Water')).toBeInTheDocument(); // the formula stays
    });

    it('replaces an old unsaved draft instead of offering to restore it', async () => {
        saveDraft(null, { name: 'Old idea', profileId: 'ow_lotion', targetWeight: 50, targetPh: 6, ingredients: [{ id: 'old', phase: 'A', percentage: 100, isQS: true }] });
        await openAt('/studio/new?template=toner');
        expect(screen.queryByText(/unsaved changes/)).not.toBeInTheDocument();
        const draft = JSON.parse(localStorage.getItem('formularium.draft.new') ?? '{}');
        expect(draft.name).not.toBe('Old idea'); // what is saved now is the new template, not the old draft
    });

    it('says so, and leaves an empty editor, if the ingredients cannot be loaded', async () => {
        mocks.libraryError = true;
        await openAt('/studio/new?template=light-lotion');
        expect(screen.getByText('Could not start from the template')).toBeInTheDocument();
        expect(screen.queryByRole('region', { name: 'Starter template' })).not.toBeInTheDocument();
        expect(screen.getByLabelText('Profile:')).toHaveValue('');
    });

    it('ignores an unknown template and opens an empty formula', async () => {
        await openAt('/studio/new?template=nope');
        expect(screen.queryByRole('region', { name: 'Starter template' })).not.toBeInTheDocument();
        expect(mocks.libraryQueries).toBe(0);
        expect(screen.getByLabelText('Profile:')).toHaveValue('');
    });

    it('a plain new formula is still empty', async () => {
        await openAt('/studio/new');
        expect(screen.queryByRole('region', { name: 'Starter template' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Edit project name' })).toHaveTextContent('New Project');
    });
});
