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
        vi.useFakeTimers();
        fetchMock.mockResolvedValueOnce(reply(200, session())).mockRejectedValue(new TypeError('offline'));
        await client.login({ email: 'a@b.co', password: 'x' });
        const pending = client.refreshSession();
        const outcome = expect(pending).rejects.toMatchObject({ code: 'network' });
        await vi.advanceTimersByTimeAsync(5000);
        await outcome;
        expect(client.getAccessToken()).toBe('token-1');
        expect(client.getCurrentUser()).toEqual(USER);
    });

    it('can refresh again after a refresh has finished', async () => {
        fetchMock.mockResolvedValueOnce(reply(200, session('one'))).mockResolvedValueOnce(reply(200, session('two')));
        await client.refreshSession();
        await client.refreshSession();
        expect(client.getAccessToken()).toBe('two');
    });
});

describe('surviving a server that is down, busy or restarting', () => {
    it.each([500, 502, 503, 429])('keeps you signed in when renewing answers %i, and tries again by itself', async status => {
        vi.useFakeTimers();
        fetchMock.mockResolvedValueOnce(reply(200, session('old'))).mockImplementation(async () => error(status, 'busy'));
        await client.login({ email: 'a@b.co', password: 'x' });

        const pending = client.refreshSession();
        const outcome = expect(pending).rejects.toMatchObject({ status });
        await vi.advanceTimersByTimeAsync(5000);
        await outcome;
        expect(client.getCurrentUser()).toEqual(USER);
        expect(client.getAccessToken()).toBe('old');
        expect(callsTo('/api/v1/auth/refresh')).toHaveLength(4);   // the first try and three more

        // the server is back: the quiet retry swaps in a new token
        fetchMock.mockReset();
        fetchMock.mockImplementation(async () => reply(200, session('renewed')));
        await vi.advanceTimersByTimeAsync(15_000);
        expect(client.getAccessToken()).toBe('renewed');
    });

    it('gets through a short outage by retrying', async () => {
        vi.useFakeTimers();
        fetchMock.mockResolvedValueOnce(error(503, 'down')).mockResolvedValueOnce(error(503, 'down')).mockResolvedValueOnce(reply(200, session('back')));
        const pending = client.refreshSession();
        await vi.advanceTimersByTimeAsync(2000);
        expect(await pending).toEqual(USER);
        expect(client.getAccessToken()).toBe('back');
    });

    it('signs you out only when the server says the sign-in is over', async () => {
        fetchMock.mockResolvedValueOnce(reply(200, session())).mockResolvedValueOnce(error(401, 'no_session'));
        await client.login({ email: 'a@b.co', password: 'x' });
        expect(await client.refreshSession()).toBeNull();
        expect(client.getCurrentUser()).toBeNull();
        expect(callsTo('/api/v1/auth/refresh')).toHaveLength(1);   // and without pointless retries
    });

    it('resumes a sign-in that could not be tried at page load, once the server answers', async () => {
        vi.useFakeTimers();
        fetchMock.mockImplementation(async () => error(503, 'down'));
        const first = client.refreshSession();
        const outcome = expect(first).rejects.toMatchObject({ status: 503 });
        await vi.advanceTimersByTimeAsync(5000);
        await outcome;
        expect(client.getCurrentUser()).toBeNull();

        const seen: unknown[] = [];
        client.onAuthChange(u => seen.push(u?.username ?? null));
        fetchMock.mockReset();
        fetchMock.mockImplementation(async () => reply(200, session('late')));
        await vi.advanceTimersByTimeAsync(15_000);
        expect(seen).toEqual(['sam']);
        expect(client.getAccessToken()).toBe('late');
    });
});

describe('renewing before the token expires', () => {
    it('renews in the background a minute before the token runs out', async () => {
        vi.useFakeTimers();
        fetchMock.mockResolvedValueOnce(reply(200, session('first'))).mockResolvedValueOnce(reply(200, session('second')));
        await client.login({ email: 'a@b.co', password: 'x' });

        await vi.advanceTimersByTimeAsync(839_000);          // a 15 minute token is renewed at 14 minutes: not yet
        expect(client.getAccessToken()).toBe('first');
        await vi.advanceTimersByTimeAsync(2000);
        expect(client.getAccessToken()).toBe('second');
    });

    it('does not renew after signing out', async () => {
        vi.useFakeTimers();
        fetchMock.mockResolvedValueOnce(reply(200, session('first'))).mockResolvedValueOnce(reply(204));
        await client.login({ email: 'a@b.co', password: 'x' });
        await client.logout();
        await vi.advanceTimersByTimeAsync(20 * 60_000);
        expect(callsTo('/api/v1/auth/refresh')).toHaveLength(0);
    });

    it('renews when the tab comes back after being away past the expiry', async () => {
        vi.useFakeTimers();
        fetchMock.mockResolvedValueOnce(reply(200, session('first'))).mockResolvedValueOnce(reply(200, session('same')));
        await client.login({ email: 'a@b.co', password: 'x' });
        await client.refreshSession();                          // how the page resumes; it also starts watching the tab
        fetchMock.mockReset();
        fetchMock.mockImplementation(async () => reply(200, session('after')));

        vi.setSystemTime(Date.now() + 20 * 60_000);             // the laptop slept, so the timers did not fire
        document.dispatchEvent(new Event('visibilitychange'));
        await vi.waitFor(() => expect(client.getAccessToken()).toBe('after'));
    });

    it('leaves a still-fresh token alone when the tab comes back', async () => {
        vi.useFakeTimers();
        fetchMock.mockResolvedValueOnce(reply(200, session('first'))).mockResolvedValueOnce(reply(200, session('second')));
        await client.login({ email: 'a@b.co', password: 'x' });
        await client.refreshSession();
        fetchMock.mockReset();
        window.dispatchEvent(new Event('online'));
        await vi.advanceTimersByTimeAsync(10);
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe('signing in to an account with two-step verification', () => {
    const challenge = { mfa_required: true, mfa_token: 'one-time-token' };

    it('does not sign anyone in after the password alone, and hands back the one-time token', async () => {
        fetchMock.mockResolvedValue(reply(200, challenge));
        const seen: unknown[] = [];
        client.onAuthChange(u => seen.push(u));

        const result = await client.login({ email: 'sam@example.com', password: 'secret' });
        expect(client.isMfaChallenge(result)).toBe(true);
        expect(result).toEqual({ mfaRequired: true, mfaToken: 'one-time-token' });
        expect(client.getAccessToken()).toBeNull();
        expect(client.getCurrentUser()).toBeNull();
        expect(seen).toEqual([]);   // nobody was told a user signed in
    });

    it('signs in once the code is given, with the one-time token', async () => {
        fetchMock.mockResolvedValueOnce(reply(200, challenge)).mockResolvedValueOnce(reply(200, session('after-code')));
        const first = await client.login({ email: 'sam@example.com', password: 'secret' });
        if (!client.isMfaChallenge(first)) throw new Error('expected a challenge');

        const user = await client.completeMfaLogin(first.mfaToken, '123456');
        expect(user).toEqual(USER);
        expect(client.getAccessToken()).toBe('after-code');
        const [url, init] = fetchMock.mock.calls[1];
        expect(String(url)).toBe('/api/v1/auth/login/mfa');
        expect(init.credentials).toBe('include');   // the refresh cookie comes with this answer
        expect(JSON.parse(init.body)).toEqual({ mfaToken: 'one-time-token', code: '123456' });
    });

    it('stays signed out, with the backend\'s reason, when the code is wrong or the sign-in expired', async () => {
        fetchMock.mockResolvedValueOnce(error(401, 'invalid_code', 'That code is not right.')).mockResolvedValueOnce(error(401, 'mfa_expired', 'Please sign in again.'));
        await expect(client.completeMfaLogin('t', '000000')).rejects.toMatchObject({ code: 'invalid_code', status: 401 });
        await expect(client.completeMfaLogin('t', '000000')).rejects.toMatchObject({ code: 'mfa_expired' });
        expect(client.getAccessToken()).toBeNull();
    });

    it('treats Google sign-in the same way', async () => {
        fetchMock.mockResolvedValue(reply(200, challenge));
        const result = await client.loginWithGoogle('google-id-token');
        expect(result).toEqual({ mfaRequired: true, mfaToken: 'one-time-token' });
        expect(client.getAccessToken()).toBeNull();
    });

    it('still returns the user straight away when there is no second step', async () => {
        fetchMock.mockResolvedValue(reply(200, session()));
        const result = await client.login({ email: 'sam@example.com', password: 'secret' });
        expect(client.isMfaChallenge(result)).toBe(false);
        expect(result).toEqual(USER);
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

describe('confirming an email address and resetting a password', () => {
    it('signing up with email confirmation switched on signs nobody in, and says so with null', async () => {
        fetchMock.mockResolvedValue(reply(202, { verification_required: true, email: 'sam@example.com' }));
        const seen: unknown[] = [];
        client.onAuthChange(u => seen.push(u));
        expect(await client.register({ email: 'sam@example.com', password: 'a long password', username: 'sam' })).toBeNull();
        expect(client.getAccessToken()).toBeNull();
        expect(seen).toEqual([]);
    });

    it('a sign-in that is refused because the email is not confirmed carries that code', async () => {
        fetchMock.mockResolvedValue(error(403, 'email_not_verified', 'Please confirm your email address first.'));
        await expect(client.login({ email: 'a@b.co', password: 'x' })).rejects.toMatchObject({ code: 'email_not_verified', status: 403 });
    });

    it('sends the token from the link to be confirmed', async () => {
        fetchMock.mockResolvedValue(reply(204));
        await client.verifyEmail('abc123');
        const [url, init] = fetchMock.mock.calls[0];
        expect(String(url)).toBe('/api/v1/auth/verify-email');
        expect(JSON.parse(init.body)).toEqual({ token: 'abc123' });
    });

    it('turns a used or expired link into an AuthError with the reason', async () => {
        fetchMock.mockResolvedValue(error(400, 'invalid_token', 'This link has expired or was already used.'));
        await expect(client.verifyEmail('old')).rejects.toMatchObject({ code: 'invalid_token', message: 'This link has expired or was already used.' });
    });

    it('asks for a new confirmation link and for a reset link, which answer with nothing to read', async () => {
        fetchMock.mockImplementation(() => Promise.resolve(new Response(null, { status: 202 })));
        await expect(client.resendVerification({ email: 'sam@example.com', captchaToken: 'c' })).resolves.toBeUndefined();
        await expect(client.forgotPassword({ email: 'sam@example.com', captchaToken: 'c' })).resolves.toBeUndefined();
        expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual(['/api/v1/auth/resend-verification', '/api/v1/auth/forgot-password']);
        expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ email: 'sam@example.com', captchaToken: 'c' });
    });

    it('sets a new password with the token, and does not sign anyone in', async () => {
        fetchMock.mockResolvedValue(reply(204));
        await client.resetPassword({ token: 't', password: 'a brand new password' });
        expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ token: 't', password: 'a brand new password' });
        expect(client.getAccessToken()).toBeNull();
    });
});
