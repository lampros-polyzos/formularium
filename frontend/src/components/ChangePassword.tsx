import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { changePassword } from '../lib/passwordClient';

const MIN_LENGTH = 10;

/**
 * "Password" in the settings: change it while signed in. The current password is asked for, so nobody who only borrows an open session can take the account over,
 * and the new one follows the sign-up rules (the server also refuses a password that is known from a data breach). Every other device is signed out; this one stays.
 * An account that only uses Google has no password to change, so it is pointed to the email route instead of shown a form.
 */
export default function ChangePassword() {
    const { user } = useAuth();
    const [current, setCurrent] = useState('');
    const [next, setNext] = useState('');
    const [again, setAgain] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [done, setDone] = useState(false);

    if (!user) return null;

    const field = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#2c4c3b] outline-none';
    const primary = 'px-4 py-2 text-sm font-medium rounded-lg bg-[#2c4c3b] text-white hover:bg-[#1f382a] transition-colors disabled:opacity-50';
    const heading = <h4 className="font-semibold text-[#1f382a] border-b border-gray-100 pb-2 mb-3">Password</h4>;

    if (user.hasPassword === false) {
        return (
            <div>
                {heading}
                <p className="text-xs text-gray-500">
                    You sign in with Google, so there is no password to change. To also be able to sign in with a password, choose &quot;Forgot your password?&quot; on the sign-in form: we email you a link to set one.
                </p>
            </div>
        );
    }

    const mismatch = again.length > 0 && next !== again;
    const ready = current.length > 0 && next.length >= MIN_LENGTH && next === again;

    const submit = async () => {
        setBusy(true);
        setError(null);
        setDone(false);
        try {
            await changePassword({ currentPassword: current, newPassword: next });
            setCurrent('');
            setNext('');
            setAgain('');
            setDone(true);
        } catch (e) {
            setError(e instanceof Error && e.message ? e.message : 'The password could not be changed. Please try again.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div>
            {heading}
            <p className="text-xs text-gray-500 mb-3">
                Choose a new password. Your other devices will be signed out, and this one stays signed in. We also email you a notice, so a change that was not yours does not go unnoticed.
            </p>
            <form onSubmit={e => { e.preventDefault(); if (ready && !busy) void submit(); }}>
                <label htmlFor="current-password" className="block text-sm font-medium text-gray-700 mb-1">Current password</label>
                <input id="current-password" type="password" autoComplete="current-password" maxLength={72} className={field} value={current} onChange={e => { setCurrent(e.target.value); setDone(false); }} />

                <label htmlFor="new-password" className="block text-sm font-medium text-gray-700 mt-3 mb-1">New password</label>
                <input id="new-password" type="password" autoComplete="new-password" minLength={MIN_LENGTH} maxLength={72} className={field} value={next} onChange={e => { setNext(e.target.value); setDone(false); }} aria-describedby="new-password-hint" />
                <p id="new-password-hint" className="text-xs text-gray-500 mt-1">At least {MIN_LENGTH} characters. A password that has appeared in a known data breach is refused.</p>

                <label htmlFor="repeat-password" className="block text-sm font-medium text-gray-700 mt-3 mb-1">Repeat the new password</label>
                <input id="repeat-password" type="password" autoComplete="new-password" maxLength={72} className={field} value={again} onChange={e => { setAgain(e.target.value); setDone(false); }} aria-invalid={mismatch} />
                {mismatch && <p className="text-xs text-red-600 mt-1">The two new passwords are not the same.</p>}

                {error && <p role="alert" className="text-xs text-red-600 mt-2">{error}</p>}
                {done && <p role="status" className="text-xs text-[#2c4c3b] font-medium mt-2">Password changed. Your other devices were signed out, and we emailed you a notice.</p>}
                <button type="submit" className={`${primary} mt-3`} disabled={!ready || busy}>{busy ? 'Changing...' : 'Change password'}</button>
            </form>
        </div>
    );
}
