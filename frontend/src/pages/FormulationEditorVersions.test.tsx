import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FormulationEditor from './FormulationEditor';

const mocks = vi.hoisted(() => ({
    auth: { user: { id: 'u1', email: 'u@example.com' }, session: {}, username: 'tester', isLoading: false },
    region: 'none' as string,
    salicylic: 4,
    saveVersion: vi.fn(),
}));

vi.mock('../lib/formulaVersions', () => ({ saveVersion: (...a: unknown[]) => mocks.saveVersion(...a) }));
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
            <Routes><Route path="/studio/:id" element={<FormulationEditor />} /><Route path="/studio/:id/history" element={<p>HISTORY PAGE</p>} /></Routes>
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
    mocks.saveVersion.mockReset().mockResolvedValue({ version_number: 4 });
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ alerts: [], recommendations: [] }) });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
});


const openMore = () => fireEvent.click(screen.getByRole('button', { name: /More/ }));

describe('saving a version from the editor', () => {
    it('asks what changed and why, keeps the formula as it is on screen with that note, and says which version it became', async () => {
        await openEditor();
        openMore();
        fireEvent.click(screen.getByRole('menuitem', { name: /Save a version/ }));
        expect(screen.getByRole('dialog', { name: /Save a version/ })).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('What did you change, and why?'), { target: { value: 'More salicylic for the peel' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save version' }));
        await settle(0);
        await settle(0);

        expect(mocks.saveVersion).toHaveBeenCalledTimes(1);
        const [formulaId, input, note] = mocks.saveVersion.mock.calls[0];
        expect(formulaId).toBe('f1');
        expect(note).toBe('More salicylic for the peel');
        expect(input).toMatchObject({ name: 'Peel', profileId: 'ow_lotion', targetWeight: 100 });
        expect(input.ingredients.map((i: { inci_name: string; percentage: number }) => [i.inci_name, i.percentage])).toEqual(expect.arrayContaining([['Salicylic Acid', 4]]));
        expect(screen.queryByRole('dialog', { name: /Save a version/ })).not.toBeInTheDocument();
        expect(screen.getByText(/Saved as version 4/)).toBeInTheDocument();
    });

    it('stays open with the problem, and the note, when the version could not be kept', async () => {
        mocks.saveVersion.mockRejectedValue(new Error('Could not save the version: offline'));
        await openEditor();
        openMore();
        fireEvent.click(screen.getByRole('menuitem', { name: /Save a version/ }));
        fireEvent.change(screen.getByLabelText('What did you change, and why?'), { target: { value: 'keep me' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save version' }));
        await settle(0);
        await settle(0);
        expect(screen.getByRole('alert')).toHaveTextContent('offline');
        expect(screen.getByLabelText('What did you change, and why?')).toHaveValue('keep me');
    });

    it('can be cancelled without keeping anything', async () => {
        await openEditor();
        openMore();
        fireEvent.click(screen.getByRole('menuitem', { name: /Save a version/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(screen.queryByRole('dialog', { name: /Save a version/ })).not.toBeInTheDocument();
        expect(mocks.saveVersion).not.toHaveBeenCalled();
    });

    it('opens the version history of the formula', async () => {
        await openEditor();
        openMore();
        fireEvent.click(screen.getByRole('menuitem', { name: /Version history/ }));
        expect(screen.getByText('HISTORY PAGE')).toBeInTheDocument();
    });
});
