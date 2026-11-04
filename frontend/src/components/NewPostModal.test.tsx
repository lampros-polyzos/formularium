import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import NewPostModal from './NewPostModal';

const mocks = vi.hoisted(() => ({
    inserted: [] as Record<string, unknown>[],
    error: null as { message: string } | null,
}));

vi.mock('../lib/supabase', () => ({
    supabase: {
        from: () => ({
            insert: (rows: Record<string, unknown>[]) => { mocks.inserted.push(rows[0]); return Promise.resolve({ error: mocks.error }); },
        }),
    },
}));
const AUTH = vi.hoisted(() => ({ user: { id: 'u1' }, username: 'Sam' }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => AUTH }));

const onSuccess = vi.fn();
const onClose = vi.fn();
const renderModal = () => render(<MemoryRouter><NewPostModal isOpen onClose={onClose} onSuccess={onSuccess} /></MemoryRouter>);
const typeButton = (name: RegExp) => screen.getByRole('button', { name });
const fill = () => {
    fireEvent.change(screen.getByPlaceholderText(/Best emulsifier/), { target: { value: 'A title' } });
    fireEvent.change(screen.getByPlaceholderText(/Explain your question/), { target: { value: 'Some text' } });
};
const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Post to Community' }));

beforeEach(() => { mocks.inserted = []; mocks.error = null; onSuccess.mockReset(); onClose.mockReset(); });
afterEach(cleanup);

describe('choosing what to post', () => {
    it('offers discussion, advice, information and recipe, each with what it is for', () => {
        renderModal();
        const kinds = screen.getAllByRole('button', { pressed: false }).concat(screen.getAllByRole('button', { pressed: true }));
        const text = kinds.map(b => b.textContent ?? '').join(' | ');
        for (const [label, hint] of [['Discussion', 'Start a conversation'], ['Advice', 'Ask for advice'], ['Information', 'Share useful information'], ['Recipe', 'Share a formula']]) {
            expect(text, label).toContain(label);
            expect(text, hint).toContain(hint);
        }
    });

    it('no longer offers a request or an education post', () => {
        renderModal();
        expect(screen.queryByRole('button', { name: /^.{0,3}\s*Request/ })).not.toBeInTheDocument();
        expect(screen.queryByText('Education')).not.toBeInTheDocument();
        expect(screen.queryByText('Request')).not.toBeInTheDocument();
    });

    it('starts on discussion, and shows which kind is chosen', () => {
        renderModal();
        expect(typeButton(/Discussion/)).toHaveAttribute('aria-pressed', 'true');
        fireEvent.click(typeButton(/Advice/));
        expect(typeButton(/Advice/)).toHaveAttribute('aria-pressed', 'true');
        expect(typeButton(/Discussion/)).toHaveAttribute('aria-pressed', 'false');
    });
});

describe('sending a post', () => {
    it.each([
        [/Discussion/, 'discussion'],
        [/Advice/, 'advice'],
        [/Information/, 'information'],
    ] as const)('sends %s as the kind "%s"', async (button, kind) => {
        renderModal();
        fireEvent.click(typeButton(button));
        fill();
        submit();
        await waitFor(() => expect(mocks.inserted).toHaveLength(1));
        expect(mocks.inserted[0]).toMatchObject({ post_type: kind, title: 'A title', write_up: 'Some text', author_id: 'u1', author_name: 'Sam' });
        expect(onSuccess).toHaveBeenCalled();
    });

    it('never sends the old names', async () => {
        for (const button of [/Advice/, /Information/]) {
            renderModal();
            fireEvent.click(typeButton(button));
            fill();
            submit();
            await waitFor(() => expect(mocks.inserted.length).toBeGreaterThan(0));
            cleanup();
        }
        for (const row of mocks.inserted) expect(['request', 'education']).not.toContain(row.post_type);
    });

    it('asks for a title and text first', () => {
        renderModal();
        fireEvent.submit(document.getElementById('new-post-form')!); // past the browser's own required-field check
        expect(within(document.body).getByText('Title and description are required.')).toBeInTheDocument();
        expect(mocks.inserted).toHaveLength(0);
    });

    it('shows what went wrong when the post cannot be saved', async () => {
        mocks.error = { message: 'new row violates check constraint "community_posts_post_type_check"' };
        renderModal();
        fireEvent.click(typeButton(/Advice/));
        fill();
        submit();
        expect(await screen.findByText(/check constraint/)).toBeInTheDocument();
        expect(onSuccess).not.toHaveBeenCalled();
    });
});
