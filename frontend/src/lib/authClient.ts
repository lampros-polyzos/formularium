// Talks to the Spring backend for everything about who you are: sign-up, sign-in, Google sign-in, staying signed in, sign-out and
// deleting the account.
//
// The access token (short-lived) is kept only in this module's memory: it is gone when the page is closed and no script can read it
// from storage. Staying signed in across page loads is the job of the refresh cookie, which the browser keeps and scripts cannot read.
//
// Staying signed in:
//  - the access token is renewed shortly BEFORE it expires, and again when the tab comes back or the network returns;
//  - you are signed out only when the server says the sign-in is really over (401/403). A server that is down, busy or restarting
//    (network error, 5xx, 429) never signs you out: the session is kept and renewal is tried again.

import { browserSupportsWebAuthn, startAuthentication, type PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';
import { apiUrl } from './api';
import { describePasskeyError } from './passkeyErrors';

/**
 * `guest` is true for the temporary "Try the demo" account (see {@link startGuest}). `hasPassword` is false for an account that only uses Google, which has no
 * password to change.
 */
export interface AuthUser { id: string; email: string; username: string; guest?: boolean; hasPassword?: boolean }

interface AuthResponse { accessToken: string; expiresInSeconds: number; user: AuthUser }

/**
 * The password (or Google sign-in) was right, but the account has two-step verification, so nobody is signed in yet: the person must now give a code
 * from their authenticator app (or a recovery code) with `completeMfaLogin`. The token is single-use and lasts five minutes.
 */
export interface MfaChallenge { mfaRequired: true; mfaToken: string }

export const isMfaChallenge = (result: AuthUser | MfaChallenge): result is MfaChallenge => 'mfaRequired' in result;

type LoginReply = AuthResponse | { mfa_required: true; mfa_token: string };

/** An error from the sign-in endpoints. `code` is stable and safe to branch on; `message` is safe to show. */
export class AuthError extends Error {
    readonly code: string;
    readonly status: number;
    constructor(code: string, message: string, status: number) {
        super(message);
        this.name = 'AuthError';
        this.code = code;
        this.status = status;
    }
}

let accessToken: string | null = null;
let currentUser: AuthUser | null = null;
let refreshing: Promise<AuthUser | null> | null = null;
let expiresAt = 0;                 // when the access token stops working (ms since 1970)
let renewTimer: ReturnType<typeof setTimeout> | undefined;
let resumeFailed = false;          // the refresh cookie could not be tried because the server was unreachable or failing
let generation = 0;                // counts every change of the session, so a slow answer about an OLDER state can be told apart and ignored
const listeners = new Set<(user: AuthUser | null) => void>();

/** Renew this long before the token expires, so a request never meets an expired one. */
const RENEW_EARLY_MS = 60_000;
/** After a failed renewal, try again after this long (the old token may still be valid for a while). */
const RENEW_RETRY_MS = 15_000;

function setSession(response: AuthResponse | null) {
    generation++;
    accessToken = response?.accessToken ?? null;
    currentUser = response?.user ?? null;
    expiresAt = response ? Date.now() + response.expiresInSeconds * 1000 : 0;
    resumeFailed = false;
    scheduleRenewal(response ? Math.max(5_000, response.expiresInSeconds * 1000 - RENEW_EARLY_MS) : null);
    listeners.forEach(listener => listener(currentUser));
}

/** Renews the token in the background after `delayMs`; null cancels. A failure here is quiet: the next request or try renews it. */
function scheduleRenewal(delayMs: number | null) {
    clearTimeout(renewTimer);
    renewTimer = undefined;
    if (delayMs === null) return;
    renewTimer = setTimeout(() => { refreshSession().catch(() => scheduleRenewal(RENEW_RETRY_MS)); }, delayMs);
}

/** When the tab becomes visible or the network returns: renew a token that is about to expire, or resume a sign-in the server could not be asked about. */
function wakeUp() {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    const expiring = currentUser !== null && Date.now() > expiresAt - RENEW_EARLY_MS;
    if (expiring || (currentUser === null && resumeFailed)) refreshSession().catch(() => { /* the next wake-up or request tries again */ });
}

let watching = false;
function watchForWakeUp() {
    if (watching || typeof window === 'undefined') return;
    watching = true;
    document.addEventListener('visibilitychange', wakeUp);
    window.addEventListener('online', wakeUp);
    window.addEventListener('focus', wakeUp);
}

/** Calls back whenever the signed-in user changes (sign-in, sign-out, a lost session). Returns a function that stops listening. */
export function onAuthChange(listener: (user: AuthUser | null) => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}

export const getCurrentUser = (): AuthUser | null => currentUser;
export const getAccessToken = (): string | null => accessToken;

async function toError(res: Response): Promise<AuthError> {
    try {
        const body = await res.json() as { error?: { code?: string; message?: string } };
        return new AuthError(body.error?.code ?? 'error', body.error?.message ?? 'Something went wrong. Please try again.', res.status);
    } catch {
        return new AuthError('error', 'Something went wrong. Please try again.', res.status);
    }
}

async function post<T>(path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
        res = await fetch(apiUrl(path), {
            method: 'POST',
            credentials: 'include',   // the refresh cookie
            headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
    } catch {
        throw new AuthError('network', 'Could not reach the server. Check your connection and try again.', 0);
    }
    if (!res.ok) throw await toError(res);
    const text = await res.text();   // 204 and 202 answers have no body
    return (text ? JSON.parse(text) : undefined) as T;
}

/** Returns the new user, who is signed in, or null when the email must be confirmed first (a link was sent and the account cannot sign in until it is clicked). */
export async function register(input: { email: string; password: string; username: string; captchaToken?: string | null }): Promise<AuthUser | null> {
    const response = await post<AuthResponse | { verification_required: true }>('/api/v1/auth/register', input);
    if ('verification_required' in response) return null;
    setSession(response);
    return response.user;
}

/**
 * "Try the demo": the server makes a temporary account (deleted after about a day) and signs it in. No email or password. The bot check is the same as at
 * sign-up and works once.
 */
export async function startGuest(captchaToken?: string | null): Promise<AuthUser> {
    const response = await post<AuthResponse>('/api/v1/auth/guest', { captchaToken });
    setSession(response);
    return response.user;
}

/** Confirms the email address with the token from the link in the email. */
export const verifyEmail = (token: string) => post<void>('/api/v1/auth/verify-email', { token });

/** Sends a new confirmation link. The answer is the same whether or not the address has an account. */
export const resendVerification = (input: { email: string; captchaToken?: string | null }) => post<void>('/api/v1/auth/resend-verification', input);

/** Sends a password reset link. The answer is the same whether or not the address has an account. */
export const forgotPassword = (input: { email: string; captchaToken?: string | null }) => post<void>('/api/v1/auth/forgot-password', input);

/** Sets a new password with the token from the reset email. Everything signed in with the old password is signed out. */
export const resetPassword = (input: { token: string; password: string }) => post<void>('/api/v1/auth/reset-password', input);

/** Signs in with email and password. Returns the user, or a challenge when the account needs a code too (see {@link MfaChallenge}). */
export async function login(input: { email: string; password: string; captchaToken?: string | null }): Promise<AuthUser | MfaChallenge> {
    const response = await post<LoginReply>('/api/v1/auth/login', input);
    if ('mfa_required' in response) return { mfaRequired: true, mfaToken: response.mfa_token };
    setSession(response);
    return response.user;
}

/** The second step of signing in: the one-time token from {@link login}, and a code from the app or a recovery code. */
export async function completeMfaLogin(mfaToken: string, code: string): Promise<AuthUser> {
    const response = await post<AuthResponse>('/api/v1/auth/login/mfa', { mfaToken, code });
    setSession(response);
    return response.user;
}

/** `idToken` is what Google's sign-in button hands the page. The server checks it with Google. */
export async function loginWithGoogle(idToken: string): Promise<AuthUser | MfaChallenge> {
    const response = await post<LoginReply>('/api/v1/auth/google', { idToken });
    if ('mfa_required' in response) return { mfaRequired: true, mfaToken: response.mfa_token };
    setSession(response);
    return response.user;
}

/** Whether this browser can use passkeys at all (older ones cannot). */
export const passkeysSupported = (): boolean => browserSupportsWebAuthn();

/**
 * Signs in with a passkey: the browser offers the passkeys it holds for this site, and the person confirms with their fingerprint, face or screen lock.
 * No email, password or code is typed: the passkey is both the password and the second step. A cancelled prompt throws an AuthError with the code
 * `passkey_cancelled`, which is not a failure worth shouting about.
 */
export async function loginWithPasskey(): Promise<AuthUser> {
    const start = await post<{ challengeId: string; options: PublicKeyCredentialRequestOptionsJSON }>('/api/v1/auth/login/passkey/options');
    let credential;
    try {
        credential = await startAuthentication({ optionsJSON: start.options });
    } catch (error) {
        const problem = describePasskeyError(error, 'sign in');
        throw new AuthError(problem.code, problem.message, 0);
    }
    const response = await post<AuthResponse>('/api/v1/auth/login/passkey', { challengeId: start.challengeId, credential });
    setSession(response);
    return response.user;
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** The server could not answer properly (down, restarting, overloaded, or another tab is mid-renewal): the sign-in itself may be fine. */
const isTransient = (e: AuthError) => e.status === 0 || e.status >= 500 || e.status === 408 || e.status === 429 || e.code === 'refresh_in_progress';

const RETRY_DELAYS_MS = [400, 1200, 3000];

/**
 * Asks for a new access token using the refresh cookie. Calls made while one is already under way share its answer: a refresh token
 * can be used once, so two requests at the same time would otherwise fight.
 *
 * Returns the user, or null when the server says there is no valid sign-in (and only then are you signed out).
 * Throws an AuthError, leaving the session as it was, when the server could not be asked or failed: try again later.
 */
export function refreshSession(): Promise<AuthUser | null> {
    watchForWakeUp();
    refreshing ??= (async () => {
        const started = generation;
        try {
            for (let attempt = 0; ; attempt++) {
                try {
                    const response = await post<AuthResponse>('/api/v1/auth/refresh');
                    // Someone signed in (or out) while this was on its way: that is newer than what the cookie said when we asked
                    if (generation !== started) return currentUser;
                    setSession(response);
                    return response.user;
                } catch (e) {
                    if (!(e instanceof AuthError)) throw e;
                    if (!isTransient(e)) {   // 401 and the like: the sign-in is really over, unless a newer sign-in has happened since
                        if (generation !== started) return currentUser;
                        setSession(null);
                        return null;
                    }
                    if (attempt >= RETRY_DELAYS_MS.length) {
                        if (currentUser === null) resumeFailed = true;
                        scheduleRenewal(RENEW_RETRY_MS);   // keep trying quietly; the session is not given up
                        throw e.code === 'refresh_in_progress' || e.status === 0
                            ? e
                            : new AuthError('unavailable', 'The server is not answering right now. You are still signed in; try again in a moment.', e.status);
                    }
                    await wait(RETRY_DELAYS_MS[attempt]);
                }
            }
        } finally {
            refreshing = null;
        }
    })();
    return refreshing;
}

export async function logout(): Promise<void> {
    try {
        await post<void>('/api/v1/auth/logout');
    } catch {
        // Signed out on this device either way. If the server could not be told, the refresh cookie simply expires on its own.
    }
    setSession(null);
}

/**
 * Whether a 401 is one of the API's own answers (a wrong password, a wrong code: it has the JSON error body every endpoint uses) and not the bare 401 that the
 * security filter gives for an expired or missing access token. Only the second means "renew and try again": repeating the first would send a wrong guess twice.
 */
async function isAnApiError(res: Response): Promise<boolean> {
    try {
        const body = await res.clone().json() as { error?: { code?: unknown } };
        return typeof body?.error?.code === 'string';
    } catch {
        return false;   // no JSON body: the security filter's answer
    }
}

/**
 * fetch() for the signed-in API. Adds the access token, and if the server says it has expired, renews it once and tries again. An error the API gives for the
 * request itself, even a 401 (a wrong current password), is handed back as it is, never repeated.
 * Throws AuthError('no_session') when you are not signed in.
 */
export async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
    const send = () => {
        const headers = new Headers(init.headers);
        headers.set('Authorization', `Bearer ${accessToken}`);
        return fetch(apiUrl(path), { ...init, headers, credentials: 'include' });
    };
    if (!accessToken && !(await refreshSession())) throw new AuthError('no_session', 'Please sign in.', 401);
    let res = await send();
    if (res.status === 401 && !(await isAnApiError(res))) {
        if (!(await refreshSession())) throw new AuthError('no_session', 'Please sign in.', 401);
        res = await send();
    }
    return res;
}

/** Changes the display name shown on your posts, comments and ratings. The backend makes sure it is free and follows it everywhere. */
export async function updateUsername(username: string): Promise<AuthUser> {
    const res = await authFetch('/api/v1/auth/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username }) });
    if (!res.ok) throw await toError(res);
    const user = await res.json() as AuthUser;
    currentUser = user;
    listeners.forEach(listener => listener(currentUser));
    return user;
}

/** Permanently deletes the signed-in account (and what belongs to it), then forgets the sign-in on this device. */
export async function deleteAccount(): Promise<void> {
    const res = await authFetch('/api/v1/auth/me', { method: 'DELETE' });
    if (!res.ok) throw await toError(res);
    setSession(null);
}
