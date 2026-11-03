import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FormulationEditor from './FormulationEditor';

const mocks = vi.hoisted(() => ({
    auth: { user: { id: 'u1', email: 'u@example.com' }, session: {}, username: 'tester', isLoading: false },
    formulation: {} as Record<string, unknown>,
    inserts: [] as { table: string; row: Record<string, unknown> }[],
    unmigrated: false,
}));

vi.mock('../lib/saveFormulation', () => ({ saveFormulation: vi.fn().mockResolvedValue('f1') }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('../contexts/SettingsContext', () => ({
    useSettings: () => ({ currency: '$', dateFormat: 'en-US', warningDays: 30, setCurrency: vi.fn(), setDateFormat: vi.fn(), setWarningDays: vi.fn(), formatDate: (d: string) => d }),
}));
vi.mock('../components/FormulationCostCalculator', () => ({ default: () => <div /> }));

vi.mock('../lib/supabase', () => {
    const profile = { id: 'ow_lotion', name: 'O/W Lotion', requires_water: false, default_ph_min: 5, default_ph_max: 6, max_oil_phase_percent: 30 };
    const water = { id: 'water', inci_name: 'Aqua', trade_name: 'Distilled Water', function: 'Solvent', solubility: 'water', min_usage_pct: 1, max_usage_pct: 100 };
    const phases = [{ id: 'pA', phase_letter: 'A', formulation_ingredients: [{ percentage: 100, is_qs: true, ingredients: water }] }];

    const builder = (table: string) => {
        const filters: Record<string, unknown> = {};
        const state = { inserted: null as Record<string, unknown> | null, single: false };
        const b: Record<string, unknown> = {};
        const result = (): { data: unknown; error: unknown } => {
            if (state.inserted) {
                const refused = mocks.unmigrated && ('remixed_from_post_id' in state.inserted || 'cloned_from_formulation_id' in state.inserted);
                if (refused) return { data: null, error: { code: '42703', message: 'column does not exist' } };
                mocks.inserts.push({ table, row: state.inserted });
                if (table === 'formulation_phases') return { data: [{ id: 'new-phase', phase_letter: 'A' }], error: null };
                return { data: state.single ? { id: 'f-copy' } : null, error: null };
            }
            if (table === 'formulations') {
                if (filters.id === 'f0') return { data: { id: 'f0', name: 'Base Lotion' }, error: null };
                return { data: filters.id === 'f1' || filters.id === 'f-copy' ? mocks.formulation : null, error: null };
            }
            if (table === 'community_posts') return { data: filters.id === 'p0' ? { id: 'p0', title: 'Original Day Cream', author_name: 'Kim' } : null, error: null };
            if (table === 'formulation_phases') return { data: phases, error: null };
            if (table === 'formulation_profiles') return { data: profile, error: null };
            return { data: [], error: null };
        };
        for (const m of ['select', 'or', 'order', 'limit', 'match', 'in', 'update']) b[m] = () => b;
        b.eq = (col: string, val: unknown) => { filters[col] = val; return b; };
        b.insert = (rows: Record<string, unknown>[]) => { state.inserted = rows[0]; return b; };
        b.single = () => { state.single = true; return Promise.resolve(result()); };
        b.maybeSingle = () => Promise.resolve(result());
        b.then = (resolve: (v: unknown) => void) => {
            const r = result();
            resolve({ ...r, data: Array.isArray(r.data) || r.data === null ? r.data : [r.data] });
        };
        return b;
    };
    return { supabase: { from: builder, rpc: vi.fn().mockResolvedValue({ error: null }), channel: () => ({ on: () => ({ subscribe: () => ({}) }) }), removeChannel: vi.fn() } };
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

const insertsInto = (table: string) => mocks.inserts.filter(i => i.table === table).map(i => i.row);

beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    localStorage.setItem('formularium.editorTourSeen', '1');
    mocks.inserts = [];
    mocks.unmigrated = false;
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
        const [copy] = insertsInto('formulations');
        expect(copy).toMatchObject({ name: 'Day Cream v2 Copy', user_id: 'u1', cloned_from_formulation_id: 'f1', remixed_from_post_id: 'p0' });
        expect(insertsInto('formulation_ingredients')).toHaveLength(1);
    });

    it('leaves out the community link when the original did not start from a community recipe', async () => {
        mocks.formulation = { ...mocks.formulation, remixed_from_post_id: null };
        await openEditor();
        await clone();
        const [copy] = insertsInto('formulations');
        expect(copy).toMatchObject({ cloned_from_formulation_id: 'f1' });
        expect(copy).not.toHaveProperty('remixed_from_post_id');
    });

    it('still makes the copy if the database has not been migrated yet', async () => {
        await openEditor();
        mocks.unmigrated = true;
        await clone();
        const [copy] = insertsInto('formulations');
        expect(copy).toMatchObject({ name: 'Day Cream v2 Copy' });
        expect(copy).not.toHaveProperty('cloned_from_formulation_id');
        expect(insertsInto('formulation_ingredients')).toHaveLength(1);
    });
});
