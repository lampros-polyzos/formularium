import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Client = typeof import('./authClient');

const USER = { id: 'u1', email: 'sam@example.com', username: 'sam' };
const session = (token = 'token-1') => ({ accessToken: token, expiresInSeconds: 900, user: USER });

const reply = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const error = (status: number, code: string, message = code) => reply(status, { error: { code, message } });

let fetchMock: ReturnType<typeof vi.fn>;
let client: Client;

/** A fresh copy of the module for each test: it keeps the access token in memory. */
beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv('VITE_API_BASE_URL', '');   // whatever the developer's own .env says
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    client = await import('./authClient');
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

const callsTo = (path: string) => fetchMock.mock.calls.filter(([url]) => String(url).endsWith(path));

describe('signing in', () => {
    it('sends the details to the backend with the cookie, and keeps the access token only in memory', async () => {
        fetchMock.mockResolvedValue(reply(200, session()));
        const user = await client.login({ email: 'sam@example.com', password: 'secret', captchaToken: 'c' });

        expect(user).toEqual(USER);
        const [url, init] = fetchMock.mock.calls[0];
        expect(String(url)).toBe('/api/v1/auth/login');
        expect(init.credentials).toBe('include');
        expect(JSON.parse(init.body)).toEqual({ email: 'sam@example.com', password: 'secret', captchaToken: 'c' });
        expect(client.getAccessToken()).toBe('token-1');
        expect(client.getCurrentUser()).toEqual(USER);
        expect(JSON.stringify([localStorage, sessionStorage])).not.toContain('token-1');
    });

    it('tells listeners when the user changes', async () => {
        const seen: unknown[] = [];
        client.onAuthChange(u => seen.push(u?.username ?? null));
        fetchMock.mockResolvedValueOnce(reply(201, session())).mockResolvedValueOnce(reply(204));
        await client.register({ email: 'sam@example.com', password: 'a long password', username: 'sam' });
        await client.logout();
        expect(seen).toEqual(['sam', null]);
    });

    it('turns the backend\'s error into an AuthError with its code and message', async () => {
        fetchMock.mockResolvedValue(error(401, 'invalid_credentials', 'The email or password is not right.'));
        await expect(client.login({ email: 'a@b.co', password: 'x' })).rejects.toMatchObject({ name: 'AuthError', code: 'invalid_credentials', status: 401, message: 'The email or password is not right.' });
        expect(client.getAccessToken()).toBeNull();
    });

    it('says so when the server cannot be reached', async () => {
        fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
        await expect(client.login({ email: 'a@b.co', password: 'x' })).rejects.toMatchObject({ code: 'network' });
    });

    it('signs in with Google by handing over the ID token', async () => {
        fetchMock.mockResolvedValue(reply(200, session()));
        await client.loginWithGoogle('google-id-token');
        expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ idToken: 'google-id-token' });
    });
});

describe('staying signed in', () => {
    it('resumes from the refresh cookie', async () => {
        fetchMock.mockResolvedValue(reply(200, session('fresh')));
        expect(await client.refreshSession()).toEqual(USER);
        expect(client.getAccessToken()).toBe('fresh');
    });

    it('answers null, and forgets everything, when there is no valid sign-in', async () => {
        fetchMock.mockResolvedValueOnce(reply(200, session())).mockResolvedValueOnce(error(401, 'no_session'));
        await client.login({ email: 'a@b.co', password: 'x' });
        expect(await client.refreshSession()).toBeNull();
        expect(client.getAccessToken()).toBeNull();
        expect(client.getCurrentUser()).toBeNull();
    });

    it('shares one request between calls made at the same time, since a refresh token works once', async () => {
        let resolve!: (r: Response) => void;
        fetchMock.mockReturnValue(new Promise<Response>(r => { resolve = r; }));
        const [a, b, c] = [client.refreshSession(), client.refreshSession(), client.refreshSession()];
        resolve(reply(200, session()));
        expect(await Promise.all([a, b, c])).toEqual([USER, USER, USER]);
        expect(callsTo('/api/v1/auth/refresh')).toHaveLength(1);
    });

    it('tries again when another tab has just renewed the same sign-in', async () => {
        vi.useFakeTimers();
        fetchMock.mockResolvedValueOnce(error(409, 'refresh_in_progress')).mockResolvedValueOnce(reply(200, session('second try')));
        const pending = client.refreshSession();
        await vi.advanceTimersByTimeAsync(400);
        expect(await pending).toEqual(USER);
        expect(client.getAccessToken()).toBe('second try');
    });

    it('does not sign you out just because the server cannot be reached', async () => {
        fetchMock.mockResolvedValueOnce(reply(200, session())).mockRejectedValueOnce(new TypeError('offline'));
        await client.login({ email: 'a@b.co', password: 'x' });
        await expect(client.refreshSession()).rejects.toMatchObject({ code: 'network' });
        expect(client.getAccessToken()).toBe('token-1');
    });

    it('can refresh again after a refresh has finished', async () => {
        fetchMock.mockResolvedValueOnce(reply(200, session('one'))).mockResolvedValueOnce(reply(200, session('two')));
        await client.refreshSession();
        await client.refreshSession();
        expect(client.getAccessToken()).toBe('two');
    });
});

describe('calling the signed-in API', () => {
    it('adds the access token', async () => {
        fetchMock.mockResolvedValueOnce(reply(200, session())).mockResolvedValueOnce(reply(200, { ok: true }));
        await client.login({ email: 'a@b.co', password: 'x' });
        await client.authFetch('/api/v1/validate', { method: 'POST', body: '{}' });
        const [url, init] = fetchMock.mock.calls[1];
        expect(String(url)).toBe('/api/v1/validate');
        expect(new Headers(init.headers).get('Authorization')).toBe('Bearer token-1');
        expect(init.method).toBe('POST');
    });

    it('renews an expired token once and repeats the request', async () => {
        fetchMock
            .mockResolvedValueOnce(reply(200, session('old')))
            .mockResolvedValueOnce(error(401, 'x'))               // the API says the token expired
            .mockResolvedValueOnce(reply(200, session('new')))    // refresh
            .mockResolvedValueOnce(reply(200, { ok: true }));     // the repeated request
        await client.login({ email: 'a@b.co', password: 'x' });
        const res = await client.authFetch('/api/v1/validate');
        expect(res.status).toBe(200);
        expect(new Headers(fetchMock.mock.calls[3][1].headers).get('Authorization')).toBe('Bearer new');
    });

    it('gives up with no_session when the sign-in cannot be renewed, instead of looping', async () => {
        fetchMock
            .mockResolvedValueOnce(reply(200, session()))
            .mockResolvedValueOnce(error(401, 'x'))
            .mockResolvedValueOnce(error(401, 'no_session'));
        await client.login({ email: 'a@b.co', password: 'x' });
        await expect(client.authFetch('/api/v1/validate')).rejects.toMatchObject({ code: 'no_session' });
        expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('resumes the sign-in first when the page was reloaded and holds no token yet', async () => {
        fetchMock.mockResolvedValueOnce(reply(200, session('resumed'))).mockResolvedValueOnce(reply(200, {}));
        await client.authFetch('/api/v1/export/pif');
        expect(callsTo('/api/v1/auth/refresh')).toHaveLength(1);
        expect(new Headers(fetchMock.mock.calls[1][1].headers).get('Authorization')).toBe('Bearer resumed');
    });

    it('does not call the API at all when nobody is signed in', async () => {
        fetchMock.mockResolvedValue(error(401, 'no_session'));
        await expect(client.authFetch('/api/v1/validate')).rejects.toMatchObject({ code: 'no_session', status: 401 });
        expect(callsTo('/api/v1/validate')).toHaveLength(0);
    });
});

describe('signing out and deleting the account', () => {
    it('signs out here even if the server cannot be reached', async () => {
        fetchMock.mockResolvedValueOnce(reply(200, session())).mockRejectedValueOnce(new TypeError('offline'));
        await client.login({ email: 'a@b.co', password: 'x' });
        await expect(client.logout()).resolves.toBeUndefined();
        expect(client.getAccessToken()).toBeNull();
        expect(client.getCurrentUser()).toBeNull();
    });

    it('deletes the account with the access token, then forgets the sign-in', async () => {
        fetchMock.mockResolvedValueOnce(reply(200, session())).mockResolvedValueOnce(reply(204));
        await client.login({ email: 'a@b.co', password: 'x' });
        await client.deleteAccount();
        expect(fetchMock.mock.calls[1][1].method).toBe('DELETE');
        expect(String(fetchMock.mock.calls[1][0])).toBe('/api/v1/auth/me');
        expect(client.getAccessToken()).toBeNull();
    });

    it('keeps the sign-in and reports the problem when the deletion fails', async () => {
        fetchMock.mockResolvedValueOnce(reply(200, session())).mockResolvedValueOnce(error(500, 'error', 'boom'));
        await client.login({ email: 'a@b.co', password: 'x' });
        await expect(client.deleteAccount()).rejects.toMatchObject({ message: 'boom' });
        expect(client.getAccessToken()).toBe('token-1');
    });
});
