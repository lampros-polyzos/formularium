import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import StartPage from './StartPage';
import { STARTER_TEMPLATES } from '../lib/starterTemplates';

vi.mock('../components/Header', () => ({ default: ({ title }: { title: string }) => <header>{title}</header> }));

afterEach(cleanup);

const renderPage = () => render(<MemoryRouter><StartPage /></MemoryRouter>);

describe('What are you making?', () => {
    it('asks the question', () => {
        renderPage();
        expect(screen.getByRole('heading', { level: 1, name: 'What are you making?' })).toBeInTheDocument();
    });

    it('offers each starter template, linking to a new formula started from it', () => {
        renderPage();
        for (const template of STARTER_TEMPLATES) {
            const card = screen.getByRole('link', { name: new RegExp(template.name) });
            expect(card).toHaveAttribute('href', `/studio/new?template=${template.id}`);
            expect(within(card).getByText(template.tagline)).toBeInTheDocument();
        }
        expect(STARTER_TEMPLATES.map(t => t.name)).toEqual(['Light lotion', 'Hydrating toner', 'Body butter', 'Gentle shampoo']);
    });

    it('shows what goes into each one and how hard it is', () => {
        renderPage();
        const lotion = screen.getByRole('link', { name: /Light lotion/ });
        const contents = within(within(lotion).getByRole('list', { name: 'Light lotion contains' }));
        expect(contents.getByText('Emulsifier')).toBeInTheDocument();
        expect(contents.getByText('Preservative')).toBeInTheDocument();
        expect(within(lotion).getByText('Easy')).toBeInTheDocument();
        expect(within(screen.getByRole('link', { name: /Body butter/ })).getByText('Easiest')).toBeInTheDocument();
    });

    it('offers to paste a formula from anywhere', () => {
        renderPage();
        expect(screen.getByRole('link', { name: /Paste a formula/ })).toHaveAttribute('href', '/studio/import');
    });

    it('still lets you start from scratch', () => {
        renderPage();
        expect(screen.getByRole('link', { name: /start from scratch/i })).toHaveAttribute('href', '/studio/new');
    });
});
