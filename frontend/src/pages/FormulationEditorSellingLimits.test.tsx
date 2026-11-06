import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FormulationEditor from './FormulationEditor';

const mocks = vi.hoisted(() => ({
    auth: { user: { id: 'u1', email: 'u@example.com' }, session: {}, username: 'tester', isLoading: false },
    region: 'none' as string,
    salicylic: 4,
}));

vi.mock('../lib/saveFormulation', () => ({ saveFormulation: vi.fn().mockResolvedValue('f1') }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('../contexts/SettingsContext', () => ({
    useSettings: () => ({
        currency: '$', dateFormat: 'en-US', warningDays: 30, sellingRegion: mocks.region,
        setCurrency: vi.fn(), setDateFormat: vi.fn(), setWarningDays: vi.fn(), setSellingRegion: vi.fn(), formatDate: (d: string) => d,
    }),
}));
vi.mock('../components/FormulationCostCalculator', () => ({ default: () => <div /> }));

// The formula and its product type come from the backend
vi.mock('../lib/formulasApi', () => {
    const profile = { id: 'ow_lotion', name: 'O/W Lotion', requires_water: false, default_ph_min: 5, default_ph_max: 6, max_oil_phase_percent: 30 };
    const water = { id: 'water', inci_name: 'Aqua', trade_name: 'Distilled Water', function: 'Solvent', solubility: 'water', min_usage_pct: 1, max_usage_pct: 100 };
    const salicylic = { id: 'sal', inci_name: 'Salicylic Acid', trade_name: 'Salicylic Acid', function: 'Active (Exfoliant)', solubility: 'oil', min_usage_pct: 0.5, max_usage_pct: 2 };
    return {
        fetchFormula: () => Promise.resolve({
            id: 'f1', name: 'Peel', profile_id: 'ow_lotion', target_weight_g: 100, target_ph: 3.5, community_post_id: null,
            formulation_phases: [{ id: 'pA', phase_letter: 'A', formulation_ingredients: [
                { percentage: 100 - mocks.salicylic, is_qs: true, ingredients: water },
                { percentage: mocks.salicylic, is_qs: false, ingredients: salicylic },
            ] }],
        }),
        fetchProfile: () => Promise.resolve(profile),
        createFormula: vi.fn(),
    };
});


const settle = async (ms = 0) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };

async function openEditor() {
    render(
        <MemoryRouter initialEntries={['/studio/f1']}>
            <Routes><Route path="/studio/:id" element={<FormulationEditor />} /></Routes>
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
    mocks.region = 'none';
    mocks.salicylic = 4;
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ alerts: [], recommendations: [] }) });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('selling limits in the editor', () => {
    it('shows nothing when you are not selling', async () => {
        await openEditor();
        expect(screen.queryByRole('region', { name: /selling limits/ })).not.toBeInTheDocument();
    });

    it('warns about an ingredient over the EU limit when you plan to sell there', async () => {
        mocks.region = 'eu';
        await openEditor();
        const panel = screen.getByRole('region', { name: /European Union selling limits/ });
        expect(panel).toHaveTextContent('Salicylic acid');
        expect(panel).toHaveTextContent('Over the limit');
    });

    it('is happy when the formula is within the limits', async () => {
        mocks.region = 'eu';
        mocks.salicylic = 1.5;
        await openEditor();
        expect(screen.getByText(/None of the ingredients checked is over its limit/)).toBeInTheDocument();
    });
});
