import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FormulationEditor from './FormulationEditor';
import { LIBRARY, PROFILES } from '../lib/starterLibraryFixture';
import { buildImportedFormula } from '../lib/importFormula';
import { findMatches } from '../lib/ingredientMatcher';
import { parseRecipeText } from '../lib/recipeParser';
import { saveImport, takeImport } from '../lib/importHandoff';

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


/** What the import page would hand over for some pasted text. */
function importText(text: string, skipped: string[] = []) {
    const lines = parseRecipeText(text).lines.map(parsed => ({ parsed, row: findMatches(parsed.name, parsed.alternates, LIBRARY)[0]?.row ?? null }));
    const formula = buildImportedFormula(lines);
    saveImport({ name: 'My pasted lotion', profileId: 'ow_lotion', profile: PROFILES.ow_lotion as never, targetWeight: 100, ingredients: formula.ingredients as unknown as Record<string, unknown>[], warnings: formula.warnings, skipped });
}

describe('opening an imported formula', () => {
    it('fills in the product type, name, pH and the table, balanced to what was pasted', async () => {
        importText('Phase A\nWater q.s.\nGlycerin 5%\nPhase B\nJojoba Oil 10%\nCetyl Alcohol 3%\nOlivem 1000 4%\nPhase C\nVitamin E 1%\nEuxyl PE 9010 1%');
        await openAt('/studio/new?import=1');

        expect(screen.getByLabelText('Profile:')).toHaveValue('ow_lotion');
        expect(screen.getByRole('button', { name: 'Edit project name' })).toHaveTextContent('My pasted lotion');
        expect(screen.getByDisplayValue('5.5')).toBeInTheDocument();
        expect(screen.getByText(/Total: 100\.00%/)).toBeInTheDocument();
        expect(within(phaseBlock('A')).getByText('Distilled Water')).toBeInTheDocument();
        expect(within(phaseBlock('B')).getByText('Olivem 1000')).toBeInTheDocument();
        expect(within(phaseBlock('C')).getByText(/Vitamin E/)).toBeInTheDocument();
    });

    it('explains what was imported and what was left out', async () => {
        importText('Water 95%\nGlycerin 5%', ['Mystery goo']);
        await openAt('/studio/new?import=1');
        const notice = screen.getByRole('region', { name: 'Imported formula' });
        expect(within(notice).getByText('Imported from pasted text')).toBeInTheDocument();
        expect(within(notice).getByText('Mystery goo')).toBeInTheDocument();
    });

    it('removes the marker from the address, and does not apply the formula twice', async () => {
        importText('Water 95%\nGlycerin 5%');
        await openAt('/studio/new?import=1');
        expect(screen.getByTestId('where')).toHaveTextContent('/studio/new');
        expect(screen.getByTestId('where')).not.toHaveTextContent('import');
        expect(takeImport()).toBeNull();
    });

    it('opens an empty formula, with no notice, if there is nothing to import', async () => {
        await openAt('/studio/new?import=1');
        expect(screen.queryByRole('region', { name: 'Imported formula' })).not.toBeInTheDocument();
        expect(screen.queryByText(/Total: 100\.00%/)).not.toBeInTheDocument();
    });
});
