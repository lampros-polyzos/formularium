import { describe, expect, it } from 'vitest';
import { deleteComment, editPost, fetchRecipePreviews, isModerator, listMutes, listOpenReports, muteMember, reportContent, resolveReport, setAnswered, unmuteMember, type Report } from './communityApi';
import { communityErrorMessage } from './communityLimits';

type Call = { table?: string; rpc?: string; args?: unknown; op?: string; payload?: unknown; filters: [string, unknown][] };

/** A stand-in for the database client that records what it was asked and answers with the given result. */
function fakeClient(result: { data?: unknown; error?: { message: string } | null } = {}) {
    const calls: Call[] = [];
    const answer = () => ({ data: result.data ?? null, error: result.error ?? null });
    const client = {
        from: (table: string) => {
            const call: Call = { table, filters: [] };
            calls.push(call);
            const b: Record<string, unknown> = {};
            for (const op of ['insert', 'update', 'delete', 'select']) b[op] = (payload?: unknown) => { call.op = op; call.payload = payload; return b; };
            b.eq = (column: string, value: unknown) => { call.filters.push([column, value]); return b; };
            b.order = () => b;
            b.then = (resolve: (v: unknown) => void) => resolve(answer());
            return b;
        },
        rpc: (name: string, args?: unknown) => { calls.push({ rpc: name, args, filters: [] }); return Promise.resolve(answer()); },
    };
    return { client: client as never, calls };
}

const report = (over: Partial<Report> = {}): Report => ({ id: 'r1', target_type: 'post', target_id: 'p1', post_id: 'p1', target_author_id: 'a', snapshot: 'x', reason: 'spam', details: null, status: 'open', created_at: '2026-11-01', ...over });

describe('reporting', () => {
    it('sends what was reported and why, trimming the details and leaving them out when empty', async () => {
        const { client, calls } = fakeClient();
        await reportContent({ targetType: 'comment', targetId: 'c1', reason: 'spam', details: '  buy now  ' }, client);
        await reportContent({ targetType: 'post', targetId: 'p1', reason: 'other', details: '   ' }, client);
        expect(calls[0]).toMatchObject({ table: 'content_reports', op: 'insert', payload: [{ target_type: 'comment', target_id: 'c1', reason: 'spam', details: 'buy now' }] });
        expect((calls[1].payload as { details: unknown }[])[0].details).toBeNull();
    });

    it('does not send who is reporting (the database knows)', async () => {
        const { client, calls } = fakeClient();
        await reportContent({ targetType: 'post', targetId: 'p1', reason: 'spam' }, client);
        expect(Object.keys((calls[0].payload as object[])[0])).not.toContain('reporter_id');
    });

    it('passes on a refusal', async () => {
        const { client } = fakeClient({ error: { message: 'You cannot report your own content.' } });
        await expect(reportContent({ targetType: 'post', targetId: 'p1', reason: 'spam' }, client)).rejects.toMatchObject({ message: 'You cannot report your own content.' });
    });
});

describe('your own posts and comments', () => {
    it('edits the title and text, and only touches sources when given', async () => {
        const { client, calls } = fakeClient();
        await editPost('p1', { title: ' New ', write_up: ' Text ' }, client);
        await editPost('p1', { title: 'T', write_up: 'X', sources: '  A book ' }, client);
        await editPost('p1', { title: 'T', write_up: 'X', sources: '  ' }, client);
        expect(calls[0].payload).toEqual({ title: 'New', write_up: 'Text' });
        expect(calls[1].payload).toEqual({ title: 'T', write_up: 'X', sources: 'A book' });
        expect(calls[2].payload).toEqual({ title: 'T', write_up: 'X', sources: null });
        expect(calls[0].filters).toEqual([['id', 'p1']]);
    });

    it('marks a post answered with a date, or reopens it', async () => {
        const { client, calls } = fakeClient();
        const when = await setAnswered('p1', true, client);
        expect(when).toMatch(/^\d{4}-\d\d-\d\dT/);
        expect(calls[0].payload).toEqual({ answered_at: when });
        expect(await setAnswered('p1', false, client)).toBeNull();
        expect(calls[1].payload).toEqual({ answered_at: null });
    });

    it('deletes one comment by id', async () => {
        const { client, calls } = fakeClient();
        await deleteComment('c9', client);
        expect(calls[0]).toMatchObject({ table: 'post_comments', op: 'delete', filters: [['id', 'c9']] });
    });
});

describe('muting', () => {
    it('lists, adds and removes muted members', async () => {
        const list = fakeClient({ data: [{ muted_user_id: 'u1' }, { muted_user_id: 'u2' }] });
        expect(await listMutes(list.client)).toEqual(['u1', 'u2']);
        const { client, calls } = fakeClient();
        await muteMember('u3', client);
        await unmuteMember('u3', client);
        expect(calls[0]).toMatchObject({ table: 'community_mutes', op: 'insert', payload: [{ muted_user_id: 'u3' }] });
        expect(calls[1]).toMatchObject({ op: 'delete', filters: [['muted_user_id', 'u3']] });
    });
});

describe('moderation', () => {
    it('asks the database whether you are a moderator, and says no on any trouble', async () => {
        expect(await isModerator(fakeClient({ data: true }).client)).toBe(true);
        expect(await isModerator(fakeClient({ data: false }).client)).toBe(false);
        expect(await isModerator(fakeClient({ data: true, error: { message: 'nope' } }).client)).toBe(false);
    });

    it('lists open reports', async () => {
        const { client, calls } = fakeClient({ data: [report()] });
        expect(await listOpenReports(client)).toHaveLength(1);
        expect(calls[0].filters).toEqual([['status', 'open']]);
    });

    it('removes the reported post, then closes the report with who and when', async () => {
        const { client, calls } = fakeClient();
        await resolveReport(report(), 'resolved', 'mod1', true, client);
        expect(calls[0]).toMatchObject({ table: 'community_posts', op: 'delete', filters: [['id', 'p1']] });
        expect(calls[1]).toMatchObject({ table: 'content_reports', op: 'update', filters: [['id', 'r1']] });
        expect(calls[1].payload).toMatchObject({ status: 'resolved', resolved_by: 'mod1' });
    });

    it('removes a reported comment from the comments', async () => {
        const { client, calls } = fakeClient();
        await resolveReport(report({ target_type: 'comment', target_id: 'c1' }), 'resolved', 'mod1', true, client);
        expect(calls[0]).toMatchObject({ table: 'post_comments', filters: [['id', 'c1']] });
    });

    it('only closes the report when dismissing, removing nothing', async () => {
        const { client, calls } = fakeClient();
        await resolveReport(report(), 'dismissed', 'mod1', false, client);
        expect(calls).toHaveLength(1);
        expect(calls[0].payload).toMatchObject({ status: 'dismissed' });
    });

    it('leaves the report open if the content could not be removed', async () => {
        const { client, calls } = fakeClient({ error: { message: 'row-level security' } });
        await expect(resolveReport(report(), 'resolved', 'mod1', true, client)).rejects.toBeTruthy();
        expect(calls).toHaveLength(1);
    });
});

describe('recipe previews for the home page', () => {
    it('asks the narrow public function, and turns tags into a list whatever the database returns', async () => {
        const { client, calls } = fakeClient({ data: [{ id: 'a', title: 'A', excerpt: 'e', tags: ['x'], development_status: null, created_at: 'd' }, { id: 'b', title: 'B', excerpt: '', tags: null, development_status: null, created_at: 'd' }] });
        const previews = await fetchRecipePreviews(3, client);
        expect(calls[0]).toMatchObject({ rpc: 'public_recipe_previews', args: { p_limit: 3 } });
        expect(previews.map(p => p.tags)).toEqual([['x'], []]);
    });
});

describe('friendly wording for what the database refuses', () => {
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
