import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BalancePreviewModal from './BalancePreviewModal';
import { balanceFormula, type BalanceIngredient } from '../lib/autoBalance';

afterEach(cleanup);

const row = (inci: string, trade: string, fn: string, min: number, max: number, solubility: string, extra: Partial<BalanceIngredient> = {}): BalanceIngredient =>
    ({ inci_name: inci, trade_name: trade, function: fn, min_usage_pct: min, max_usage_pct: max, solubility, percentage: 0, ...extra });

const list = [
    row('Aqua', 'Distilled Water', 'Solvent', 1, 100, 'water'),
    row('Cetearyl Olivate, Sorbitan Olivate', 'Olivem 1000', 'Emulsifier', 1.5, 5, 'oil'),
    row('Simmondsia Chinensis Seed Oil', 'Jojoba Oil', 'Carrier Oil', 1, 100, 'oil', { percentage: 25 }),
    row('Phenoxyethanol (and) Ethylhexylglycerin', 'Euxyl PE 9010', 'Preservative', 0.5, 1.1, 'dispersible', { percentage: 0.6, locked: true }),
];

describe('BalancePreviewModal', () => {
    it('shows every proposed value with its reason and applies on click', () => {
        const onApply = vi.fn();
        const result = balanceFormula(list, { id: 'ow_lotion', max_oil_phase_percent: 30 });
        render(<BalancePreviewModal result={result} names={list.map(i => i.trade_name)} keepLipidLoad={false}
            onKeepLipidLoadChange={() => {}} onApply={onApply} onClose={() => {}} />);

        expect(screen.getByText(/Oil-in-water emulsion/)).toBeInTheDocument();
        expect(screen.getByText(/Q\.S\.: fills the formula up to 100%/)).toBeInTheDocument();
        expect(screen.getByText('Locked by you')).toBeInTheDocument();
        expect(screen.getByLabelText('Locked')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
        expect(onApply).toHaveBeenCalled();
    });

    it('offers to keep the current oil load for emulsions', () => {
        const onKeep = vi.fn();
        const result = balanceFormula(list, { id: 'ow_lotion' });
        render(<BalancePreviewModal result={result} names={list.map(i => i.trade_name)} keepLipidLoad={false}
            onKeepLipidLoadChange={onKeep} onApply={() => {}} onClose={() => {}} />);
        fireEvent.click(screen.getByLabelText(/Keep my current amount of oils/));
        expect(onKeep).toHaveBeenCalledWith(true);
    });
});
