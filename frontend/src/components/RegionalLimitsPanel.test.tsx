import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RegionalLimitsPanel from './RegionalLimitsPanel';
import { SettingsProvider, useSettings } from '../contexts/SettingsContext';
import { SettingsModal } from './SettingsModal';

vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: null, username: null }) }));
vi.mock('../hooks/useDialog', () => ({ useDialog: () => ({ alert: vi.fn(), confirm: vi.fn() }) }));
vi.mock('./AccountDataSection', () => ({ default: () => null }));

afterEach(cleanup);
beforeEach(() => localStorage.clear());

const lines = [{ inci_name: 'Salicylic Acid', percentage: 2.5 }, { inci_name: 'Alpha-Arbutin', percentage: 3 }];

describe('the selling-limits panel', () => {
    it('shows nothing when you are not selling, or the setting is unknown', () => {
        const { container, rerender } = render(<RegionalLimitsPanel region="none" ingredients={lines} />);
        expect(container).toBeEmptyDOMElement();
        rerender(<RegionalLimitsPanel region={undefined} ingredients={lines} />);
        expect(container).toBeEmptyDOMElement();
    });

    it('warns about each ingredient that is over, worst first', () => {
        render(<RegionalLimitsPanel region="eu" ingredients={lines} />);
        const names = screen.getAllByRole('listitem').map(li => li.querySelector('span')?.textContent);
        expect(names).toEqual(['Alpha-arbutin', 'Salicylic acid']);
        expect(screen.getByText('Over the limit')).toBeInTheDocument();
        expect(screen.getByText('Depends on product')).toBeInTheDocument();
    });

    it('says when all is well, and still says it is only guidance', () => {
        render(<RegionalLimitsPanel region="eu" ingredients={[{ inci_name: 'Aqua', percentage: 90 }]} />);
        expect(screen.getByText(/None of the ingredients checked is over its limit/)).toBeInTheDocument();
        expect(screen.getByText(/not legal advice/)).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /1223\/2009/ })).toHaveAttribute('href', expect.stringContaining('eur-lex.europa.eu'));
    });
});

describe('the "where do you plan to sell" setting', () => {
    function Probe() { const { sellingRegion } = useSettings(); return <p>region:{sellingRegion}</p>; }
    const renderSettings = () => render(<SettingsProvider><Probe /><SettingsModal isOpen onClose={() => {}} /></SettingsProvider>);

    it('starts as not selling', () => {
        renderSettings();
        expect(screen.getByText('region:none')).toBeInTheDocument();
        expect(screen.getByLabelText('Where do you plan to sell?')).toHaveValue('none');
    });

    it('is chosen in the settings and remembered', () => {
        const first = renderSettings();
        fireEvent.change(screen.getByLabelText('Where do you plan to sell?'), { target: { value: 'eu' } });
        expect(screen.getByText('region:eu')).toBeInTheDocument();
        expect(localStorage.getItem('selling_region')).toBe('eu');
        first.unmount();
        renderSettings();
        expect(screen.getByText('region:eu')).toBeInTheDocument();
    });

    it('ignores a saved value it does not know', () => {
        localStorage.setItem('selling_region', 'atlantis');
        renderSettings();
        expect(screen.getByText('region:none')).toBeInTheDocument();
    });

    it('has a low-stock level that starts at 20 g, can be changed, and is remembered', () => {
        function LowProbe() { const { lowStockGrams } = useSettings(); return <p>low:{lowStockGrams}</p>; }
        const draw = () => render(<SettingsProvider><LowProbe /><SettingsModal isOpen onClose={() => {}} /></SettingsProvider>);
        const first = draw();
        expect(screen.getByText('low:20')).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('Low Stock Level (grams)'), { target: { value: '35' } });
        expect(screen.getByText('low:35')).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('Low Stock Level (grams)'), { target: { value: '-4' } });
        expect(screen.getByText('low:0')).toBeInTheDocument(); // never below zero
        fireEvent.change(screen.getByLabelText('Low Stock Level (grams)'), { target: { value: '35' } });
        first.unmount();
        draw();
        expect(screen.getByText('low:35')).toBeInTheDocument();
    });
});
