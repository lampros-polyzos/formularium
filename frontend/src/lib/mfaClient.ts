// Two-step verification (authenticator app) for the signed-in member: its state, setting it up, and switching it off.
// Signing in WITH a code is in authClient.ts (`completeMfaLogin`).

import { request } from './apiClient';

export interface MfaStatus {
    /** False when the server has no key to protect the secrets with: the feature is then hidden. */
    available: boolean;
    enabled: boolean;
    recoveryCodesLeft: number;
    /** The account has a password, which setup asks for again (a Google-only account has none). */
    needsPassword: boolean;
}

export interface MfaSetup {
    /** The key to type into an app that cannot scan the QR code. */
    secret: string;
    /** What the QR code encodes. */
    otpauthUri: string;
}

export async function fetchMfaStatus(): Promise<MfaStatus> {
    const r = await request<{ available: boolean; enabled: boolean; recovery_codes_left: number; needs_password: boolean }>('/api/v1/auth/mfa');
    return { available: r.available, enabled: r.enabled, recoveryCodesLeft: r.recovery_codes_left, needsPassword: r.needs_password };
}

/** Makes a new secret. It does nothing until \`enableMfa\` is given a code from it. The password is required for accounts that have one. */
export async function startMfaSetup(password?: string): Promise<MfaSetup> {
    const r = await request<{ secret: string; otpauth_uri: string }>('/api/v1/auth/mfa/setup', { method: 'POST', body: { password: password ?? null } });
    return { secret: r.secret, otpauthUri: r.otpauth_uri };
}

/** Switches it on. Returns the recovery codes, which are shown only this once. */
export async function enableMfa(code: string): Promise<string[]> {
    const r = await request<{ recovery_codes: string[] }>('/api/v1/auth/mfa/enable', { method: 'POST', body: { code } });
    return r.recovery_codes;
}

/** Needs a code from the app, or a recovery code. */
export async function disableMfa(code: string): Promise<void> {
    await request<void>('/api/v1/auth/mfa/disable', { method: 'POST', body: { code } });
}

/** Replaces all recovery codes (the old ones stop working). Needs a code from the app, or a recovery code. */
export async function newRecoveryCodes(code: string): Promise<string[]> {
    const r = await request<{ recovery_codes: string[] }>('/api/v1/auth/mfa/recovery-codes', { method: 'POST', body: { code } });
    return r.recovery_codes;
}
