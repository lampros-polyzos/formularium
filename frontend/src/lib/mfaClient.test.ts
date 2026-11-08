import { beforeEach, describe, expect, it, vi } from 'vitest';
import { disableMfa, enableMfa, fetchMfaStatus, newRecoveryCodes, startMfaSetup } from './mfaClient';

const request = vi.hoisted(() => vi.fn());
vi.mock('./apiClient', () => ({ request }));

beforeEach(() => { request.mockReset(); });

describe('two-step verification API', () => {
    it('reads the state in the shape the screens use', async () => {
        request.mockResolvedValue({ available: true, enabled: true, recovery_codes_left: 7, needs_password: false });
        expect(await fetchMfaStatus()).toEqual({ available: true, enabled: true, recoveryCodesLeft: 7, needsPassword: false });
        expect(request).toHaveBeenCalledWith('/api/v1/auth/mfa');
    });

    it('starts a setup with the password, and reads back the secret and the QR address', async () => {
        request.mockResolvedValue({ secret: 'ABCDEFGH', otpauth_uri: 'otpauth://totp/Formularium:a%40b.co?secret=ABCDEFGH' });
        expect(await startMfaSetup('my password')).toEqual({ secret: 'ABCDEFGH', otpauthUri: 'otpauth://totp/Formularium:a%40b.co?secret=ABCDEFGH' });
        expect(request).toHaveBeenCalledWith('/api/v1/auth/mfa/setup', { method: 'POST', body: { password: 'my password' } });
    });

    it('starts a setup without a password for an account that has none', async () => {
        request.mockResolvedValue({ secret: 'S', otpauth_uri: 'u' });
        await startMfaSetup();
        expect(request).toHaveBeenCalledWith('/api/v1/auth/mfa/setup', { method: 'POST', body: { password: null } });
    });

    it('turns it on with the first code and returns the recovery codes', async () => {
        request.mockResolvedValue({ recovery_codes: ['AAAAA-BBBBB', 'CCCCC-DDDDD'] });
        expect(await enableMfa('123456')).toEqual(['AAAAA-BBBBB', 'CCCCC-DDDDD']);
        expect(request).toHaveBeenCalledWith('/api/v1/auth/mfa/enable', { method: 'POST', body: { code: '123456' } });
    });

    it('turns it off, and asks for new recovery codes, each with a code', async () => {
        request.mockResolvedValue(undefined);
        await disableMfa('654321');
        expect(request).toHaveBeenCalledWith('/api/v1/auth/mfa/disable', { method: 'POST', body: { code: '654321' } });

        request.mockResolvedValue({ recovery_codes: ['EEEEE-FFFFF'] });
        expect(await newRecoveryCodes('111111')).toEqual(['EEEEE-FFFFF']);
        expect(request).toHaveBeenLastCalledWith('/api/v1/auth/mfa/recovery-codes', { method: 'POST', body: { code: '111111' } });
    });

    it('lets the server\'s message through when a code is wrong', async () => {
        request.mockImplementation(async () => { throw new Error('That code is not right. Check the app, or use a recovery code.'); });
        await expect(enableMfa('000000')).rejects.toThrow('That code is not right');
    });
});
