import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FormulationEditor from './FormulationEditor';

const mocks = vi.hoisted(() => ({
    auth: { user: { id: 'u1', email: 'u@example.com' }, session: {}, username: 'tester', isLoading: false },
    formulation: {} as Record<string, unknown>,
    created: [] as { body: Record<string, unknown>; options?: { copy?: boolean } }[],
}));

vi.mock('../lib/saveFormulation', () => ({ saveFormulation: vi.fn().mockResolvedValue('f1') }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('../contexts/SettingsContext', () => ({
    useSettings: () => ({ currency: '$', dateFormat: 'en-US', warningDays: 30, setCurrency: vi.fn(), setDateFormat: vi.fn(), setWarningDays: vi.fn(), formatDate: (d: string) => d }),
}));
vi.mock('../components/FormulationCostCalculator', () => ({ default: () => <div /> }));

// The formulas and the product types come from the backend
vi.mock('../lib/formulasApi', () => {
    const profile = { id: 'ow_lotion', name: 'O/W Lotion', requires_water: false, default_ph_min: 5, default_ph_max: 6, max_oil_phase_percent: 30 };
    const water = { id: 'water', inci_name: 'Aqua', trade_name: 'Distilled Water', function: 'Solvent', solubility: 'water', min_usage_pct: 1, max_usage_pct: 100 };
    const phases = [{ id: 'pA', phase_letter: 'A', formulation_ingredients: [{ percentage: 100, is_qs: true, ingredients: water }] }];
    return {
        fetchFormula: (id: string) => {
            if (id === 'f0') return Promise.resolve({ id: 'f0', name: 'Base Lotion', formulation_phases: [] });
            if (id === 'f1' || id === 'f-copy') return Promise.resolve({ ...mocks.formulation, formulation_phases: phases });
            return Promise.reject(new Error('That formula does not exist.'));
        },
        fetchProfile: () => Promise.resolve(profile),
        createFormula: (body: Record<string, unknown>, options?: { copy?: boolean }) => { mocks.created.push({ body, options }); return Promise.resolve({ id: 'f-copy' }); },
    };
});

// The recipe a formula started as is still read from the community
vi.mock('../lib/communityApi', () => ({
    fetchPost: (id: string) => (id === 'p0' ? Promise.resolve({ id: 'p0', title: 'Original Day Cream', author_name: 'Kim' }) : Promise.reject(new Error('That post no longer exists.'))),
}));

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
    mocks.created = [];
    mocks.formulation = {
        id: 'f1', name: 'Day Cream v2', profile_id: 'ow_lotion', target_weight_g: 100, target_ph: 5.5, community_post_id: null,
        remixed_from_post_id: 'p0', cloned_from_formulation_id: 'f0',
    };
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ alerts: [], recommendations: [] }) });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('where a formula came from, in the editor', () => {
    it('shows the community recipe it started as and the formula it was copied from', async () => {
        await openEditor();
        expect(screen.getByRole('link', { name: 'Original Day Cream' })).toHaveAttribute('href', '/community/p0');
        expect(screen.getByText(/Remixed from/)).toHaveTextContent('by Kim');
        expect(screen.getByRole('link', { name: 'Base Lotion' })).toHaveAttribute('href', '/studio/f0');
    });

    it('shows nothing for a formula that started from scratch', async () => {
        mocks.formulation = { ...mocks.formulation, remixed_from_post_id: null, cloned_from_formulation_id: null };
        await openEditor();
        expect(screen.queryByText(/Remixed from/)).not.toBeInTheDocument();
        expect(screen.queryByText(/Copied from/)).not.toBeInTheDocument();
    });

    it('shows no link to a formula that is gone', async () => {
        mocks.formulation = { ...mocks.formulation, cloned_from_formulation_id: 'deleted' };
        await openEditor();
        expect(screen.queryByText(/Copied from/)).not.toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Original Day Cream' })).toBeInTheDocument(); // the rest of the trail stays
    });
});

describe('cloning a formula', () => {
    const clone = async () => {
        fireEvent.click(screen.getByRole('button', { name: /More/ }));
        fireEvent.click(screen.getByRole('menuitem', { name: /Clone this formula/ }));
        await settle(0);
        await settle(0);
    };

    it('points the copy back at the original, and keeps the community recipe it started as', async () => {
        await openEditor();
        await clone();
        expect(mocks.created).toHaveLength(1);
        const { body } = mocks.created[0];
        expect(body).toMatchObject({ name: 'Day Cream v2 Copy', profile_id: 'ow_lotion', cloned_from_formulation_id: 'f1', remixed_from_post_id: 'p0' });
        expect(body.ingredients).toEqual([{ ingredient_id: 'water', phase_letter: 'A', percentage: 100, is_qs: true }]);
    });

    it('leaves out the community link when the original did not start from a community recipe', async () => {
        mocks.formulation = { ...mocks.formulation, remixed_from_post_id: null };
        await openEditor();
        await clone();
        expect(mocks.created[0].body).toMatchObject({ cloned_from_formulation_id: 'f1', remixed_from_post_id: null });
    });

    it('opens the copy once it is made', async () => {
        await openEditor();
        await clone();
        expect(screen.getByText('Clone Successful')).toBeInTheDocument();
    });
});
