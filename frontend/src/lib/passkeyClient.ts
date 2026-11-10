// Passkeys for the signed-in member: list them, add one, remove one. Signing IN with a passkey is in authClient.ts (`loginWithPasskey`), because that is how a
// session starts.
//
// A passkey is made by the browser and the device (fingerprint, face or screen lock), and the private key never leaves it. We only ever see the public half.

import { startRegistration, type PublicKeyCredentialCreationOptionsJSON } from '@simplewebauthn/browser';
import { ApiError, request } from './apiClient';
import { describePasskeyError } from './passkeyErrors';

export interface Passkey {
    id: string;
    /** How the member recognises it ("My phone"). */
    name: string;
    createdAt: string;
    lastUsedAt: string | null;
    /** Kept in a password manager or cloud keychain, so it follows the member between devices. */
    synced: boolean;
}

export interface PasskeyStatus {
    /** False when the server has passkeys switched off: the section is then hidden. */
    available: boolean;
    /** The account has a password, which adding and removing ask for again (a Google-only account has none). */
    needsPassword: boolean;
    /** False when the member has switched password sign-in off: only passkeys (and Google, if linked) open the account. */
    passwordSignInOn: boolean;
    /** At least one passkey has signed in before, which has to be true before password sign-in may be switched off (so nobody is locked out). */
    hasUsedPasskey: boolean;
    passkeys: Passkey[];
}

export const fetchPasskeys = () => request<PasskeyStatus>('/api/v1/auth/passkeys');

/**
 * Adds a passkey: asks the server for a challenge (needs the password, when the account has one), lets the browser make the passkey, and hands the answer back.
 * Throws an ApiError with a sentence to show: from the server, or, when the browser's prompt was cancelled or failed, from `describePasskeyError`.
 */
export async function addPasskey(input: { password?: string; name: string }): Promise<Passkey> {
    const start = await request<{ challengeId: string; options: PublicKeyCredentialCreationOptionsJSON }>('/api/v1/auth/passkeys/registration/options', {
        method: 'POST', body: { password: input.password ?? null },
    });
    let credential;
    try {
        credential = await startRegistration({ optionsJSON: start.options });
    } catch (error) {
        const problem = describePasskeyError(error, 'add');
        throw new ApiError(0, problem.code, problem.message);
    }
    return request<Passkey>('/api/v1/auth/passkeys/registration', { method: 'POST', body: { challengeId: start.challengeId, credential, name: input.name } });
}

/**
 * Switches password sign-in off (`enabled` false) or back on. Needs the password. Switching it off needs a passkey that has signed in before, and signs every other
 * device out; the server's message says why when it refuses (`passkey_not_proven`, `invalid_credentials`).
 */
export async function setPasswordSignIn(enabled: boolean, password?: string): Promise<void> {
    await request<void>('/api/v1/auth/password-sign-in', { method: 'POST', body: { enabled, password: password ?? null } });
}

/** Needs the password, when the account has one. */
export async function removePasskey(id: string, password?: string): Promise<void> {
    await request<void>(`/api/v1/auth/passkeys/${encodeURIComponent(id)}/remove`, { method: 'POST', body: { password: password ?? null } });
}
