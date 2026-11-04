import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CommunityFeed from './CommunityFeed';

const mocks = vi.hoisted(() => ({
    posts: [] as Record<string, unknown>[],
    muted: [] as string[],
    moderator: false,
    unmute: vi.fn(),
}));

vi.mock('../components/NewPostModal', () => ({ default: () => null }));
vi.mock('../components/Header', () => ({ default: () => null }));
vi.mock('../hooks/useCommunityMutes', () => ({ useCommunityMutes: () => ({ muted: mocks.muted, mute: vi.fn(), unmute: mocks.unmute }) }));
vi.mock('../hooks/useIsModerator', () => ({ useIsModerator: () => mocks.moderator }));
vi.mock('../lib/supabase', () => {
    const builder = () => {
        const b: Record<string, unknown> = {};
        for (const m of ['select', 'eq', 'order', 'in']) b[m] = () => b;
        b.then = (resolve: (v: unknown) => void) => resolve({ data: mocks.posts, error: null });
        return b;
    };
    return { supabase: { auth: { signOut: vi.fn() }, from: builder, channel: vi.fn(), removeChannel: vi.fn() } };
});

const post = (id: string, title: string, author: string, over: Record<string, unknown> = {}) => ({
    id, title, write_up: `About ${title}`, tags: [], post_type: 'advice', development_status: null, author_id: author, author_name: `Name of ${author}`, created_at: '2026-10-10T10:00:00Z', ...over,
});

async function openFeed() {
    render(<MemoryRouter><CommunityFeed /></MemoryRouter>);
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });
}

beforeEach(() => {
    mocks.muted = [];
    mocks.moderator = false;
    mocks.unmute.mockReset().mockResolvedValue(undefined);
    mocks.posts = [post('p1', 'From Kim', 'kim'), post('p2', 'From Lee', 'lee', { answered_at: '2026-10-11' }), post('p3', 'Old style', 'lee', { post_type: 'request', answered_at: '2026-10-11' })];
});
afterEach(cleanup);

describe('the community feed and safety', () => {
    it('hides posts by muted members, and lists who is muted so they can be unmuted', async () => {
        mocks.muted = ['kim'];
        await openFeed();
        expect(screen.queryByText('From Kim')).not.toBeInTheDocument();
        expect(screen.getByText('From Lee')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Muted members (1)' }));
        expect(screen.getByText('Name of kim')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Unmute' }));
        expect(mocks.unmute).toHaveBeenCalledWith('kim');
    });

    it('has no muted members panel when nobody is muted', async () => {
        await openFeed();
        expect(screen.queryByRole('button', { name: /Muted members/ })).not.toBeInTheDocument();
        expect(screen.getByText('From Kim')).toBeInTheDocument();
    });

    it('marks answered advice, including posts still stored under the old name', async () => {
        await openFeed();
        expect(screen.getAllByText('✓ Answered')).toHaveLength(2);
    });

    it('links moderators, and only moderators, to the moderation page', async () => {
        await openFeed();
        expect(screen.queryByRole('link', { name: 'Moderation' })).not.toBeInTheDocument();
        cleanup();
        mocks.moderator = true;
        await openFeed();
        expect(screen.getByRole('link', { name: 'Moderation' })).toHaveAttribute('href', '/community/moderation');
    });
});
