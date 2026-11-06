import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PostDetail from './PostDetail';
import { DialogProvider } from '../contexts/DialogContext';

// The safety side of a community post: telling members it is not professional advice, reporting, muting, editing,
// marking advice as answered, removing comments, and no longer sending notifications from the browser.

const mocks = vi.hoisted(() => ({
    user: { id: 'me' } as { id: string } | null,
    moderator: false,
    muted: [] as string[],
    post: {} as Record<string, unknown>,
    comments: [] as Record<string, unknown>[],
    api: {
        setAnswered: vi.fn(), deleteComment: vi.fn(), reportContent: vi.fn(), editPost: vi.fn(), addComment: vi.fn(), deletePost: vi.fn(),
        fetchPost: vi.fn(), fetchComments: vi.fn(), fetchVersions: vi.fn(), fetchRemixes: vi.fn(),
    },
    mute: vi.fn(),
}));

vi.mock('../lib/communityApi', () => mocks.api);
vi.mock('../hooks/useCommunityMutes', () => ({ useCommunityMutes: () => ({ muted: mocks.muted, mute: mocks.mute, unmute: vi.fn() }) }));
vi.mock('../hooks/useIsModerator', () => ({ useIsModerator: () => mocks.moderator }));
vi.mock('../components/RecipeRatings', () => ({ default: () => null }));
vi.mock('../components/Header', () => ({ default: ({ title }: { title: string }) => <h2>{title}</h2> }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: mocks.user, session: null, username: 'Me', isLoading: false }) }));
vi.mock('../contexts/SettingsContext', () => ({ useSettings: () => ({ formatDate: (d: string) => d }) }));

const post = (over: Record<string, unknown> = {}) => ({
    id: 'p1', title: 'My question', post_type: 'advice', author_id: 'author', author_name: 'Kim', write_up: 'Hello', created_at: '2026-11-02', ...over,
});
const comment = (over: Record<string, unknown> = {}) => ({ id: 'c1', author_id: 'other', author_name: 'Lee', body: 'Try this', created_at: '2026-11-03', ...over });
const settle = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });
const open = async () => {
    render(
        <MemoryRouter initialEntries={['/community/p1']}>
            <DialogProvider>
                <Routes>
                    <Route path="/community/:id" element={<PostDetail />} />
                    <Route path="/community" element={<p>THE HUB</p>} />
                </Routes>
            </DialogProvider>
        </MemoryRouter>
    );
    await settle();
};
const dialog = () => screen.queryByRole('dialog') ?? screen.getByRole('alertdialog');

beforeEach(() => {
    mocks.user = { id: 'me' };
    mocks.moderator = false;
    mocks.muted = [];
    mocks.post = post();
    mocks.comments = [];
    mocks.api.fetchPost.mockReset().mockImplementation(() => Promise.resolve(mocks.post));
    mocks.api.fetchComments.mockReset().mockImplementation(() => Promise.resolve(mocks.comments));
    mocks.api.fetchVersions.mockReset().mockResolvedValue([]);
    mocks.api.fetchRemixes.mockReset().mockResolvedValue([]);
    mocks.api.addComment.mockReset().mockResolvedValue({ id: 'new', author_id: 'me', author_name: 'Me', body: 'hi', created_at: '2026-11-03' });
    mocks.mute.mockReset().mockResolvedValue(undefined);
    mocks.api.setAnswered.mockReset().mockResolvedValue('2026-11-04T00:00:00Z');
    mocks.api.deleteComment.mockReset().mockResolvedValue(undefined);
    mocks.api.reportContent.mockReset().mockResolvedValue(undefined);
    mocks.api.editPost.mockReset().mockResolvedValue(undefined);
});
afterEach(cleanup);

describe('the safety reminder', () => {
    it.each(['advice', 'request', 'information', 'education'])('is shown on a %s post', async (type) => {
        mocks.post = post({ post_type: type });
        await open();
        expect(screen.getByRole('note')).toHaveTextContent(/not professional advice.*Patch test.*preserved/i);
    });

    it.each(['discussion', 'formulation'])('is not shown on a %s post', async (type) => {
        mocks.post = post({ post_type: type });
        await open();
        expect(screen.queryByRole('note')).not.toBeInTheDocument();
    });
});

describe('information posts', () => {
    it('show their sources and whether they were edited', async () => {
        mocks.post = post({ post_type: 'information', sources: 'Handbook of Cosmetic Science', edited_at: '2026-11-03' });
        await open();
        expect(screen.getByText('Sources')).toBeInTheDocument();
        expect(screen.getByText('Handbook of Cosmetic Science')).toBeInTheDocument();
        expect(screen.getByText('edited')).toBeInTheDocument();
    });

    it('show no sources section when there are none', async () => {
        mocks.post = post({ post_type: 'information' });
        await open();
        expect(screen.queryByText('Sources')).not.toBeInTheDocument();
        expect(screen.queryByText('edited')).not.toBeInTheDocument();
    });
});

describe('reporting and muting', () => {
    it('lets you report someone else\'s post, and thanks you', async () => {
        await open();
        fireEvent.click(screen.getByRole('button', { name: 'Report' }));
        fireEvent.click(screen.getByLabelText('Spam or advertising'));
        fireEvent.click(screen.getByRole('button', { name: 'Send report' }));
        await waitFor(() => expect(mocks.api.reportContent).toHaveBeenCalledWith({ targetType: 'post', targetId: 'p1', reason: 'spam', details: '' }));
        expect(await screen.findByText('Report sent')).toBeInTheDocument();
        expect(dialog()).toHaveTextContent('A moderator will take a look.');
    });

    it('lets you report a comment', async () => {
        mocks.comments = [comment()];
        await open();
        fireEvent.click(within(screen.getByText('Try this').closest('div.flex-1')!).getByRole('button', { name: 'Report' }));
        fireEvent.click(screen.getByLabelText('Harassment or abuse'));
        fireEvent.click(screen.getByRole('button', { name: 'Send report' }));
        await waitFor(() => expect(mocks.api.reportContent).toHaveBeenCalledWith(expect.objectContaining({ targetType: 'comment', targetId: 'c1', reason: 'harassment' })));
    });

    it('does not offer to report or mute yourself', async () => {
        mocks.user = { id: 'author' };
        await open();
        expect(screen.queryByRole('button', { name: 'Report' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Mute author' })).not.toBeInTheDocument();
    });

    it('does not offer reporting when signed out', async () => {
        mocks.user = null;
        await open();
        expect(screen.queryByRole('button', { name: 'Report' })).not.toBeInTheDocument();
    });

    it('asks before muting an author, then mutes them', async () => {
        await open();
        fireEvent.click(screen.getByRole('button', { name: 'Mute author' }));
        expect(dialog()).toHaveTextContent("You won't see posts or comments from Kim any more.");
        expect(mocks.mute).not.toHaveBeenCalled();
        fireEvent.click(within(dialog()).getByRole('button', { name: 'Mute' }));
        await waitFor(() => expect(mocks.mute).toHaveBeenCalledWith('author'));
    });

    it('hides comments from muted members and says how many', async () => {
        mocks.muted = ['other'];
        mocks.comments = [comment(), comment({ id: 'c2', author_id: 'third', author_name: 'Jo', body: 'Fine by me' })];
        await open();
        expect(screen.queryByText('Try this')).not.toBeInTheDocument();
        expect(screen.getByText('Fine by me')).toBeInTheDocument();
        expect(screen.getByText('1 comment from muted members hidden.')).toBeInTheDocument();
        expect(screen.getByText('Discussion (1)')).toBeInTheDocument();
    });
});

describe('your own post', () => {
    beforeEach(() => { mocks.user = { id: 'author' }; });

    it('can be marked as answered, and shows it', async () => {
        await open();
        fireEvent.click(screen.getByRole('button', { name: 'Mark as answered' }));
        await waitFor(() => expect(mocks.api.setAnswered).toHaveBeenCalledWith('p1', true));
        expect(await screen.findByText('✓ Answered')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Reopen' })).toBeInTheDocument();
    });

    it('can be reopened', async () => {
        mocks.post = post({ answered_at: '2026-11-03' });
        mocks.api.setAnswered.mockResolvedValue(null);
        await open();
        fireEvent.click(screen.getByRole('button', { name: 'Reopen' }));
        await waitFor(() => expect(mocks.api.setAnswered).toHaveBeenCalledWith('p1', false));
        await waitFor(() => expect(screen.queryByText('✓ Answered')).not.toBeInTheDocument());
    });

    it('is not offered "answered" unless it is an advice post', async () => {
        mocks.post = post({ post_type: 'discussion' });
        await open();
        expect(screen.queryByRole('button', { name: 'Mark as answered' })).not.toBeInTheDocument();
    });

    it('can be edited, and then says it was edited', async () => {
        await open();
        fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
        fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Better question' } });
        fireEvent.submit(document.getElementById('edit-post-form')!);
        await waitFor(() => expect(mocks.api.editPost).toHaveBeenCalledWith('p1', { title: 'Better question', write_up: 'Hello' }));
        expect(await screen.findByRole('heading', { name: 'Better question' })).toBeInTheDocument();
        expect(screen.getByText('edited')).toBeInTheDocument();
    });

    it('cannot be edited when it is a recipe (those are published from the Studio)', async () => {
        mocks.post = post({ post_type: 'formulation' });
        await open();
        expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    });
});

describe('someone else\'s post', () => {
    it('cannot be edited or marked as answered by you', async () => {
        await open();
        expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Mark as answered' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Delete Post|Remove \(moderator\)/ })).not.toBeInTheDocument();
    });

    it('can be removed by a moderator, labelled as such', async () => {
        mocks.moderator = true;
        await open();
        expect(screen.getByRole('button', { name: 'Remove (moderator)' })).toBeInTheDocument();
    });
});

describe('comments', () => {
    it('can be deleted by their author after asking', async () => {
        mocks.comments = [comment({ author_id: 'me', body: 'Mine' })];
        await open();
        fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
        expect(mocks.api.deleteComment).not.toHaveBeenCalled();
        fireEvent.click(within(dialog()).getByRole('button', { name: 'Delete comment' }));
        await waitFor(() => expect(mocks.api.deleteComment).toHaveBeenCalledWith('c1'));
        await waitFor(() => expect(screen.queryByText('Mine')).not.toBeInTheDocument());
    });

    it('cannot be deleted by other members, but can be removed by a moderator', async () => {
        mocks.comments = [comment()];
        await open();
        expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Remove (moderator)' })).not.toBeInTheDocument();
        cleanup();
        mocks.moderator = true;
        await open();
        expect(screen.getAllByRole('button', { name: 'Remove (moderator)' }).length).toBeGreaterThan(0);
    });

    it('are limited in length, with a counter', async () => {
        await open();
        const box = screen.getByPlaceholderText('Add to the discussion...');
        expect(box).toHaveAttribute('maxlength', '2000');
        fireEvent.change(box, { target: { value: 'hello' } });
        expect(screen.getByText('5/2,000')).toBeInTheDocument();
    });

    it('are sent to the backend, which also notifies the author (the browser sends no notification)', async () => {
        await open();
        fireEvent.change(screen.getByPlaceholderText('Add to the discussion...'), { target: { value: 'A helpful reply' } });
        fireEvent.click(screen.getByRole('button', { name: 'Post Comment' }));
        await waitFor(() => expect(mocks.api.addComment).toHaveBeenCalledWith('p1', 'A helpful reply'));
    });
});
