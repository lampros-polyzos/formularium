import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import LegalPage from './LegalPage';
import { LEGAL, PRIVACY_POLICY, TERMS_OF_USE } from '../content/legal';
import { SettingsProvider } from '../contexts/SettingsContext';

afterEach(cleanup);

const renderDoc = (doc: typeof PRIVACY_POLICY) => render(
    <SettingsProvider><MemoryRouter><LegalPage document={doc} /></MemoryRouter></SettingsProvider>
);

describe('Legal pages', () => {
    it('renders the privacy policy with a summary, sections and contact email', () => {
        renderDoc(PRIVACY_POLICY);
        expect(screen.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Your rights' })).toBeInTheDocument();
        expect(screen.getAllByRole('link', { name: LEGAL.contactEmail })[0]).toHaveAttribute('href', `mailto:${LEGAL.contactEmail}`);
        expect(screen.getByRole('link', { name: 'Terms of Use' })).toHaveAttribute('href', '/terms');
        expect(document.body.textContent).not.toContain('**');
    });

    it('renders the terms with the safety disclaimer', () => {
        renderDoc(TERMS_OF_USE);
        expect(screen.getByRole('heading', { level: 1, name: 'Terms of Use' })).toBeInTheDocument();
        expect(screen.getByText(/not a safety assessment/i)).toBeInTheDocument();
    });

    it('every section heading has a working table-of-contents link', () => {
        renderDoc(TERMS_OF_USE);
        const nav = screen.getByRole('navigation', { name: 'Sections' });
        for (const link of nav.querySelectorAll('a')) {
            expect(document.getElementById(link.getAttribute('href')!.slice(1))).not.toBeNull();
        }
    });

    it('mentions every browser storage key the app uses', () => {
        // Keep the policy honest: if a new storage key is added, update the policy's storage table
        const text = JSON.stringify(PRIVACY_POLICY.body).toLowerCase();
        for (const thing of ['sign-in session', 'currency', 'tour', 'auto-balance', 'stash check', 'return to after sign-in']) {
            expect(text).toContain(thing);
        }
    });
});
