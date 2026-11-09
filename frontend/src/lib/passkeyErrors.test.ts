import { describe, expect, it } from 'vitest';
import { describePasskeyError } from './passkeyErrors';

const named = (name: string) => Object.assign(new Error('browser says no'), { name });
const coded = (code: string) => Object.assign(new Error('library says no'), { code });

describe('describePasskeyError', () => {
    it('treats pressing Cancel, or running out of time, as an everyday thing, in the words of what was being done', () => {
        expect(describePasskeyError(named('NotAllowedError'), 'sign in')).toMatchObject({ code: 'passkey_cancelled', message: 'The passkey sign-in was cancelled or timed out. You can try again.' });
        expect(describePasskeyError(named('NotAllowedError'), 'add')).toMatchObject({ code: 'passkey_cancelled', message: 'Adding the passkey was cancelled or timed out. You can try again.' });
        expect(describePasskeyError(coded('ERROR_CEREMONY_ABORTED'), 'add').code).toBe('passkey_cancelled');
        expect(describePasskeyError(named('AbortError'), 'sign in').code).toBe('passkey_cancelled');
    });

    it('says when this device already has a passkey for the account', () => {
        expect(describePasskeyError(named('InvalidStateError'), 'add')).toMatchObject({ code: 'passkey_exists', message: 'This device already has a passkey for your account.' });
        expect(describePasskeyError(coded('ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED'), 'add').code).toBe('passkey_exists');
    });

    it('says when the device cannot do it at all', () => {
        expect(describePasskeyError(coded('ERROR_AUTHENTICATOR_MISSING_USER_VERIFICATION_SUPPORT'), 'add').code).toBe('passkey_unsupported');
        expect(describePasskeyError(coded('ERROR_AUTHENTICATOR_MISSING_DISCOVERABLE_CREDENTIAL_SUPPORT'), 'add').code).toBe('passkey_unsupported');
        expect(describePasskeyError(named('NotSupportedError'), 'sign in').code).toBe('passkey_unsupported');
    });

    it('explains a wrong web address (a preview site, an IP address) instead of blaming the person', () => {
        for (const e of [named('SecurityError'), coded('ERROR_INVALID_RP_ID'), coded('ERROR_INVALID_DOMAIN')]) {
            expect(describePasskeyError(e, 'sign in')).toMatchObject({ code: 'passkey_site', message: expect.stringContaining('web address') });
        }
    });

    it('falls back to a calm sentence for anything else, even a thrown string', () => {
        expect(describePasskeyError(new Error('boom'), 'sign in')).toMatchObject({ code: 'passkey_error', message: 'The passkey did not work. Please try again, or use your password.' });
        expect(describePasskeyError('weird', 'add').code).toBe('passkey_error');
        expect(describePasskeyError(undefined, 'add').code).toBe('passkey_error');
    });
});
