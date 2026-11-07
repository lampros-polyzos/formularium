import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const USER = { id: 'u1', email: 'sam@example.com', username: 'sam' };
const session = () => ({ accessToken: 'token-1', expiresInSeconds: 900, user: USER });
const reply = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let fetchMock: ReturnType<typeof vi.fn>;
let client: typeof import('../lib/authClient');
let context: typeof import('./AuthContext');

/** A fresh copy of both modules per test: the client keeps the sign-in in memory and the context subscribes to that same copy. */
beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv('VITE_API_BASE_URL', '');
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    client = await import('../lib/authClient');
    context = await import('./AuthContext');
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

function Who() {
    const { user, isLoading } = context.useAuth();
    return <p data-testid="who">{user ? `in:${user.username}` : isLoading ? 'loading' : 'out'}</p>;
}
const show = () => render(<context.AuthProvider><Who /></context.AuthProvider>);

describe('AuthProvider', () => {
    it('shows signed out when there is no sign-in to resume, and signed in as soon as someone signs in, without a reload', async () => {
        fetchMock.mockResolvedValueOnce(reply(401, { error: { code: 'no_session', message: 'x' } }));
        show();
        await waitFor(() => expect(screen.getByTestId('who').textContent).toBe('out'));

        fetchMock.mockResolvedValueOnce(reply(200, session()));
        await act(async () => { await client.login({ email: 'sam@example.com', password: 'x' }); });
        expect(screen.getByTestId('who').textContent).toBe('in:sam');
    });

    it('keeps a sign-in that happened while the first "am I signed in?" check was still waiting', async () => {
        // The page's own resume check is slow and will answer "no" only after the person has already signed in
        let lateNo!: (r: Response) => void;
        fetchMock.mockReturnValueOnce(new Promise<Response>(resolve => { lateNo = resolve; }));
        show();

        fetchMock.mockResolvedValueOnce(reply(200, session()));
        await act(async () => { await client.login({ email: 'sam@example.com', password: 'x' }); });
        expect(screen.getByTestId('who').textContent).toBe('in:sam');

        await act(async () => { lateNo(reply(401, { error: { code: 'no_session', message: 'x' } })); });
        await waitFor(() => expect(client.getCurrentUser()).toEqual(USER));
        expect(client.getAccessToken()).toBe('token-1');
        expect(screen.getByTestId('who').textContent).toBe('in:sam');
    });

    it('ignores a resume check that succeeds late with an older sign-in, once someone has signed in', async () => {
        let lateYes!: (r: Response) => void;
        fetchMock.mockReturnValueOnce(new Promise<Response>(resolve => { lateYes = resolve; }));
        show();

        fetchMock.mockResolvedValueOnce(reply(200, { ...session(), accessToken: 'from-login' }));
        await act(async () => { await client.login({ email: 'sam@example.com', password: 'x' }); });

        await act(async () => { lateYes(reply(200, { ...session(), accessToken: 'from-old-cookie' })); });
        expect(client.getAccessToken()).toBe('from-login');
    });
});
