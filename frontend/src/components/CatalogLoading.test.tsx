import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import FixSuggestionModal from './FixSuggestionModal';
import SubstitutionHint from './SubstitutionHint';
import type { CatalogIngredient, SourcingItem } from '../lib/substitutions';

afterEach(cleanup);

const glycerin: CatalogIngredient = { id: 'g', inci_name: 'Glycerin', trade_name: 'Glycerin', function: 'Humectant', min_usage_pct: 1, max_usage_pct: 10 };
const missing: SourcingItem = {
    line: { ingredient: glycerin, phase: 'A', percentage: 5 },
    neededG: 5, haveG: null, status: 'missing', buyG: 6, stashOptions: [], marketOptions: [],
};
const inTable = (ui: React.ReactElement) => render(<table><tbody>{ui}</tbody></table>);

describe('substitution hint while candidates load', () => {
    it('says it is looking, not that nothing exists', () => {
        inTable(<SubstitutionHint item={missing} onSwap={vi.fn()} isSearching />);
        expect(screen.getByText('Looking for substitutes...')).toBeInTheDocument();
        expect(screen.queryByText(/No close substitutes/)).not.toBeInTheDocument();
        expect(screen.getByText(/Not in your stash/)).toBeInTheDocument(); // the stock status never waits
    });

    it('reports "none found" once the search is over', () => {
        inTable(<SubstitutionHint item={missing} onSwap={vi.fn()} />);
        expect(screen.getByText(/No close substitutes found/)).toBeInTheDocument();
        expect(screen.queryByText('Looking for substitutes...')).not.toBeInTheDocument();
    });
});

describe('fix picker while candidates load', () => {
    const props = { category: 'preservative' as const, suggestions: [], onPick: vi.fn(), onBrowse: vi.fn(), onClose: vi.fn() };

    it('says it is looking instead of "nothing matches"', () => {
        render(<FixSuggestionModal {...props} isLoading />);
        expect(screen.getByRole('status')).toHaveTextContent('Looking in the library');
        expect(screen.queryByText(/Nothing in the library matches/)).not.toBeInTheDocument();
    });

    it('says nothing matches only when the search is over', () => {
        render(<FixSuggestionModal {...props} />);
        expect(screen.getByText(/Nothing in the library matches/)).toBeInTheDocument();
    });
});
