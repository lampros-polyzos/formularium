import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ToolsPage from './ToolsPage';
import { SettingsProvider } from '../contexts/SettingsContext';
import { fixToolLink, toolsUrl } from '../lib/toolLinks';

vi.mock('../lib/supabase', () => ({ supabase: { auth: { signOut: vi.fn() }, from: vi.fn(), channel: vi.fn(), removeChannel: vi.fn() } }));
vi.mock('../contexts/AuthContext', () => {
    const value = { user: null, session: null, username: null, isLoading: false };
    return { useAuth: () => value };
});

afterEach(cleanup);

function renderAt(path: string) {
    return render(
        <SettingsProvider><MemoryRouter initialEntries={[path]}>
            <Routes><Route path="/tools" element={<ToolsPage />} /></Routes>
        </MemoryRouter></SettingsProvider>
    );
}

const type = (label: string | RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('toolsUrl and fixToolLink', () => {
    it('builds links and leaves out what is unknown', () => {
        expect(toolsUrl('hlb')).toBe('/tools?tool=hlb');
        expect(toolsUrl('ph', { batch: 250, target: 5.5 })).toBe('/tools?tool=ph&batch=250&target=5.5');
        expect(toolsUrl('ph', { batch: NaN, target: null })).toBe('/tools?tool=ph');
    });

    it('offers a calculator for the fixes that have one', () => {
        expect(fixToolLink('preservative', { batchG: 250, waterPct: 70.04 })?.href).toBe('/tools?tool=preservative&batch=250&water=70');
        expect(fixToolLink('emulsifier', {})?.href).toBe('/tools?tool=hlb');
        expect(fixToolLink('neutralizer', { batchG: 100, targetPh: 6 })?.href).toBe('/tools?tool=ph&batch=100&target=6');
        expect(fixToolLink('antioxidant', {})).toBeNull();
    });
});

describe('Calculators page', () => {
    it('opens on the HLB tool and switches tools with the tabs, ignoring unknown ones', () => {
        renderAt('/tools?tool=nonsense');
        expect(screen.getByRole('tab', { name: 'HLB blend', selected: true })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('tab', { name: 'Dilution' }));
        expect(screen.getByRole('tab', { name: 'Dilution', selected: true })).toBeInTheDocument();
        expect(screen.getByText('Make a weaker solution from a stronger one')).toBeInTheDocument();
    });

    it('dilution: 10% from a 50% stock', () => {
        renderAt('/tools?tool=dilution');
        type('How much to make', '100');
        expect(screen.getByRole('status')).toHaveTextContent('Mix 20 g of the 50% stock with 80 g of water');
        type('Wanted strength', '80');
        expect(screen.getByRole('status')).toHaveTextContent('cannot make a solution stronger');
    });

    it('preservative: fills in batch size and water share from the link', () => {
        renderAt('/tools?tool=preservative&batch=250&water=70');
        expect(screen.getByLabelText('Batch size')).toHaveValue('250');
        expect(screen.getByLabelText('Water in the batch')).toHaveValue('70');
        // default Euxyl PE 9010 midpoint is 0.8%, taken from the water: 250 g x 70% x 0.8% = 1.4 g
        expect(screen.getByRole('status')).toHaveTextContent('Add 1.4 g of preservative');
        type('Dose', '3');
        expect(screen.getByRole('status')).toHaveTextContent('above the usual');
    });

    it('pH: scales a bench test to the batch and fills in the target from the link', () => {
        renderAt('/tools?tool=ph&batch=400&target=5.8');
        expect(screen.getByLabelText('Target pH')).toHaveValue('5.8');
        fireEvent.change(screen.getByLabelText('Amount added'), { target: { value: '2' } }); // 2 drops = 0.1 g
        fireEvent.change(screen.getByLabelText('Unit added'), { target: { value: 'drops' } });
        type('pH before', '6.4');
        type('pH after', '6.0');
        expect(screen.getByText(/You need about/).closest('[role="status"]')).toHaveTextContent('3 g');
        type('pH after', '6.4');
        expect(screen.getByText(/did not move/)).toBeInTheDocument();
        type('pH after', '6.8');
        expect(screen.getByText(/away from the target/)).toBeInTheDocument();
    });

    it('HLB: works out the oil phase and the emulsifier ratio', () => {
        renderAt('/tools?tool=hlb');
        fireEvent.change(screen.getAllByLabelText('Req. HLB')[0], { target: { value: '6.5' } });
        fireEvent.change(screen.getAllByLabelText('Grams')[0], { target: { value: '10' } });
        expect(screen.getByText(/oil phase needs an HLB/).closest('[role="status"]')).toHaveTextContent('6.5');
        type('Total emulsifier (optional)', '4');
        const results = screen.getAllByRole('status');
        expect(results[results.length - 1]).toHaveTextContent('Steareth-2');
        expect(results[results.length - 1]).toHaveTextContent('Steareth-20');
    });

    it('units: converts ounces to grams', () => {
        renderAt('/tools?tool=units');
        fireEvent.change(screen.getAllByLabelText('Amount')[0], { target: { value: '2' } });
        expect(screen.getAllByRole('status')[0]).toHaveTextContent('2 oz = 56.7 g');
    });
});

describe('Fix modal calculator link', () => {
    it('opens the matching calculator in a new tab, and is absent when there is none', async () => {
        const { default: FixSuggestionModal } = await import('../components/FixSuggestionModal');
        const props = { category: 'preservative' as const, suggestions: [], onPick: vi.fn(), onBrowse: vi.fn(), onClose: vi.fn() };
        const { rerender } = render(<FixSuggestionModal {...props} toolLink={fixToolLink('preservative', { batchG: 250, waterPct: 70 })} />);
        const link = screen.getByRole('link', { name: /Work out the dose/ });
        expect(link).toHaveAttribute('href', '/tools?tool=preservative&batch=250&water=70');
        expect(link).toHaveAttribute('target', '_blank');
        rerender(<FixSuggestionModal {...props} category="antioxidant" toolLink={null} />);
        expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });
});
