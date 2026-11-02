import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CommunityFeed from './CommunityFeed';

const mocks = vi.hoisted(() => ({
    posts: [] as Record<string, unknown>[],
    ratings: [] as Record<string, unknown>[],
    ratingsError: null as unknown,
    ratingRequests: [] as string[][],
}));

vi.mock('../components/NewPostModal', () => ({ default: () => null }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: null, session: null, username: null, isLoading: false }) }));
vi.mock('../contexts/SettingsContext', () => ({
    useSettings: () => ({ currency: '$', setCurrency: vi.fn(), dateFormat: 'en-US', setDateFormat: vi.fn(), warningDays: 30, setWarningDays: vi.fn(), formatDate: (d: string) => d }),
}));
vi.mock('../lib/supabase', () => {
    const builder = (table: string) => {
        const b: Record<string, unknown> = {};
        for (const m of ['select', 'eq', 'order']) b[m] = () => b;
        b.in = (_column: string, ids: string[]) => { mocks.ratingRequests.push(ids); return b; };
        b.then = (resolve: (v: unknown) => void) => {
            if (table === 'community_posts') return resolve({ data: mocks.posts, error: null });
            if (table === 'recipe_ratings') return resolve(mocks.ratingsError ? { data: null, error: mocks.ratingsError } : { data: mocks.ratings, error: null });
            return resolve({ data: [], error: null });
        };
        return b;
    };
    return { supabase: { auth: { signOut: vi.fn() }, from: (t: string) => builder(t), channel: vi.fn(), removeChannel: vi.fn() } };
});

const post = (id: string, title: string, type: string, day: number) => ({
    id, title, write_up: `About ${title}`, tags: [], post_type: type, development_status: null, author_id: 'a', created_at: `2026-10-${String(day).padStart(2, '0')}T10:00:00Z`,
});
const rate = (postId: string, overall: number, madeIt = false) => ({ post_id: postId, overall, made_it: madeIt });

async function openFeed() {
    render(<MemoryRouter><CommunityFeed /></MemoryRouter>);
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });
}

const titles = () => screen.getAllByRole('heading', { level: 3 }).map(h => h.textContent);

beforeEach(() => {
    mocks.ratingsError = null;
    mocks.ratingRequests = [];
    mocks.posts = [
        post('r-new', 'Newest Recipe', 'formulation', 20),
        post('r-top', 'Beloved Recipe', 'formulation', 5),
        post('r-mid', 'Okay Recipe', 'formulation', 10),
        post('d1', 'A Discussion', 'discussion', 25),
    ];
    mocks.ratings = [
        ...Array.from({ length: 10 }, (_, i) => rate('r-top', 5, i < 6)),
        ...[4, 4, 4].map((v, i) => rate('r-mid', v, i === 0)),
    ];
});
afterEach(cleanup);

describe('Community feed ratings', () => {
    it('shows the average, the number of ratings and how many made it on recipe cards', async () => {
        await openFeed();
        expect(screen.getByLabelText('Rated 5.0 out of 5 by 10 people, 6 made it')).toBeInTheDocument();
        expect(screen.getByLabelText('Rated 4.0 out of 5 by 3 people, 1 made it')).toBeInTheDocument();
        expect(screen.getByText('✓ 6 made it')).toBeInTheDocument();
    });

    it('says "Not rated yet" on an unrated recipe, and shows no rating at all on other kinds of post', async () => {
        await openFeed();
        const newest = screen.getByRole('link', { name: /Newest Recipe/ });
        expect(within(newest).getByText('Not rated yet')).toBeInTheDocument();
        const discussion = screen.getByRole('link', { name: /A Discussion/ });
        expect(within(discussion).queryByText('Not rated yet')).not.toBeInTheDocument();
        expect(discussion.querySelector('[aria-label^="Rated"]')).toBeNull();
    });

    it('uses the singular for a single rating', async () => {
        mocks.ratings = [rate('r-mid', 5, true)];
        await openFeed();
        expect(screen.getByLabelText('Rated 5.0 out of 5 by 1 person, 1 made it')).toBeInTheDocument();
    });

    it('asks for ratings of recipes only, in one request', async () => {
        await openFeed();
        expect(mocks.ratingRequests).toHaveLength(1);
        expect(mocks.ratingRequests[0].sort()).toEqual(['r-mid', 'r-new', 'r-top']);
    });

    it('splits very long lists into several short requests', async () => {
        mocks.posts = Array.from({ length: 230 }, (_, i) => post(`p${i}`, `Recipe ${i}`, 'formulation', 1 + (i % 28)));
        mocks.ratings = [];
        await openFeed();
        expect(mocks.ratingRequests.map(r => r.length)).toEqual([100, 100, 30]);
    });
});

describe('Community feed sorting', () => {
    it('starts newest first', async () => {
        await openFeed();
        expect(titles()).toEqual(['A Discussion', 'Newest Recipe', 'Okay Recipe', 'Beloved Recipe']);
    });

    it('top rated puts the best-rated recipes first and unrated ones last', async () => {
        await openFeed();
        fireEvent.change(screen.getByLabelText('Sort posts'), { target: { value: 'top' } });
        expect(titles()).toEqual(['Beloved Recipe', 'Okay Recipe', 'A Discussion', 'Newest Recipe']);
    });

    it('most made puts the recipes people actually made first', async () => {
        await openFeed();
        fireEvent.change(screen.getByLabelText('Sort posts'), { target: { value: 'made' } });
        expect(titles().slice(0, 2)).toEqual(['Beloved Recipe', 'Okay Recipe']);
    });

    it('keeps the sort when you search', async () => {
        await openFeed();
        fireEvent.change(screen.getByLabelText('Sort posts'), { target: { value: 'top' } });
        fireEvent.change(screen.getByPlaceholderText(/Search topics/), { target: { value: 'recipe' } });
        expect(titles()).toEqual(['Beloved Recipe', 'Okay Recipe', 'Newest Recipe']);
    });
});

describe('Community feed without ratings', () => {
    it('still shows every post if the ratings cannot be loaded', async () => {
        mocks.ratingsError = { message: 'permission denied' };
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        await openFeed();
        expect(titles()).toHaveLength(4);
        expect(screen.getAllByText('Not rated yet')).toHaveLength(3);
        spy.mockRestore();
    });
});
