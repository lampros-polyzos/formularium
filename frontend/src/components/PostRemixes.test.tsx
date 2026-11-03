import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LineageNotice from './LineageNotice';
import { RemixedFrom, RemixList } from './PostRemixes';

const mocks = vi.hoisted(() => ({
    post: null as unknown,
    remixes: [] as unknown[],
    error: null as unknown,
}));

vi.mock('../lib/lineage', () => ({
    fetchPostSummary: () => Promise.resolve(mocks.error ? null : mocks.post),
    fetchRemixes: () => Promise.resolve(mocks.error ? [] : mocks.remixes),
}));

afterEach(() => {
    cleanup();
    mocks.post = null;
    mocks.remixes = [];
    mocks.error = null;
});

const settle = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
const inRouter = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('LineageNotice', () => {
    it('links to the original recipe and credits its author', () => {
        inRouter(<LineageNotice remixedFrom={{ id: 'p1', title: 'Day Cream', author_name: 'Sam' }} />);
        expect(screen.getByRole('link', { name: 'Day Cream' })).toHaveAttribute('href', '/community/p1');
        expect(screen.getByText(/Remixed from/)).toHaveTextContent('Remixed from Day Cream by Sam');
    });

    it('links to the formula a copy was made from', () => {
        inRouter(<LineageNotice clonedFrom={{ id: 'f1', name: 'My Lotion' }} />);
        expect(screen.getByRole('link', { name: 'My Lotion' })).toHaveAttribute('href', '/studio/f1');
        expect(screen.getByText(/Copied from/)).toBeInTheDocument();
        expect(screen.queryByText(/Remixed from/)).not.toBeInTheDocument();
    });

    it('shows both, and leaves out the author when it is unknown', () => {
        inRouter(<LineageNotice remixedFrom={{ id: 'p1', title: 'Day Cream', author_name: null }} clonedFrom={{ id: 'f1', name: 'My Lotion' }} />);
        expect(screen.getByRole('link', { name: 'Day Cream' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'My Lotion' })).toBeInTheDocument();
        expect(screen.queryByText(/ by /)).not.toBeInTheDocument();
    });

    it('renders nothing with nothing to show', () => {
        const { container } = inRouter(<LineageNotice remixedFrom={null} clonedFrom={null} />);
        expect(container).toBeEmptyDOMElement();
    });
});

describe('RemixedFrom', () => {
    it('shows where a post came from', async () => {
        mocks.post = { id: 'p1', title: 'Day Cream', author_name: 'Sam' };
        inRouter(<RemixedFrom originalPostId="p1" />);
        await settle();
        expect(screen.getByRole('link', { name: 'Day Cream' })).toHaveAttribute('href', '/community/p1');
    });

    it('shows nothing for an original post, or when the original has been deleted', async () => {
        const { container, rerender } = inRouter(<RemixedFrom originalPostId={null} />);
        await settle();
        expect(container).toBeEmptyDOMElement();
        mocks.post = null; // the link was cleared with the original, or it can't be read
        rerender(<MemoryRouter><RemixedFrom originalPostId="p1" /></MemoryRouter>);
        await settle();
        expect(container).toBeEmptyDOMElement();
    });
});

describe('RemixList', () => {
    it('lists the remixes of a recipe with their authors', async () => {
        mocks.remixes = [
            { id: 'r1', title: 'Lighter version', author_name: 'Kim' },
            { id: 'r2', title: 'Vegan version', author_name: null },
        ];
        inRouter(<RemixList postId="p1" />);
        await settle();
        expect(screen.getByRole('heading', { name: /Remixes \(2\)/ })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Lighter version' })).toHaveAttribute('href', '/community/r1');
        expect(screen.getByText(/by Kim/)).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Vegan version' })).toBeInTheDocument();
    });

    it('is not shown when there are no remixes, or they could not be loaded', async () => {
        const { container } = inRouter(<RemixList postId="p1" />);
        await settle();
        expect(container).toBeEmptyDOMElement();
        cleanup();
        mocks.error = { message: 'boom' };
        const failed = inRouter(<RemixList postId="p1" />);
        await settle();
        expect(failed.container).toBeEmptyDOMElement();
    });
});
