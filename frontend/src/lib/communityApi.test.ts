import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    addComment, addVersion, createPost, deleteComment, deletePost, editPost, fetchCommunityRecipes, fetchPosts, fetchRatingScores, fetchRecipePreviews, fetchSharedCount,
    fetchUnreadNotifications, isModerator, listMutes, listOpenReports, markNotificationRead, muteMember, rateRecipe, removeRating, reportContent, resolveReport, setAnswered, unmuteMember,
} from './communityApi';
import { communityErrorMessage } from './communityLimits';

const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('./apiClient', async (importOriginal) => ({ ...(await importOriginal<typeof import('./apiClient')>()), request: mocks.request }));
vi.mock('./api', () => ({ API_BASE_URL: 'http://api.test' }));

const calls = () => mocks.request.mock.calls.map(([path, init]) => ({ path: path as string, method: (init?.method ?? 'GET') as string, body: init?.body as Record<string, unknown> | undefined }));

beforeEach(() => { mocks.request.mockReset().mockResolvedValue(undefined); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('posts', () => {
    it('lists all posts, or only the kinds asked for', async () => {
        await fetchPosts();
        await fetchPosts(['advice', 'request']);
        expect(calls().map(c => c.path)).toEqual(['/api/v1/community/posts', '/api/v1/community/posts?types=advice,request']);
    });

    it('sends a new post without saying who is writing it', async () => {
        await createPost({ title: 'Hi', post_type: 'discussion' });
        expect(calls()[0]).toMatchObject({ path: '/api/v1/community/posts', method: 'POST', body: { title: 'Hi', post_type: 'discussion' } });
        expect(calls()[0].body).not.toHaveProperty('author_id');
    });

    it('edits only what is given, trimming the text', async () => {
        await editPost('p1', { title: '  New  ' });
        await editPost('p1', { sources: null });
        expect(calls()[0]).toMatchObject({ path: '/api/v1/community/posts/p1', method: 'PATCH', body: { title: 'New' } });
        expect(calls()[1].body).toEqual({ sources: '' });
    });

    it('marks a post answered with a date, or reopens it', async () => {
        mocks.request.mockResolvedValueOnce({ answered_at: '2026-11-05' }).mockResolvedValueOnce({ answered_at: null });
        expect(await setAnswered('p1', true)).toBe('2026-11-05');
        expect(await setAnswered('p1', false)).toBeNull();
        expect(calls()[0]).toMatchObject({ path: '/api/v1/community/posts/p1/answered', method: 'PUT', body: { answered: true } });
    });

    it('deletes a post, and a comment', async () => {
        await deletePost('p1');
        await deleteComment('c1');
        expect(calls().map(c => [c.method, c.path])).toEqual([['DELETE', '/api/v1/community/posts/p1'], ['DELETE', '/api/v1/community/comments/c1']]);
    });

    it('adds a comment and a recipe version', async () => {
        await addComment('p1', 'Nice');
        await addVersion('p1', [{ id: 'a' }], null);
        expect(calls()[0]).toMatchObject({ path: '/api/v1/community/posts/p1/comments', method: 'POST', body: { body: 'Nice' } });
        expect(calls()[1]).toMatchObject({ path: '/api/v1/community/posts/p1/versions', method: 'POST', body: { formulation_data: [{ id: 'a' }], release_notes: null } });
    });
});

describe('ratings', () => {
    it('rates and un-rates a recipe', async () => {
        await rateRecipe('p1', { version: 1, overall: 5, made_it: true, texture: null, stability: null, ease: null, efficacy: null, skin_type: null, review: null });
        await removeRating('p1');
        expect(calls().map(c => [c.method, c.path])).toEqual([['PUT', '/api/v1/community/posts/p1/rating'], ['DELETE', '/api/v1/community/posts/p1/rating']]);
    });

    it('asks for many scores in requests of at most 200 recipes', async () => {
        mocks.request.mockImplementation((_p, init) => Promise.resolve((init.body.post_ids as string[]).map(id => ({ post_id: id, overall: 4, made_it: false }))));
        const ids = Array.from({ length: 450 }, (_, i) => `p${i}`);
        expect(await fetchRatingScores(ids)).toHaveLength(450);
        expect(calls().map(c => (c.body!.post_ids as string[]).length)).toEqual([200, 200, 50]);
    });
});

describe('reading across posts', () => {
    it('reads the number of recipes you shared', async () => {
        mocks.request.mockResolvedValue({ count: 3 });
        expect(await fetchSharedCount()).toBe(3);
    });

    it('asks for other members recipes up to a limit', async () => {
        await fetchCommunityRecipes(50);
        expect(calls()[0].path).toBe('/api/v1/community/recipes?limit=50');
    });
});

describe('recipe previews for the home page', () => {
    it('needs no sign-in, and turns tags into a list whatever comes back', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [
            { id: 'p1', title: 'T', excerpt: 'e', tags: 'oops', development_status: null, created_at: 'now' },
            { id: 'p2', title: 'U', excerpt: 'e', tags: ['a'], development_status: null, created_at: 'now' },
        ] });
        vi.stubGlobal('fetch', fetchMock);
        const previews = await fetchRecipePreviews(2);
        expect(fetchMock).toHaveBeenCalledWith('http://api.test/api/v1/public/recipe-previews?limit=2');
        expect(previews.map(p => p.tags)).toEqual([[], ['a']]);
    });

    it('says so when they cannot be loaded', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
        await expect(fetchRecipePreviews()).rejects.toThrow('Could not load the recipes.');
    });
});

describe('reporting and muting', () => {
    it('sends what was reported and why, trimming the details and leaving them out when empty, without saying who is reporting', async () => {
        await reportContent({ targetType: 'post', targetId: 'p1', reason: 'spam', details: '  bad  ' });
        await reportContent({ targetType: 'comment', targetId: 'c1', reason: 'spam', details: '   ' });
        expect(calls()[0]).toMatchObject({ path: '/api/v1/community/reports', method: 'POST', body: { target_type: 'post', target_id: 'p1', reason: 'spam', details: 'bad' } });
        expect(calls()[0].body).not.toHaveProperty('reporter_id');
        expect(calls()[1].body).toMatchObject({ details: null });
    });

    it('passes on a refusal', async () => {
        mocks.request.mockRejectedValue(new Error('You have already reported this.'));
        await expect(reportContent({ targetType: 'post', targetId: 'p1', reason: 'spam' })).rejects.toThrow('already reported');
    });

    it('lists, adds and removes muted members', async () => {
        mocks.request.mockResolvedValueOnce(['u2']);
        expect(await listMutes()).toEqual(['u2']);
        await muteMember('u3');
        await unmuteMember('u3');
        expect(calls().map(c => [c.method, c.path])).toEqual([['GET', '/api/v1/community/mutes'], ['PUT', '/api/v1/community/mutes/u3'], ['DELETE', '/api/v1/community/mutes/u3']]);
    });
});

describe('moderation', () => {
    it('asks the backend whether you are a moderator, and says no on any trouble', async () => {
        mocks.request.mockResolvedValueOnce({ moderator: true });
        expect(await isModerator()).toBe(true);
        mocks.request.mockResolvedValueOnce({ moderator: false });
        expect(await isModerator()).toBe(false);
        mocks.request.mockRejectedValueOnce(new Error('down'));
        expect(await isModerator()).toBe(false);
    });

    it('lists open reports', async () => {
        mocks.request.mockResolvedValue([{ id: 'r1' }]);
        expect(await listOpenReports()).toEqual([{ id: 'r1' }]);
        expect(calls()[0].path).toBe('/api/v1/community/reports/open');
    });

    it('closes a report, and removes what was reported when asked', async () => {
        const report = { id: 'r1' } as never;
        await resolveReport(report, 'resolved', true);
        await resolveReport(report, 'dismissed', false);
        expect(calls()[0]).toMatchObject({ path: '/api/v1/community/reports/r1/resolve', method: 'POST', body: { outcome: 'resolved', remove: true } });
        expect(calls()[1].body).toEqual({ outcome: 'dismissed', remove: false });
    });
});

describe('notifications', () => {
    it('lists unread ones and marks one read', async () => {
        await fetchUnreadNotifications();
        await markNotificationRead('n1');
        expect(calls().map(c => [c.method, c.path])).toEqual([['GET', '/api/v1/notifications'], ['PUT', '/api/v1/notifications/n1/read']]);
    });
});

describe('friendly wording for what is refused', () => {
    it.each([
        ['You are posting too quickly. Please wait a little and try again.', /posting too quickly/],
        ['new row for relation "community_posts" violates check constraint "community_posts_title_length"', /Titles can be up to 150/],
        ['violates check constraint "community_posts_write_up_length"', /10,000/],
        ['violates check constraint "post_comments_body_length"', /Comments can be up to 2,000/],
        ['violates check constraint "community_posts_sources_length"', /Sources can be up to 2,000/],
        ['duplicate key value violates unique constraint "content_reports_reporter_id_target_type_target_id_key"', /already reported/],
        ['new row violates row-level security policy for table "community_posts"', /not allowed/],
        ['something unexpected', /something unexpected/],
    ])('%s', (message, expected) => {
        expect(communityErrorMessage({ message })).toMatch(expected);
    });

    it('copes with an error that is not an object', () => {
        expect(communityErrorMessage(undefined)).toBe('Something went wrong.');
        expect(communityErrorMessage('plain text')).toBe('plain text');
    });
});
