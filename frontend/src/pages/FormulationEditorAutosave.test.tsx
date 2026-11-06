import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FormulationEditor from './FormulationEditor';

const mocks = vi.hoisted(() => ({
    // one stable object, like the real AuthContext: a new one per render would retrigger every effect that depends on it
    auth: { user: { id: 'u1', email: 'u@example.com' }, session: {}, username: 'tester', isLoading: false },
    save: vi.fn(),
    // what the mocked database returns for a saved formula
    formulation: { id: 'f1', name: 'Saved Lotion', profile_id: 'ow_lotion', target_weight_g: 100, target_ph: 5.5, community_post_id: null } as Record<string, unknown>,
    phases: [] as unknown[] | null,
    catalog: [] as unknown[],
}));

vi.mock('../lib/saveFormulation', () => ({ saveFormulation: mocks.save }));
vi.mock('../contexts/AuthContext', () => ({
    useAuth: () => mocks.auth,
}));
vi.mock('../contexts/SettingsContext', () => ({
    useSettings: () => ({ currency: '$', dateFormat: 'en-US', warningDays: 30, setCurrency: vi.fn(), setDateFormat: vi.fn(), setWarningDays: vi.fn(), formatDate: (d: string) => d }),
}));
vi.mock('../components/FormulationCompanion', () => ({ default: () => <div /> }));
vi.mock('../components/FormulationCostCalculator', () => ({ default: () => <div /> }));

// The ingredient library and the stash come from the backend
vi.mock('../lib/libraryApi', async () => {
    return {
        searchIngredients: () => Promise.resolve(mocks.catalog),
        fetchStash: () => Promise.resolve([]),
    fetchFavorites: () => Promise.resolve([]),
    addFavorite: () => Promise.resolve(),
    removeFavorite: () => Promise.resolve(),
    fetchIngredientByInci: () => Promise.resolve(null),
    };
});

// The formula and its product type come from the backend
vi.mock('../lib/formulasApi', () => {
    const profile = { id: 'ow_lotion', name: 'O/W Lotion', requires_water: false, default_ph_min: 5, default_ph_max: 6, max_oil_phase_percent: 30 };
    return {
        fetchFormula: () => Promise.resolve({ ...mocks.formulation, formulation_phases: mocks.phases }),
        fetchProfile: () => Promise.resolve(profile),
        createFormula: vi.fn(),
    };
});

vi.mock('../lib/supabase', () => {
    const profile = { id: 'ow_lotion', name: 'O/W Lotion', requires_water: false, default_ph_min: 5, default_ph_max: 6, max_oil_phase_percent: 30 };
    const rows = (table: string) => {
        if (table === 'formulations') return mocks.formulation;
        if (table === 'formulation_phases') return mocks.phases;
        if (table === 'formulation_profiles') return profile;
        return [];
    };
    const builder = (table: string): Record<string, unknown> => {
        const b: Record<string, unknown> = {};
        for (const m of ['select', 'eq', 'or', 'order', 'limit', 'match', 'in']) b[m] = () => b;
        b.single = () => Promise.resolve({ data: rows(table), error: null });
        b.then = (resolve: (v: unknown) => void) => {
            const data = rows(table);
            resolve({ data: Array.isArray(data) || data === null ? data : [data], error: null });
        };
        return b;
    };
    return { supabase: { from: (t: string) => builder(t), channel: () => ({ on: () => ({ subscribe: () => ({}) }) }), removeChannel: vi.fn() } };
});

const WATER = { id: 'water', inci_name: 'Aqua', trade_name: 'Distilled Water', function: 'Solvent', solubility: 'water', min_usage_pct: 1, max_usage_pct: 100 };
const savedPhases = (isQS = false) => [{ id: 'p1', phase_letter: 'A', formulation_ingredients: [{ percentage: 100, is_qs: isQS, ingredients: WATER }] }];
const storedDraft = {
    savedAt: Date.now(), name: 'Saved Lotion', profileId: 'ow_lotion', targetWeight: 100, targetPh: 5.5,
    ingredients: [{ ...WATER, phase: 'A', percentage: 65, isQS: false }],
};

function renderEditor(path: string) {
    return render(
        <MemoryRouter initialEntries={[path]}>
            <Routes>
                <Route path="/studio/new" element={<FormulationEditor />} />
                <Route path="/studio/:id" element={<FormulationEditor />} />
            </Routes>
        </MemoryRouter>
    );
}

const settle = async (ms = 0) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };

beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    localStorage.setItem('formularium.editorTourSeen', '1'); // returning user: no guided tour on top of the page
    mocks.save.mockReset().mockResolvedValue('f-new');
    mocks.formulation = { id: 'f1', name: 'Saved Lotion', profile_id: 'ow_lotion', target_weight_g: 100, target_ph: 5.5, community_post_id: null };
    mocks.phases = [];
    mocks.catalog = [];
    window.history.replaceState(null, '', '/');
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ alerts: [], recommendations: [] }) });
});
afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

describe('FormulationEditor autosave', () => {
    it('does not create an empty formula just because a product type was picked', async () => {
        renderEditor('/studio/new');
        await settle(100);
        fireEvent.change(screen.getByLabelText(/Profile:/i), { target: { value: 'ow_lotion' } });
        await settle(5000);

        expect(mocks.save).not.toHaveBeenCalled();
        expect(screen.getByRole('status')).toHaveTextContent(/Unsaved changes|Not saved yet/);
    });

    it('creates a new formula by itself once it has a product type and an ingredient, then keeps updating that same formula', async () => {
        mocks.catalog = [WATER];
        mocks.save.mockResolvedValue('f-new');
        renderEditor('/studio/new');
        await settle(100);

        fireEvent.change(screen.getByLabelText(/Profile:/i), { target: { value: 'ow_lotion' } });
        fireEvent.change(screen.getByPlaceholderText(/Search by ingredient/i), { target: { value: 'water' } });
        await settle(400);
        fireEvent.click(screen.getByText('Distilled Water', { selector: 'li span' })); // search result
        await settle(3000);

        expect(mocks.save).toHaveBeenCalledTimes(1);
        expect(mocks.save.mock.calls[0][0]).toMatchObject({ formulaId: null, profileId: 'ow_lotion' });
        expect(mocks.save.mock.calls[0][0].ingredients).toHaveLength(1);
        expect(window.location.pathname).toBe('/studio/f-new'); // a reload now reopens this formula
        expect(screen.getByRole('status')).toHaveTextContent('All changes saved');

        fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '50' } });
        await settle(3000);
        expect(mocks.save).toHaveBeenCalledTimes(2);
        expect(mocks.save.mock.calls[1][0]).toMatchObject({ formulaId: 'f-new' });
    });

    it('opens a saved formula without writing anything back', async () => {
        mocks.phases = savedPhases();
        renderEditor('/studio/f1');
        await settle(8000);

        expect(screen.getByText('Distilled Water')).toBeInTheDocument();
        expect(mocks.save).not.toHaveBeenCalled();
        expect(screen.getByRole('status')).toHaveTextContent('All changes saved');
    });

    it('autosaves an edit to a saved formula after a pause, then marks it saved', async () => {
        mocks.phases = savedPhases();
        mocks.save.mockResolvedValue('f1');
        renderEditor('/studio/f1');
        await settle(500);

        fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '90' } });
        expect(screen.getByRole('status')).toHaveTextContent('Unsaved changes');
        await settle(2000);
        expect(mocks.save).not.toHaveBeenCalled(); // still inside the pause
        await settle(1000);

        expect(mocks.save).toHaveBeenCalledTimes(1);
        const saved = mocks.save.mock.calls[0][0];
        expect(saved).toMatchObject({ formulaId: 'f1', profileId: 'ow_lotion', name: 'Saved Lotion' });
        expect(saved.ingredients).toEqual([{ id: 'water', phase: 'A', percentage: 90, isQS: false }]);
        expect(screen.getByRole('status')).toHaveTextContent('All changes saved');
        expect(localStorage.getItem('formularium.draft.f1')).toBeNull();
    });

    it('keeps a local copy while saving keeps failing, and shows a retry', async () => {
        mocks.phases = savedPhases();
        mocks.save.mockRejectedValue({ message: 'network down' });
        renderEditor('/studio/f1');
        await settle(500);

        fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '80' } });
        await settle(3000);

        expect(screen.getByRole('status')).toHaveTextContent(/Couldn.t save/);
        expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
        const draft = JSON.parse(localStorage.getItem('formularium.draft.f1')!);
        expect(draft.ingredients[0].percentage).toBe(80);
    });

    it('offers to restore unsaved work from an earlier session, and restores it', async () => {
        mocks.phases = savedPhases();
        localStorage.setItem('formularium.draft.f1', JSON.stringify(storedDraft));
        renderEditor('/studio/f1');
        await settle(500);

        expect(screen.getByRole('alert')).toHaveTextContent(/unsaved changes from/i);
        expect(screen.getByPlaceholderText('0')).toHaveValue(100);

        fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
        await settle(100);
        expect(screen.getByPlaceholderText('0')).toHaveValue(65);
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('discarding a found draft removes it', async () => {
        mocks.phases = savedPhases();
        localStorage.setItem('formularium.draft.f1', JSON.stringify(storedDraft));
        renderEditor('/studio/f1');
        await settle(500);

        fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
        await settle(100);
        expect(localStorage.getItem('formularium.draft.f1')).toBeNull();
        expect(screen.getByPlaceholderText('0')).toHaveValue(100);
    });

    it('never autosaves a saved formula whose data failed to load', async () => {
        mocks.phases = null; // loading the phases returns nothing usable
        vi.spyOn(console, 'error').mockImplementation(() => {});
        renderEditor('/studio/f1');
        await settle(8000);

        expect(mocks.save).not.toHaveBeenCalled();
    });
});
