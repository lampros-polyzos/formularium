// What went wrong in the browser's own passkey prompt, in words for the person. A leaf module (it imports nothing of ours), so both the sign-in client and the
// settings client can use it.

export interface PasskeyProblem {
    /** Stable, safe to branch on. */
    code: 'passkey_cancelled' | 'passkey_exists' | 'passkey_unsupported' | 'passkey_site' | 'passkey_error';
    message: string;
}

type Action = 'sign in' | 'add';

/**
 * The browser says "NotAllowedError" for a person who pressed Cancel, ran out of time, or has no passkey here, and the library names the other cases.
 * Cancelling is an everyday thing to do, so it gets a calm sentence and no alarm.
 */
export function describePasskeyError(error: unknown, action: Action): PasskeyProblem {
    const name = error instanceof Error ? error.name : '';
    const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code: unknown }).code) : '';
    const doing = action === 'sign in' ? 'The passkey sign-in' : 'Adding the passkey';

    if (name === 'NotAllowedError' || name === 'AbortError' || code === 'ERROR_CEREMONY_ABORTED') {
        return { code: 'passkey_cancelled', message: `${doing} was cancelled or timed out. You can try again.` };
    }
    if (name === 'InvalidStateError' || code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED') {
        return { code: 'passkey_exists', message: 'This device already has a passkey for your account.' };
    }
    if (code === 'ERROR_AUTHENTICATOR_MISSING_USER_VERIFICATION_SUPPORT' || code === 'ERROR_AUTHENTICATOR_MISSING_DISCOVERABLE_CREDENTIAL_SUPPORT' || name === 'NotSupportedError') {
        return { code: 'passkey_unsupported', message: 'This device cannot make or use a passkey. Try your phone, or another device or browser.' };
    }
    if (name === 'SecurityError' || code === 'ERROR_INVALID_RP_ID' || code === 'ERROR_INVALID_DOMAIN') {
        return { code: 'passkey_site', message: 'Passkeys do not work on this web address. Open the site at its normal address and try again.' };
    }
    return { code: 'passkey_error', message: 'The passkey did not work. Please try again, or use your password.' };
}
