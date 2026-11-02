import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import FormulationCompanion from './FormulationCompanion';
import RecommendationsPanel from './RecommendationsPanel';
import FixSuggestionModal from './FixSuggestionModal';
import FixToast from './FixToast';
import type { Fix } from '../types/fixes';

afterEach(cleanup);

const moveFix: Fix = { kind: 'move-phase', label: 'Move to Phase C', ingredientIds: ['e'], phase: 'C' };
const addFix: Fix = { kind: 'add-ingredient', label: 'Add a preservative', category: 'preservative' };

describe('FormulationCompanion fix buttons', () => {
    const alerts = [
        { type: 'error' as const, message: 'Heat-sensitive ingredients misplaced', fix: moveFix },
        { type: 'warning' as const, message: 'An alert without a remedy' },
    ];

    it('shows a button only on alerts that have a fix, and runs it', () => {
        const onFix = vi.fn();
        render(<FormulationCompanion alerts={alerts} hasProfile onFix={onFix} />);
        expect(screen.getAllByRole('button')).toHaveLength(1);
        fireEvent.click(screen.getByRole('button', { name: /Move to Phase C/ }));
        expect(onFix).toHaveBeenCalledWith(moveFix);
    });

    it('hides a fix that no longer applies', () => {
        render(<FormulationCompanion alerts={alerts} hasProfile onFix={vi.fn()} canFix={() => false} />);
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
        expect(screen.getByText('Heat-sensitive ingredients misplaced')).toBeInTheDocument();
    });

    it('shows no buttons when no handler is given', () => {
        render(<FormulationCompanion alerts={alerts} hasProfile />);
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
});

describe('RecommendationsPanel fix buttons', () => {
    const recs = [{ type: 'tip' as const, title: 'No Preservative', message: 'Bacteria will grow.', action: 'Add one.', fix: addFix }];

    it('shows the fix next to the suggested action and runs it', () => {
        const onFix = vi.fn();
        render(<RecommendationsPanel recommendations={recs} onFix={onFix} />);
        expect(screen.getByText('Add one.')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Add a preservative/ }));
        expect(onFix).toHaveBeenCalledWith(addFix);
    });

    it('hides it when it does not apply', () => {
        render(<RecommendationsPanel recommendations={recs} onFix={vi.fn()} canFix={() => false} />);
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
});

describe('FixSuggestionModal', () => {
    const suggestion = {
        ingredient: { id: 'pe', inci_name: 'Phenoxyethanol (and) Ethylhexylglycerin', trade_name: 'Euxyl PE 9010', function: 'Preservative', min_usage_pct: 0.5, max_usage_pct: 1.1 },
        reasons: ['In your stash', 'Works at pH 5'],
    };

    it('lists suggestions with the reasons and adds the chosen one', () => {
        const onPick = vi.fn();
        render(<FixSuggestionModal category="preservative" suggestions={[suggestion]} onPick={onPick} onBrowse={() => {}} onClose={() => {}} />);
        expect(screen.getByRole('dialog', { name: 'Add a preservative' })).toBeInTheDocument();
        expect(screen.getByText('In your stash')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Add Euxyl PE 9010' }));
        expect(onPick).toHaveBeenCalledWith(suggestion);
    });

    it('explains when nothing matches and offers the full library', () => {
        const onBrowse = vi.fn();
        render(<FixSuggestionModal category="preservative" suggestions={[]} onPick={() => {}} onBrowse={onBrowse} onClose={() => {}} />);
        expect(screen.getByText(/Nothing in the library matches/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Search the full library' }));
        expect(onBrowse).toHaveBeenCalled();
    });

    it('closes with Escape', () => {
        const onClose = vi.fn();
        render(<FixSuggestionModal category="oil" suggestions={[]} onPick={() => {}} onBrowse={() => {}} onClose={onClose} />);
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(onClose).toHaveBeenCalled();
    });
});

describe('FixToast', () => {
    it('says what changed, and offers undo and dismiss', () => {
        const onUndo = vi.fn(), onDismiss = vi.fn();
        render(<FixToast message="Moved Vitamin E to Phase C" onUndo={onUndo} onDismiss={onDismiss} />);
        expect(screen.getByRole('status')).toHaveTextContent('Moved Vitamin E to Phase C');
        fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
        fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
        expect(onUndo).toHaveBeenCalled();
        expect(onDismiss).toHaveBeenCalled();
    });
});
