import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AutosaveIndicator from './AutosaveIndicator';

afterEach(cleanup);

const base = { error: null, lastSavedAt: null, isSavedFormula: false, canAutosave: true, hasProfile: true, onRetry: () => {} };

describe('AutosaveIndicator', () => {
    it('says nothing for a brand-new untouched formula', () => {
        render(<AutosaveIndicator {...base} status="clean" />);
        expect(screen.getByRole('status')).toBeEmptyDOMElement();
    });

    it('shows saving, unsaved and saved states', () => {
        const { rerender } = render(<AutosaveIndicator {...base} status="saving" />);
        expect(screen.getByRole('status')).toHaveTextContent('Saving…');
        rerender(<AutosaveIndicator {...base} status="dirty" />);
        expect(screen.getByRole('status')).toHaveTextContent('Unsaved changes');
        rerender(<AutosaveIndicator {...base} status="clean" lastSavedAt={new Date()} />);
        expect(screen.getByRole('status')).toHaveTextContent('All changes saved');
        rerender(<AutosaveIndicator {...base} status="clean" isSavedFormula />);
        expect(screen.getByRole('status')).toHaveTextContent('All changes saved');
    });

    it('explains why a new formula is not autosaving yet', () => {
        render(<AutosaveIndicator {...base} status="dirty" canAutosave={false} hasProfile={false} />);
        expect(screen.getByRole('status')).toHaveTextContent(/choose a product type/i);
    });

    it('offers a retry when saving fails', () => {
        const onRetry = vi.fn();
        render(<AutosaveIndicator {...base} status="error" error="network down" onRetry={onRetry} />);
        expect(screen.getByRole('status')).toHaveAttribute('title', 'network down');
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        expect(onRetry).toHaveBeenCalled();
    });
});
