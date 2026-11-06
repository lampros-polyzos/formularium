// One way to call the signed-in backend: JSON in, JSON out, and the backend's own error message when it says no.

import { authFetch } from './authClient';

/** An error from the backend, with the message it sent (safe to show) and a stable code. */
export class ApiError extends Error {
    readonly status: number;
    readonly code: string;
    constructor(status: number, code: string, message: string) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.code = code;
    }
}

export async function request<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
    const res = await authFetch(path, {
        method: init.method ?? 'GET',
        headers: init.body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    if (!res.ok) {
        let code = 'error';
        let message = 'Something went wrong. Please try again.';
        try {
            const body = await res.json() as { error?: { code?: string; message?: string } };
            code = body.error?.code ?? code;
            message = body.error?.message ?? message;
        } catch { /* no JSON body */ }
        throw new ApiError(res.status, code, message);
    }
    return (res.status === 204 ? undefined : await res.json()) as T;
}
