import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PhasesPanel from './PhasesPanel';
import type { FormulaIngredient } from '../../types/formulation';

afterEach(cleanup);

const ingredient = (name: string, phase: 'A' | 'B' | 'C', percentage: number): FormulaIngredient => ({
    id: name, inci_name: `${name} INCI`, trade_name: name, function: 'Solvent', solubility: 'water', max_heating_temp_c: null, optimal_ph_min: null, optimal_ph_max: null,
    min_usage_pct: null, max_usage_pct: null, phase, percentage, isQS: false,
});

const renderPanel = (formulaIngredients: FormulaIngredient[], overrides: Partial<React.ComponentProps<typeof PhasesPanel>> = {}) => render(
    <PhasesPanel
        formulaIngredients={formulaIngredients} targetWeight={100} currentTotalPercentage={100} sourcing={[]} showStashHints={false}
        isSearchingSubstitutes={false} isAutoBalance={false} onOpenDetails={vi.fn()} onPercentageChange={vi.fn()} onToggleLock={vi.fn()}
        onPhaseChange={vi.fn()} onRemove={vi.fn()} onSwap={vi.fn()} onUndoSwap={vi.fn()} onBalance={vi.fn()} onToggleAutoBalance={vi.fn()}
        {...overrides}
    />,
);

describe('PhasesPanel', () => {
    it('shows the column headers once, in one table, however many phases there are', () => {
        renderPanel([ingredient('Water', 'A', 70), ingredient('Shea butter', 'B', 20), ingredient('Preservative', 'C', 1)]);

        expect(screen.getAllByRole('table')).toHaveLength(1);
        for (const header of ['Ingredient', 'Function', 'Target %', 'Weight (g)', 'Phase', 'Action']) {
            expect(screen.getAllByRole('columnheader', { name: header })).toHaveLength(1);
        }
    });

    it('lists each phase under its own banner, with that phase\'s total', () => {
        renderPanel([ingredient('Water', 'A', 70), ingredient('Glycerin', 'A', 5), ingredient('Shea butter', 'B', 20)]);

        const banners = screen.getAllByRole('rowheader').map(h => h.textContent);
        expect(banners).toEqual([
            expect.stringContaining('PHASE A (Water Phase)'),
            expect.stringContaining('PHASE B (Oil Phase)'),
            expect.stringContaining('PHASE C (Cool Down Phase)'),
        ]);
        expect(banners[0]).toContain('75.00%');   // 70 + 5
        expect(banners[1]).toContain('20.00%');
        expect(banners[2]).toContain('0.00%');
    });

    it('keeps every ingredient in its phase, in the same columns', () => {
        renderPanel([ingredient('Aqua base', 'A', 70), ingredient('Shea butter', 'B', 20)]);

        const table = screen.getByRole('table');
        const rows = within(table).getAllByRole('row');
        const labels = rows.map(r => r.textContent ?? '');
        const at = (text: string) => labels.findIndex(l => l.includes(text));

        // header, banner A, Water, banner B, Shea butter, banner C, "none yet"
        expect(at('Ingredient')).toBe(0);
        expect(at('PHASE A')).toBeLessThan(at('Aqua base'));
        expect(at('Aqua base')).toBeLessThan(at('PHASE B'));
        expect(at('PHASE B')).toBeLessThan(at('Shea butter'));
        expect(at('Shea butter')).toBeLessThan(at('PHASE C'));
        expect(within(rows[at('Aqua base')]).getAllByRole('cell')).toHaveLength(6);   // a full row: ingredient, function, target, weight, phase, action
    });

    it('says so, in the same table, when a phase has no ingredients', () => {
        renderPanel([ingredient('Water', 'A', 100)]);
        expect(screen.getByText('No ingredients added to Phase B yet.')).toBeInTheDocument();
        expect(screen.getByText('No ingredients added to Phase C yet.')).toBeInTheDocument();
        expect(screen.queryByText('No ingredients added to Phase A yet.')).not.toBeInTheDocument();
        expect(screen.getAllByRole('table')).toHaveLength(1);
    });

    it('still edits a percentage, moves an ingredient to another phase and removes it', () => {
        const onPercentageChange = vi.fn();
        const onPhaseChange = vi.fn();
        const onRemove = vi.fn();
        renderPanel([ingredient('Water', 'A', 70), ingredient('Shea butter', 'B', 20)], { onPercentageChange, onPhaseChange, onRemove });

        const sheaRow = screen.getByText('Shea butter').closest('tr')!;
        fireEvent.change(within(sheaRow).getByRole('spinbutton'), { target: { value: '25' } });
        expect(onPercentageChange).toHaveBeenCalledWith(1, '25');

        fireEvent.click(within(sheaRow).getByText('▶'));
        expect(onPhaseChange).toHaveBeenCalledWith(1, 'C');

        fireEvent.click(within(sheaRow).getByTitle('Remove ingredient'));
        expect(onRemove).toHaveBeenCalledWith(1);
    });
});
