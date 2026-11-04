import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import RegionalLimitsPanel from './RegionalLimitsPanel';

afterEach(cleanup);

describe('the official EU entries in the selling-limits panel', () => {
    it('adds more limits once the official entries have loaded, without hiding the hand-written ones', async () => {
        render(<RegionalLimitsPanel region="eu" ingredients={[{ inci_name: 'Kojic Acid', percentage: 4 }, { inci_name: 'Cetrimonium Chloride', percentage: 3 }]} />);
        expect(screen.getAllByRole('listitem').map(li => li.querySelector('span')?.textContent)).toEqual(['Kojic acid']);
        expect(await screen.findByText('Cetrimonium Chloride')).toBeInTheDocument();
        expect(screen.getAllByText('Over the limit')).toHaveLength(2);
        expect(await screen.findByText(/CosIng database, Annex III \(updated \d\d\/\d\d\/\d{4}\)/)).toBeInTheDocument();
    });

    it('keeps label rules and conditions tucked away, and says how many there are', async () => {
        render(<RegionalLimitsPanel region="eu" ingredients={[{ inci_name: 'Aqua', percentage: 90 }, { inci_name: 'Linalool', percentage: 0.5 }, { inci_name: 'Hydrolyzed Wheat Protein', percentage: 2 }]} />);
        const summary = await screen.findByText(/Label rules and conditions for 2 ingredients/);
        expect(screen.getByText(/None of the ingredients checked is over its limit/)).toBeInTheDocument();   // all well on the numbers
        fireEvent.click(summary);
        const list = screen.getByRole('list', { name: 'Label rules and conditions' });
        expect(list).toHaveTextContent('Name it on the label');
        expect(list).toHaveTextContent('Good to know');
        expect(list).toHaveTextContent('Linalool');
    });

    it('shows no extra section when the formula has nothing to add', async () => {
        render(<RegionalLimitsPanel region="eu" ingredients={[{ inci_name: 'Aqua', percentage: 90 }]} />);
        await screen.findByText(/CosIng database/);
        expect(screen.queryByText(/Label rules and conditions for/)).not.toBeInTheDocument();
    });

    it('says a single ingredient in the singular', async () => {
        render(<RegionalLimitsPanel region="eu" ingredients={[{ inci_name: 'Linalool', percentage: 0.5 }]} />);
        expect(await screen.findByText('Label rules and conditions for 1 ingredient')).toBeInTheDocument();
    });
});
