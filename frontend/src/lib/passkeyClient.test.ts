import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ request: vi.fn(), startRegistration: vi.fn() }));

vi.mock('./apiClient', async (importOriginal) => ({ ...(await importOriginal<typeof import('./apiClient')>()), request: mocks.request }));
vi.mock('@simplewebauthn/browser', () => ({ startRegistration: mocks.startRegistration }));

import { ApiError } from './apiClient';
import { addPasskey, fetchPasskeys, removePasskey, setPasswordSignIn } from './passkeyClient';

const OPTIONS = { challenge: 'abc', rp: { id: 'formularium.dev', name: 'Formularium' }, user: { id: 'u', name: 'sam@example.com', displayName: 'sam' } };
const MADE = { id: 'cred-1', rawId: 'cred-1', type: 'public-key', response: { clientDataJSON: 'x', attestationObject: 'y' } };

beforeEach(() => {
    mocks.request.mockReset();
    mocks.startRegistration.mockReset().mockResolvedValue(MADE);
});

describe('listing passkeys', () => {
    it('asks the backend for the signed-in member\'s status', async () => {
        const status = { available: true, needsPassword: true, passwordSignInOn: true, hasUsedPasskey: false, passkeys: [] };
        mocks.request.mockResolvedValue(status);
        expect(await fetchPasskeys()).toEqual(status);
        expect(mocks.request).toHaveBeenCalledWith('/api/v1/auth/passkeys');
    });
});

describe('adding a passkey', () => {
    it('gets a challenge with the password, lets the browser make the passkey, and sends the answer back with the name', async () => {
        mocks.request
            .mockResolvedValueOnce({ challengeId: 'ch-1', options: OPTIONS })
            .mockResolvedValueOnce({ id: 'p1', name: 'My phone', createdAt: '2026-11-10T10:00:00Z', lastUsedAt: null, synced: false });

        const added = await addPasskey({ password: 'a long password', name: 'My phone' });

        expect(added.name).toBe('My phone');
        expect(mocks.request).toHaveBeenNthCalledWith(1, '/api/v1/auth/passkeys/registration/options', { method: 'POST', body: { password: 'a long password' } });
        expect(mocks.startRegistration).toHaveBeenCalledWith({ optionsJSON: OPTIONS });
        expect(mocks.request).toHaveBeenNthCalledWith(2, '/api/v1/auth/passkeys/registration', { method: 'POST', body: { challengeId: 'ch-1', credential: MADE, name: 'My phone' } });
    });

    it('sends no password for an account that has none (Google only)', async () => {
        mocks.request.mockResolvedValueOnce({ challengeId: 'ch-1', options: OPTIONS }).mockResolvedValueOnce({ id: 'p1' });
        await addPasskey({ name: 'Laptop' });
        expect(mocks.request.mock.calls[0][1].body).toEqual({ password: null });
    });

    it('stops with a plain sentence, and asks the server for nothing more, when the person cancels the browser\'s prompt', async () => {
        mocks.request.mockResolvedValueOnce({ challengeId: 'ch-1', options: OPTIONS });
        mocks.startRegistration.mockRejectedValue(Object.assign(new Error('The operation either timed out or was not allowed.'), { name: 'NotAllowedError' }));

        const error = await addPasskey({ password: 'x', name: 'Phone' }).catch(e => e);

        expect(error).toBeInstanceOf(ApiError);
        expect(error).toMatchObject({ code: 'passkey_cancelled', message: 'Adding the passkey was cancelled or timed out. You can try again.' });
        expect(mocks.request).toHaveBeenCalledTimes(1);   // the half-made registration is simply left to expire
    });

    it('does not start the browser at all when the server refuses the password', async () => {
        mocks.request.mockRejectedValueOnce(new ApiError(401, 'invalid_credentials', 'That password is not right.'));
        await expect(addPasskey({ password: 'wrong', name: 'Phone' })).rejects.toMatchObject({ code: 'invalid_credentials', message: 'That password is not right.' });
        expect(mocks.startRegistration).not.toHaveBeenCalled();
    });

    it('shows the server\'s own message when it refuses what the browser made', async () => {
        mocks.request.mockResolvedValueOnce({ challengeId: 'ch-1', options: OPTIONS }).mockRejectedValueOnce(new ApiError(400, 'passkey_invalid', 'That passkey could not be added. Try again, or use another device.'));
        await expect(addPasskey({ password: 'x', name: 'Phone' })).rejects.toMatchObject({ code: 'passkey_invalid' });
    });
});

describe('removing a passkey', () => {
    it('posts the password to the passkey\'s own address (the id is escaped)', async () => {
        mocks.request.mockResolvedValue(undefined);
        await removePasskey('a/b c', 'a long password');
        expect(mocks.request).toHaveBeenCalledWith('/api/v1/auth/passkeys/a%2Fb%20c/remove', { method: 'POST', body: { password: 'a long password' } });
    });

    it('sends null when the account has no password', async () => {
        mocks.request.mockResolvedValue(undefined);
        await removePasskey('p1');
        expect(mocks.request.mock.calls[0][1].body).toEqual({ password: null });
    });
});

describe('switching password sign-in off and on', () => {
    it('posts the choice and the password', async () => {
        mocks.request.mockResolvedValue(undefined);
        await setPasswordSignIn(false, 'a long password');
        await setPasswordSignIn(true, 'a long password');
        expect(mocks.request).toHaveBeenNthCalledWith(1, '/api/v1/auth/password-sign-in', { method: 'POST', body: { enabled: false, password: 'a long password' } });
        expect(mocks.request).toHaveBeenNthCalledWith(2, '/api/v1/auth/password-sign-in', { method: 'POST', body: { enabled: true, password: 'a long password' } });
    });

    it('passes on the server\'s reason when it refuses (a passkey that has never signed in)', async () => {
        mocks.request.mockRejectedValue(new ApiError(409, 'passkey_not_proven', 'Sign in with a passkey once first, so we know it works on your device.'));
        await expect(setPasswordSignIn(false, 'x')).rejects.toMatchObject({ status: 409, code: 'passkey_not_proven', message: expect.stringContaining('Sign in with a passkey once first') });
    });
});
