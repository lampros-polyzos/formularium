import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FormulationEditor from './FormulationEditor';

const mocks = vi.hoisted(() => ({
    auth: { user: { id: 'u1', email: 'u@example.com' }, session: {}, username: 'tester', isLoading: false },
    phases: [] as unknown[],
    catalog: [] as unknown[],
    /** Every query made against the ingredient catalog: its `or` filter, and whether it was narrowed at all. */
    ingredientQueries: [] as { or?: string; narrowed: boolean }[],
    validation: { alerts: [] as unknown[], recommendations: [] as unknown[] },
}));

vi.mock('../lib/saveFormulation', () => ({ saveFormulation: vi.fn().mockResolvedValue('f1') }));
vi.mock('../lib/authClient', async () => {
    const { apiUrl } = await import('../lib/api');
    return { authFetch: (path: string, init?: RequestInit) => globalThis.fetch(apiUrl(path), init) };
});
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('../contexts/SettingsContext', () => ({
    useSettings: () => ({ currency: '$', dateFormat: 'en-US', warningDays: 30, setCurrency: vi.fn(), setDateFormat: vi.fn(), setWarningDays: vi.fn(), formatDate: (d: string) => d }),
}));
vi.mock('../components/FormulationCostCalculator', () => ({ default: () => <div /> }));

// The ingredient library and the stash come from the backend
vi.mock('../lib/libraryApi', async () => {
    const { toOrFilter } = await import('../lib/catalogFilter');
    return {
        searchIngredients: (search: { anyOf?: Parameters<typeof toOrFilter>[0]; ids?: string[] }) => {
            mocks.ingredientQueries.push({ or: search.anyOf ? toOrFilter(search.anyOf) : undefined, narrowed: !!(search.anyOf?.length || search.ids?.length) });
            return Promise.resolve(mocks.catalog);
        },
        fetchStash: () => Promise.resolve([]),
    fetchFavorites: () => Promise.resolve([]),
    addFavorite: () => Promise.resolve(),
    removeFavorite: () => Promise.resolve(),
    fetchIngredientByInci: () => Promise.resolve(null),
    };
});

vi.mock('../lib/supabase', () => {
    const formulation = { id: 'f1', name: 'Day Cream', profile_id: 'ow_lotion', target_weight_g: 100, target_ph: 4.5, community_post_id: null };
    const profile = { id: 'ow_lotion', name: 'O/W Lotion', requires_water: false, default_ph_min: 5, default_ph_max: 6, max_oil_phase_percent: 30 };
    const rows = (table: string) => {
        if (table === 'formulations') return formulation;
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
            resolve({ data: Array.isArray(data) ? data : [data], error: null });
        };
        return b;
    };
    return { supabase: { from: (t: string) => builder(t), channel: () => ({ on: () => ({ subscribe: () => ({}) }) }), removeChannel: vi.fn() } };
});

const WATER = { id: 'water', inci_name: 'Aqua', trade_name: 'Distilled Water', function: 'Solvent', solubility: 'water', min_usage_pct: 1, max_usage_pct: 100 };
const VITAMIN_E = { id: 'vitE', inci_name: 'Tocopherol', trade_name: 'Vitamin E', function: 'Antioxidant', solubility: 'oil', max_heating_temp_c: 40, min_usage_pct: 0.1, max_usage_pct: 1 };
const GLYCERIN = { id: 'glycerin', inci_name: 'Glycerin', trade_name: 'Glycerin', function: 'Humectant', solubility: 'water', min_usage_pct: 1, max_usage_pct: 10 };
const EUXYL = { id: 'pe', inci_name: 'Phenoxyethanol (and) Ethylhexylglycerin', trade_name: 'Euxyl PE 9010', function: 'Preservative', solubility: 'water', min_usage_pct: 0.5, max_usage_pct: 1.1, optimal_ph_min: 3, optimal_ph_max: 12, cost_category: 'medium' };

const FIXES = {
    move: { kind: 'move-phase', label: 'Move to Phase C', ingredientIds: ['vitE'], phase: 'C' },
    glycerin: { kind: 'set-percentage', label: 'Lower to 10%', ingredientIds: ['glycerin'], value: 10 },
    ph: { kind: 'set-ph', label: 'Set pH to 5.5', value: 5.5 },
    balance: { kind: 'balance', label: 'Balance to 100%' },
    add: { kind: 'add-ingredient', label: 'Add a preservative', category: 'preservative' },
};

const settle = async (ms = 0) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
const phaseBlock = (letter: string) => screen.getByText(new RegExp(`PHASE ${letter}`)).parentElement!.parentElement!;

async function openEditor() {
    render(
        <MemoryRouter initialEntries={['/studio/f1']}>
            <Routes><Route path="/studio/:id" element={<FormulationEditor />} /></Routes>
        </MemoryRouter>
    );
    await settle(50); // let the formula load
    await settle(50);
    await settle(600); // then the 400 ms validation debounce
}

beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    localStorage.setItem('formularium.editorTourSeen', '1');
    mocks.phases = [
        { id: 'pA', phase_letter: 'A', formulation_ingredients: [
            { percentage: 87.5, is_qs: true, ingredients: WATER },
            { percentage: 12, is_qs: false, ingredients: GLYCERIN },
        ] },
        { id: 'pB', phase_letter: 'B', formulation_ingredients: [{ percentage: 0.5, is_qs: false, ingredients: VITAMIN_E }] },
    ];
    mocks.catalog = [EUXYL];
    mocks.ingredientQueries = [];
    mocks.validation = {
        alerts: [
            { type: 'error', message: 'Heat-sensitive ingredients misplaced: Vitamin E', fix: FIXES.move },
            { type: 'error', message: 'Glycerin is at 12.00%, exceeding safe usage rate of 10.00%.', fix: FIXES.glycerin },
            { type: 'warning', message: 'Target pH is below the recommended minimum for this product type.', fix: FIXES.ph },
            { type: 'warning', message: 'Formula total is 90.50%.', fix: FIXES.balance },
            { type: 'error', message: 'Missing broad-spectrum preservative.', fix: FIXES.add },
        ],
        recommendations: [],
    };
    globalThis.fetch = vi.fn().mockImplementation(async () => ({ ok: true, json: async () => mocks.validation }));
});
afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

describe('one-click fixes in the editor', () => {
    it('shows a button on each fixable alert', async () => {
        await openEditor();
        for (const label of ['Move to Phase C', 'Lower to 10%', 'Set pH to 5.5', 'Balance to 100%', 'Add a preservative']) {
            expect(screen.getByRole('button', { name: new RegExp(label) })).toBeInTheDocument();
        }
    });

    it('moves an ingredient to Phase C, confirms it, and the button goes away', async () => {
        await openEditor();
        expect(within(phaseBlock('B')).getByText('Vitamin E')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /Move to Phase C/ }));
        await settle(0);

        expect(within(phaseBlock('C')).getByText('Vitamin E')).toBeInTheDocument();
        expect(screen.getByText('Moved Vitamin E to Phase C')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Move to Phase C/ })).not.toBeInTheDocument();
    });

    it('undoes a fix', async () => {
        await openEditor();
        fireEvent.click(screen.getByRole('button', { name: /Move to Phase C/ }));
        await settle(0);
        fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
        await settle(0);

        expect(within(phaseBlock('B')).getByText('Vitamin E')).toBeInTheDocument();
        expect(screen.queryByText('Moved Vitamin E to Phase C')).not.toBeInTheDocument();
    });

    it('sets an ingredient to its limit', async () => {
        await openEditor();
        expect(screen.getByDisplayValue('12')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Lower to 10%/ }));
        await settle(0);
        expect(screen.getByDisplayValue('10')).toBeInTheDocument();
        expect(screen.getByText('Glycerin set to 10%')).toBeInTheDocument();
    });

    it('sets the target pH, and undo restores it', async () => {
        await openEditor();
        expect(screen.getByDisplayValue('4.5')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Set pH to 5.5/ }));
        await settle(0);
        expect(screen.getByDisplayValue('5.5')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
        await settle(0);
        expect(screen.getByDisplayValue('4.5')).toBeInTheDocument();
    });

    it('opens the balance preview for a total that is off', async () => {
        await openEditor();
        fireEvent.click(screen.getByRole('button', { name: /Balance to 100%/ }));
        await settle(0);
        expect(screen.getByRole('dialog', { name: /Balance percentages/ })).toBeInTheDocument();
    });

    it('offers matching ingredients for "Add a preservative" and adds the chosen one', async () => {
        await openEditor();
        fireEvent.click(screen.getByRole('button', { name: /Add a preservative/ }));
        await settle(0);

        const dialog = screen.getByRole('dialog', { name: 'Add a preservative' });
        expect(within(dialog).getByText('Euxyl PE 9010')).toBeInTheDocument();
        fireEvent.click(within(dialog).getByRole('button', { name: 'Add Euxyl PE 9010' }));
        await settle(0);

        expect(screen.queryByRole('dialog', { name: 'Add a preservative' })).not.toBeInTheDocument();
        expect(screen.getAllByText('Euxyl PE 9010').length).toBeGreaterThan(0);
    });

    it('never downloads the whole ingredient catalog, only what could replace what is missing', async () => {
        await openEditor();
        // With an empty stash, glycerin and vitamin E are missing; water is assumed to be at hand
        expect(mocks.ingredientQueries.length).toBeGreaterThan(0);
        expect(mocks.ingredientQueries.every(q => q.narrowed), 'every catalog query is filtered').toBe(true);
        const filters = mocks.ingredientQueries.map(q => q.or ?? '').join(' ');
        expect(filters).toContain('humectant');
        expect(filters).toContain('antioxidant');
        expect(filters).not.toContain('emulsifier');
    });

    it('asks the library only for preservatives when the preservative picker opens', async () => {
        await openEditor();
        const before = mocks.ingredientQueries.length;
        fireEvent.click(screen.getByRole('button', { name: /Add a preservative/ }));
        await settle(0);

        const added = mocks.ingredientQueries.slice(before);
        expect(added.length).toBeGreaterThan(0);
        expect(added.every(q => q.narrowed)).toBe(true);
        expect(added.map(q => q.or)).toContain('function.ilike."preservative%"');
    });

    it('lets the toast go once the formula changes again', async () => {
        await openEditor();
        fireEvent.click(screen.getByRole('button', { name: /Lower to 10%/ }));
        await settle(0);
        expect(screen.getByText('Glycerin set to 10%')).toBeInTheDocument();

        fireEvent.change(screen.getByDisplayValue('10'), { target: { value: '6' } });
        await settle(0);
        expect(screen.queryByText('Glycerin set to 10%')).not.toBeInTheDocument();
    });

    it('lets the toast go by itself after a while', async () => {
        await openEditor();
        fireEvent.click(screen.getByRole('button', { name: /Move to Phase C/ }));
        await settle(0);
        expect(screen.getByText('Moved Vitamin E to Phase C')).toBeInTheDocument();
        await settle(10500);
        expect(screen.queryByText('Moved Vitamin E to Phase C')).not.toBeInTheDocument();
    });
});
