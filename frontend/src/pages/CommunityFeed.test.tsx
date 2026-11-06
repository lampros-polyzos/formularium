import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CommunityFeed from './CommunityFeed';

const mocks = vi.hoisted(() => ({
    posts: [] as Record<string, unknown>[],
    ratings: [] as Record<string, unknown>[],
    ratingsError: null as Error | null,
    ratingRequests: [] as string[][],
    typeFilters: [] as string[][],
}));

vi.mock('../components/NewPostModal', () => ({ default: () => null }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: null, session: null, username: null, isLoading: false }) }));
vi.mock('../contexts/SettingsContext', () => ({
    useSettings: () => ({ currency: '$', setCurrency: vi.fn(), dateFormat: 'en-US', setDateFormat: vi.fn(), warningDays: 30, setWarningDays: vi.fn(), formatDate: (d: string) => d }),
}));
vi.mock('../lib/communityApi', () => ({
    fetchPosts: (types?: string[]) => {
        if (types) mocks.typeFilters.push(types);
        return Promise.resolve(types ? mocks.posts.filter(p => types.includes(p.post_type as string)) : mocks.posts);
    },
    fetchRatingScores: (ids: string[]) => {
        mocks.ratingRequests.push(ids);
        return mocks.ratingsError ? Promise.reject(mocks.ratingsError) : Promise.resolve(mocks.ratings);
    },
}));

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
    mocks.typeFilters = [];
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
        mocks.ratingsError = new Error('permission denied');
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        await openFeed();
        expect(titles()).toHaveLength(4);
        expect(screen.getAllByText('Not rated yet')).toHaveLength(3);
        spy.mockRestore();
    });
});

describe('Community feed post types', () => {
    const tabs = () => within(screen.getByRole('button', { name: 'All' }).parentElement!).getAllByRole('button').map(b => b.textContent);

    beforeEach(() => {
        mocks.posts = [
            post('d1', 'A Discussion', 'discussion', 20),
            post('a1', 'How do I thicken a toner?', 'advice', 19),
            post('a2', 'An old question', 'request', 18), // still has the old name until the database is updated
            post('i1', 'Why pH matters', 'information', 17),
            post('i2', 'An old tip', 'education', 16),
            post('r1', 'A Recipe', 'formulation', 15),
        ];
    });

    it('has the tabs All, Recipe, Discussion, Advice and Information', async () => {
        await openFeed();
        expect(tabs()).toEqual(['All', 'Recipe', 'Discussion', 'Advice', 'Information']);
        expect(screen.queryByRole('button', { name: 'Request' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Education' })).not.toBeInTheDocument();
    });

    it('labels posts with the new names, including posts that still have an old one', async () => {
        await openFeed();
        const label = (title: string) => screen.getByRole('link', { name: new RegExp(title) }).textContent ?? '';
        expect(label('How do I thicken')).toContain('Advice');
        expect(label('An old question')).toContain('Advice');
        expect(label('Why pH matters')).toContain('Information');
        expect(label('An old tip')).toContain('Information');
        expect(screen.queryByText('Request')).not.toBeInTheDocument();
        expect(screen.queryByText('Education')).not.toBeInTheDocument();
    });

    it('the Advice tab finds new and old advice posts, and asks for both names', async () => {
        await openFeed();
        fireEvent.click(screen.getByRole('button', { name: 'Advice' }));
        await act(async () => { await Promise.resolve(); });
        expect(mocks.typeFilters.at(-1)).toEqual(['advice', 'request']);
        expect(titles()).toEqual(['How do I thicken a toner?', 'An old question']);
    });

    it('the Information tab finds new and old information posts', async () => {
        await openFeed();
        fireEvent.click(screen.getByRole('button', { name: 'Information' }));
        await act(async () => { await Promise.resolve(); });
        expect(mocks.typeFilters.at(-1)).toEqual(['information', 'education']);
        expect(titles()).toEqual(['Why pH matters', 'An old tip']);
    });

    it('shows which tab is chosen', async () => {
        await openFeed();
        expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
        fireEvent.click(screen.getByRole('button', { name: 'Advice' }));
        expect(screen.getByRole('button', { name: 'Advice' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false');
    });

    it('keeps recipes and discussions on the names they always had', async () => {
        await openFeed();
        fireEvent.click(screen.getByRole('button', { name: 'Discussion' }));
        await act(async () => { await Promise.resolve(); });
        expect(mocks.typeFilters.at(-1)).toEqual(['discussion']);
        fireEvent.click(screen.getByRole('button', { name: 'Recipe' }));
        await act(async () => { await Promise.resolve(); });
        expect(mocks.typeFilters.at(-1)).toEqual(['formulation']);
    });
});
