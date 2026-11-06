import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FormulationEditor from './FormulationEditor';

const mocks = vi.hoisted(() => ({
    auth: { user: { id: 'u1', email: 'u@example.com' }, session: {}, username: 'tester', isLoading: false },
    phases: [] as unknown[],
    stash: [] as unknown[],
    createBatch: vi.fn(),
}));

vi.mock('../lib/batches', () => ({
    createBatch: mocks.createBatch,
    lotNumbersLike: vi.fn().mockResolvedValue([]),
    countDueChecks: vi.fn().mockResolvedValue(0),
}));
vi.mock('../lib/saveFormulation', () => ({ saveFormulation: vi.fn().mockResolvedValue('f1') }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('../contexts/SettingsContext', () => ({
    useSettings: () => ({ currency: '$', dateFormat: 'en-US', warningDays: 30, setCurrency: vi.fn(), setDateFormat: vi.fn(), setWarningDays: vi.fn(), formatDate: (d: string) => d }),
}));
vi.mock('../components/FormulationCompanion', () => ({ default: () => <div /> }));
vi.mock('../components/FormulationCostCalculator', () => ({ default: () => <div /> }));

// The ingredient library and the stash come from the backend
vi.mock('../lib/libraryApi', async () => {
    return {
        searchIngredients: () => Promise.resolve([]),
        fetchStash: () => Promise.resolve(mocks.stash),
        fetchContainers: () => Promise.resolve([]),
    fetchFavorites: () => Promise.resolve([]),
    addFavorite: () => Promise.resolve(),
    removeFavorite: () => Promise.resolve(),
    fetchIngredientByInci: () => Promise.resolve(null),
    };
});

// The formula and its product type come from the backend
vi.mock('../lib/formulasApi', () => {
    const formulation = { id: 'f1', name: 'Day Cream', profile_id: 'ow_lotion', target_weight_g: 200, target_ph: 5.5, community_post_id: null };
    const profile = { id: 'ow_lotion', name: 'O/W Lotion', requires_water: false, default_ph_min: 5, default_ph_max: 6, max_oil_phase_percent: 30 };
    return {
        fetchFormula: () => Promise.resolve({ ...formulation, formulation_phases: mocks.phases }),
        fetchProfile: () => Promise.resolve(profile),
        createFormula: vi.fn(),
    };
});


const WATER = { id: 'water', inci_name: 'Aqua', trade_name: 'Distilled Water', function: 'Solvent', solubility: 'water', min_usage_pct: 1, max_usage_pct: 100 };
const SHEA = { id: 'shea', inci_name: 'Butyrospermum Parkii Butter', trade_name: 'Shea Butter', function: 'Butter', solubility: 'oil', min_usage_pct: 1, max_usage_pct: 100 };

const settle = async (ms = 0) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };

async function openEditor() {
    render(
        <MemoryRouter initialEntries={['/studio/f1']}>
            <Routes>
                <Route path="/studio/:id" element={<FormulationEditor />} />
                <Route path="/batches/:id" element={<div>Batch page for {'batch-42'}</div>} />
            </Routes>
        </MemoryRouter>
    );
    await settle(50);
    await settle(50);
    await settle(600);
}

beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    localStorage.setItem('formularium.editorTourSeen', '1');
    mocks.createBatch.mockReset().mockResolvedValue('batch-42');
    mocks.phases = [
        { id: 'pA', phase_letter: 'A', formulation_ingredients: [{ percentage: 80, is_qs: true, ingredients: WATER }] },
        { id: 'pB', phase_letter: 'B', formulation_ingredients: [{ percentage: 20, is_qs: false, ingredients: SHEA }] },
    ];
    mocks.stash = [{ id: 'sw', ingredient_id: 'water', amount_left_g: 1000, expiration_date: null, batch_lot_number: 'W-1', supplier_name: null }];
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ alerts: [], recommendations: [] }) });
});
afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

describe('Make batch from the editor', () => {
    it('opens a preview using the formula and your stash, and writes nothing', async () => {
        await openEditor();
        fireEvent.click(screen.getByRole('button', { name: /Make batch/ }));
        await settle(0);

        const dialog = screen.getByRole('dialog', { name: /Make this batch/ });
        expect(within(dialog).getByLabelText('Batch size (g)')).toHaveValue(200); // the formula's batch size
        expect(within(dialog).getByLabelText('Amount of Distilled Water in grams')).toHaveValue(160);
        expect(within(dialog).getByLabelText('Amount of Shea Butter in grams')).toHaveValue(40);
        expect(within(dialog).getByText(/Will take 160 g from 1 stash lot/)).toBeInTheDocument();
        expect(mocks.createBatch).not.toHaveBeenCalled();
    });

    it('cancelling leaves the stash and the batch log alone', async () => {
        await openEditor();
        fireEvent.click(screen.getByRole('button', { name: /Make batch/ }));
        await settle(0);
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        await settle(0);

        expect(screen.queryByRole('dialog', { name: /Make this batch/ })).not.toBeInTheDocument();
        expect(mocks.createBatch).not.toHaveBeenCalled();
    });

    it('confirming records the batch for this formula and opens it', async () => {
        await openEditor();
        fireEvent.click(screen.getByRole('button', { name: /Make batch/ }));
        await settle(0);
        fireEvent.click(screen.getByRole('button', { name: /Start batch and use 160 g of stash/ }));
        await settle(0);

        expect(mocks.createBatch).toHaveBeenCalledTimes(1);
        expect(mocks.createBatch.mock.calls[0][0]).toMatchObject({ formulationId: 'f1', name: 'Day Cream', batchSizeG: 200, targetPh: 5.5 });
        expect(screen.getByText(/Batch page for batch-42/)).toBeInTheDocument();
    });

    it('is disabled until the formula has ingredients', async () => {
        mocks.phases = [];
        await openEditor();
        expect(screen.getByRole('button', { name: /Make batch/ })).toBeDisabled();
    });
});
