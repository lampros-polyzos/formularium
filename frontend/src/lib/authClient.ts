// Talks to the Spring backend for everything about who you are: sign-up, sign-in, Google sign-in, staying signed in, sign-out and
// deleting the account.
//
// The access token (short-lived) is kept only in this module's memory: it is gone when the page is closed and no script can read it
// from storage. Staying signed in across page loads is the job of the refresh cookie, which the browser keeps and scripts cannot read.

import { apiUrl } from './api';

export interface AuthUser { id: string; email: string; username: string }

interface AuthResponse { accessToken: string; expiresInSeconds: number; user: AuthUser }

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
const listeners = new Set<(user: AuthUser | null) => void>();

function setSession(response: AuthResponse | null) {
    accessToken = response?.accessToken ?? null;
    currentUser = response?.user ?? null;
    listeners.forEach(listener => listener(currentUser));
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

/** Confirms the email address with the token from the link in the email. */
export const verifyEmail = (token: string) => post<void>('/api/v1/auth/verify-email', { token });

/** Sends a new confirmation link. The answer is the same whether or not the address has an account. */
export const resendVerification = (input: { email: string; captchaToken?: string | null }) => post<void>('/api/v1/auth/resend-verification', input);

/** Sends a password reset link. The answer is the same whether or not the address has an account. */
export const forgotPassword = (input: { email: string; captchaToken?: string | null }) => post<void>('/api/v1/auth/forgot-password', input);

/** Sets a new password with the token from the reset email. Everything signed in with the old password is signed out. */
export const resetPassword = (input: { token: string; password: string }) => post<void>('/api/v1/auth/reset-password', input);

export async function login(input: { email: string; password: string; captchaToken?: string | null }): Promise<AuthUser> {
    const response = await post<AuthResponse>('/api/v1/auth/login', input);
    setSession(response);
    return response.user;
}

/** `idToken` is what Google's sign-in button hands the page. The server checks it with Google. */
export async function loginWithGoogle(idToken: string): Promise<AuthUser> {
    const response = await post<AuthResponse>('/api/v1/auth/google', { idToken });
    setSession(response);
    return response.user;
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Asks for a new access token using the refresh cookie. Calls made while one is already under way share its answer: a refresh token
 * can be used once, so two requests at the same time would otherwise fight. Returns null when there is no valid sign-in.
 */
export function refreshSession(): Promise<AuthUser | null> {
    refreshing ??= (async () => {
        try {
            // Another tab may have just renewed the same sign-in (the server answers 409): by the next try the cookie is the new one
            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    const response = await post<AuthResponse>('/api/v1/auth/refresh');
                    setSession(response);
                    return response.user;
                } catch (e) {
                    if (e instanceof AuthError && e.code === 'refresh_in_progress' && attempt < 2) { await wait(300); continue; }
                    if (e instanceof AuthError && e.code === 'network') throw e;
                    setSession(null);
                    return null;
                }
            }
            return null;
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
 * fetch() for the signed-in API. Adds the access token, and if the server says it has expired, renews it once and tries again.
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
    if (res.status === 401) {
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
