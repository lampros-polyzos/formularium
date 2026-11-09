import { useCallback, useEffect, useState } from 'react';
import { browserSupportsWebAuthn } from '@simplewebauthn/browser';
import { addPasskey, fetchPasskeys, removePasskey, type Passkey, type PasskeyStatus } from '../lib/passkeyClient';

const messageOf = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });

type Step =
    | { name: 'idle' }
    | { name: 'adding' }                    // the name, and the password when the account has one
    | { name: 'removing'; passkey: Passkey };

/**
 * "Passkeys" in the settings: sign in with a fingerprint, face or screen lock instead of a password. A passkey only works on this website's own address, so a
 * look-alike site cannot ask for it. Adding or removing one asks for the password again (when the account has one), so nobody who only borrows an open
 * session can bind their own device.
 * Hidden when the server has passkeys switched off or its state cannot be read.
 */
export default function Passkeys() {
    const [status, setStatus] = useState<PasskeyStatus | null>(null);
    const [step, setStep] = useState<Step>({ name: 'idle' });
    const [name, setName] = useState('');
    const [password, setPassword] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const supported = browserSupportsWebAuthn();

    const reload = useCallback(async () => {
        try {
            setStatus(await fetchPasskeys());
        } catch {
            setStatus(null);   // cannot be read: show nothing rather than a broken section
        }
    }, []);

    useEffect(() => {
        let live = true;
        fetchPasskeys().then(s => { if (live) setStatus(s); }).catch(() => { if (live) setStatus(null); });
        return () => { live = false; };
    }, []);

    if (!status || !status.available) return null;

    const reset = () => {
        setStep({ name: 'idle' });
        setName('');
        setPassword('');
        setError(null);
    };

    const run = async (work: () => Promise<void>, fallback: string) => {
        setBusy(true);
        setError(null);
        try {
            await work();
        } catch (e) {
            setError(messageOf(e, fallback));
        } finally {
            setBusy(false);
        }
    };

    const add = () => run(async () => {
        await addPasskey({ password: status.needsPassword ? password : undefined, name: name.trim() || 'My passkey' });
        reset();
        await reload();
    }, 'Could not add the passkey. Please try again.');

    const remove = (passkey: Passkey) => run(async () => {
        await removePasskey(passkey.id, status.needsPassword ? password : undefined);
        reset();
        await reload();
    }, 'Could not remove the passkey. Please try again.');

    const field = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#2c4c3b] outline-none';
    const primary = 'px-4 py-2 text-sm font-medium rounded-lg bg-[#2c4c3b] text-white hover:bg-[#1f382a] transition-colors disabled:opacity-50';
    const secondary = 'px-4 py-2 text-sm font-medium border border-[#c1d1b9] rounded-lg bg-white text-[#2c4c3b] hover:bg-[#e9eee7] transition-colors disabled:opacity-50';
    const danger = 'px-4 py-2 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50';
    const errorText = error && <p role="alert" className="text-xs text-red-600 mt-2">{error}</p>;

    return (
        <div>
            <h4 className="font-semibold text-[#1f382a] border-b border-gray-100 pb-2 mb-3">Passkeys</h4>
            <p className="text-xs text-gray-500 mb-3">
                Sign in with your fingerprint, face or screen lock instead of a password. A passkey only works on this website&apos;s own address, so a look-alike site cannot trick you into giving it away. Signing in with one also skips the authenticator code.
            </p>

            {status.passkeys.length > 0 && (
                <ul className="mb-3 divide-y divide-gray-100 border border-gray-200 rounded-lg" aria-label="Your passkeys">
                    {status.passkeys.map(p => (
                        <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2">
                            <div className="min-w-0">
                                <p className="text-sm font-medium text-[#1f382a] truncate">{p.name}{p.synced && <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-[#3a5a4a] bg-[#eef2eb] rounded-full px-2 py-0.5">Synced</span>}</p>
                                <p className="text-xs text-gray-500">Added {day(p.createdAt)} · {p.lastUsedAt ? `last used ${day(p.lastUsedAt)}` : 'never used'}</p>
                            </div>
                            {step.name === 'idle' && (
                                <button type="button" className="text-xs font-medium text-red-700 hover:underline shrink-0" aria-label={`Remove ${p.name}`} onClick={() => { setError(null); setStep({ name: 'removing', passkey: p }); }}>Remove</button>
                            )}
                        </li>
                    ))}
                </ul>
            )}

            {step.name === 'idle' && (
                <>
                    {supported
                        ? <button type="button" className={primary} disabled={busy} onClick={() => { setError(null); setStep({ name: 'adding' }); }}>Add a passkey</button>
                        : <p className="text-xs text-gray-500">This browser cannot make passkeys. Use a recent version of Chrome, Edge, Safari or Firefox to add one.</p>}
                    {errorText}
                </>
            )}

            {step.name === 'adding' && (
                <form onSubmit={e => { e.preventDefault(); void add(); }}>
                    <label htmlFor="passkey-name" className="block text-sm font-medium text-gray-700 mb-1">Name this passkey</label>
                    <p className="text-xs text-gray-500 mb-2">So you can tell your devices apart, for example &quot;My phone&quot;.</p>
                    <input id="passkey-name" maxLength={60} className={field} value={name} onChange={e => setName(e.target.value)} placeholder="My phone" />
                    {status.needsPassword && (
                        <div className="mt-3">
                            <label htmlFor="passkey-password" className="block text-sm font-medium text-gray-700 mb-1">Your password</label>
                            <p className="text-xs text-gray-500 mb-2">We ask again so that nobody who only borrows your open session can add a device.</p>
                            <input id="passkey-password" type="password" autoComplete="current-password" required maxLength={72} className={field} value={password} onChange={e => setPassword(e.target.value)} />
                        </div>
                    )}
                    {errorText}
                    <div className="flex gap-2 mt-3">
                        <button type="submit" className={primary} disabled={busy || (status.needsPassword && !password)}>{busy ? 'Waiting for your device...' : 'Continue'}</button>
                        <button type="button" className={secondary} onClick={reset}>Cancel</button>
                    </div>
                </form>
            )}

            {step.name === 'removing' && (
                <form onSubmit={e => { e.preventDefault(); void remove(step.passkey); }}>
                    <p className="text-sm text-gray-700 mb-2">Remove <strong>{step.passkey.name}</strong>? It will no longer sign you in.</p>
                    {status.needsPassword && (
                        <div>
                            <label htmlFor="passkey-remove-password" className="block text-sm font-medium text-gray-700 mb-1">Your password</label>
                            <input id="passkey-remove-password" type="password" autoComplete="current-password" required maxLength={72} className={field} value={password} onChange={e => setPassword(e.target.value)} />
                        </div>
                    )}
                    {errorText}
                    <div className="flex gap-2 mt-3">
                        <button type="submit" className={danger} disabled={busy || (status.needsPassword && !password)}>{busy ? 'Removing...' : 'Remove'}</button>
                        <button type="button" className={secondary} onClick={reset}>Cancel</button>
                    </div>
                </form>
            )}
        </div>
    );
}
