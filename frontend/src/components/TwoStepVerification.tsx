import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { downloadTextFile } from '../lib/accountData';
import { disableMfa, enableMfa, fetchMfaStatus, newRecoveryCodes, startMfaSetup, type MfaSetup, type MfaStatus } from '../lib/mfaClient';

const messageOf = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);

/** The secret in groups of four, easier to read out and type. */
const grouped = (secret: string) => secret.replace(/(.{4})/g, '$1 ').trim();

type Step =
    | { name: 'idle' }
    | { name: 'password' }                                          // asks for the password before starting
    | { name: 'scan'; setup: MfaSetup; qr: string }                 // the QR code (an SVG address), and the first code to prove it works
    | { name: 'codes'; codes: string[] }                            // the recovery codes, shown once
    | { name: 'confirm'; action: 'off' | 'codes' };                 // a code is needed to turn it off, or to get new recovery codes

/**
 * "Two-step verification" in the settings: set it up with an authenticator app, keep the recovery codes, turn it off.
 * Hidden when the server cannot offer it (no encryption key configured) or when its state cannot be read.
 */
export default function TwoStepVerification() {
    const [status, setStatus] = useState<MfaStatus | null>(null);
    const [step, setStep] = useState<Step>({ name: 'idle' });
    const [password, setPassword] = useState('');
    const [code, setCode] = useState('');
    const [saved, setSaved] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const reload = useCallback(async () => {
        try {
            setStatus(await fetchMfaStatus());
        } catch {
            setStatus(null);   // cannot be read: show nothing rather than a broken section
        }
    }, []);

    useEffect(() => {
        let live = true;
        fetchMfaStatus().then(s => { if (live) setStatus(s); }).catch(() => { if (live) setStatus(null); });
        return () => { live = false; };
    }, []);

    if (!status || !status.available) return null;

    const reset = () => {
        setStep({ name: 'idle' });
        setPassword('');
        setCode('');
        setSaved(false);
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

    const begin = (pw?: string) => run(async () => {
        const setup = await startMfaSetup(pw);
        // Drawn as SVG, not through a canvas: browsers with strict tracking protection (Firefox) scramble canvas pixels, which corrupts a QR code.
        // A vector image also stays sharp at any size, and the generous blank border (margin 4, the standard) is what scanners need.
        const svg = await QRCode.toString(setup.otpauthUri, { type: 'svg', margin: 4, errorCorrectionLevel: 'M' });
        const qr = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
        setPassword('');
        setStep({ name: 'scan', setup, qr });
    }, 'Could not start the setup. Please try again.');

    const turnOn = () => run(async () => {
        const codes = await enableMfa(code.trim());
        setCode('');
        setSaved(false);
        setStep({ name: 'codes', codes });
        await reload();
    }, 'Could not turn on two-step verification.');

    const confirm = (action: 'off' | 'codes') => run(async () => {
        if (action === 'off') {
            await disableMfa(code.trim());
            reset();
            await reload();
        } else {
            const codes = await newRecoveryCodes(code.trim());
            setCode('');
            setSaved(false);
            setStep({ name: 'codes', codes });
            await reload();
        }
    }, 'That did not work. Please try again.');

    const field = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#2c4c3b] outline-none';
    const primary = 'px-4 py-2 text-sm font-medium rounded-lg bg-[#2c4c3b] text-white hover:bg-[#1f382a] transition-colors disabled:opacity-50';
    const secondary = 'px-4 py-2 text-sm font-medium border border-[#c1d1b9] rounded-lg bg-white text-[#2c4c3b] hover:bg-[#e9eee7] transition-colors disabled:opacity-50';
    const errorText = error && <p role="alert" className="text-xs text-red-600 mt-2">{error}</p>;

    return (
        <div>
            <h4 className="font-semibold text-[#1f382a] border-b border-gray-100 pb-2 mb-3">Two-step verification</h4>

            {step.name === 'idle' && !status.enabled && (
                <>
                    <p className="text-xs text-gray-500 mb-2">Add a second lock to your account: after your password, sign-in asks for a 6-digit code from an authenticator app on your phone (Google Authenticator, Authy, 1Password and similar). Strongly recommended.</p>
                    <button type="button" className={primary} disabled={busy} onClick={() => (status.needsPassword ? setStep({ name: 'password' }) : begin())}>
                        Set up two-step verification
                    </button>
                    {errorText}
                </>
            )}

            {step.name === 'password' && (
                <form onSubmit={e => { e.preventDefault(); void begin(password); }}>
                    <label htmlFor="mfa-password" className="block text-sm font-medium text-gray-700 mb-1">Your password</label>
                    <p className="text-xs text-gray-500 mb-2">We ask again so that nobody who only borrows your open session can set this up.</p>
                    <input id="mfa-password" type="password" autoComplete="current-password" required maxLength={72} className={field} value={password} onChange={e => setPassword(e.target.value)} />
                    {errorText}
                    <div className="flex gap-2 mt-3">
                        <button type="submit" className={primary} disabled={busy || !password}>{busy ? 'Checking...' : 'Continue'}</button>
                        <button type="button" className={secondary} onClick={reset}>Cancel</button>
                    </div>
                </form>
            )}

            {step.name === 'scan' && (
                <form onSubmit={e => { e.preventDefault(); void turnOn(); }}>
                    <ol className="text-xs text-gray-600 list-decimal pl-4 space-y-1 mb-3">
                        <li>Open your authenticator app and add an account by scanning this code.</li>
                        <li>Enter the 6-digit code the app shows to finish.</li>
                    </ol>
                    <div className="flex justify-center mb-2">
                        <img src={step.qr} alt="QR code to scan with your authenticator app" width={240} height={240} className="border border-gray-200 rounded-lg bg-white" />
                    </div>
                    <p className="text-xs text-gray-500 text-center mb-3">Cannot scan? Enter this key in the app instead: <span className="font-mono text-gray-800 select-all">{grouped(step.setup.secret)}</span></p>
                    <label htmlFor="mfa-first-code" className="block text-sm font-medium text-gray-700 mb-1">6-digit code</label>
                    <input id="mfa-first-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} required className={field} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} />
                    {errorText}
                    <div className="flex gap-2 mt-3">
                        <button type="submit" className={primary} disabled={busy || code.length !== 6}>{busy ? 'Checking...' : 'Turn on'}</button>
                        <button type="button" className={secondary} onClick={reset}>Cancel</button>
                    </div>
                </form>
            )}

            {step.name === 'codes' && (
                <div>
                    <p className="text-sm font-medium text-[#1f382a] mb-1">Save your recovery codes</p>
                    <p className="text-xs text-gray-500 mb-2">If you lose your phone, each of these codes lets you sign in once. They are shown only now. Keep them somewhere safe, apart from your password.</p>
                    <ul className="grid grid-cols-2 gap-1 font-mono text-sm bg-[#f7f8f6] border border-gray-200 rounded-lg p-3 mb-3" aria-label="Recovery codes">
                        {step.codes.map(c => <li key={c} className="select-all">{c}</li>)}
                    </ul>
                    <div className="flex gap-2 mb-3">
                        <button type="button" className={secondary} onClick={() => void navigator.clipboard?.writeText(step.codes.join('\n'))}>Copy</button>
                        <button type="button" className={secondary} onClick={() => downloadTextFile('formularium-recovery-codes.txt', `Formularium recovery codes\nEach works once.\n\n${step.codes.join('\n')}\n`)}>Download</button>
                    </div>
                    <label className="flex items-start gap-2 text-sm text-gray-700 mb-3">
                        <input type="checkbox" className="mt-0.5" checked={saved} onChange={e => setSaved(e.target.checked)} />
                        I have saved these codes
                    </label>
                    <button type="button" className={primary} disabled={!saved} onClick={reset}>Done</button>
                </div>
            )}

            {step.name === 'idle' && status.enabled && (
                <>
                    <p className="text-sm text-[#1f382a] mb-1"><span aria-hidden>✓ </span>Two-step verification is on.</p>
                    <p className={`text-xs mb-3 ${status.recoveryCodesLeft <= 2 ? 'text-amber-700 font-medium' : 'text-gray-500'}`}>
                        {status.recoveryCodesLeft} recovery {status.recoveryCodesLeft === 1 ? 'code' : 'codes'} left.{status.recoveryCodesLeft <= 2 ? ' Get new ones before you run out.' : ''}
                    </p>
                    <div className="flex flex-wrap gap-2">
                        <button type="button" className={secondary} onClick={() => setStep({ name: 'confirm', action: 'codes' })}>Get new recovery codes</button>
                        <button type="button" className="px-4 py-2 text-sm font-medium border border-red-200 rounded-lg bg-white text-red-700 hover:bg-red-50 transition-colors" onClick={() => setStep({ name: 'confirm', action: 'off' })}>Turn off</button>
                    </div>
                </>
            )}

            {step.name === 'confirm' && (
                <form onSubmit={e => { e.preventDefault(); void confirm(step.action); }}>
                    <label htmlFor="mfa-confirm-code" className="block text-sm font-medium text-gray-700 mb-1">
                        {step.action === 'off' ? 'Enter a code to turn it off' : 'Enter a code to get new recovery codes'}
                    </label>
                    <p className="text-xs text-gray-500 mb-2">The 6-digit code from your app, or one of your recovery codes.</p>
                    <input id="mfa-confirm-code" autoComplete="one-time-code" required maxLength={32} className={field} value={code} onChange={e => setCode(e.target.value)} />
                    {errorText}
                    <div className="flex gap-2 mt-3">
                        <button type="submit" className={step.action === 'off' ? 'px-4 py-2 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50' : primary} disabled={busy || code.trim().length < 6}>
                            {busy ? 'Checking...' : step.action === 'off' ? 'Turn off' : 'Get new codes'}
                        </button>
                        <button type="button" className={secondary} onClick={reset}>Cancel</button>
                    </div>
                </form>
            )}
        </div>
    );
}
