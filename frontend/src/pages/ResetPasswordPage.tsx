import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Beaker } from 'lucide-react';
import { AuthError, resetPassword } from '../lib/authClient';

// Where the link in the password reset email lands.
export default function ResetPasswordPage() {
    const [params] = useSearchParams();
    const token = params.get('token') ?? '';
    const [password, setPassword] = useState('');
    const [again, setAgain] = useState('');
    const [error, setError] = useState(token ? '' : 'This link is incomplete. Open the link from your email again.');
    const [done, setDone] = useState(false);
    const [saving, setSaving] = useState(false);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password !== again) { setError('The two passwords are not the same.'); return; }
        setSaving(true);
        setError('');
        try {
            await resetPassword({ token, password });
            setDone(true);
        } catch (err) {
            setError(err instanceof AuthError ? err.message : 'Could not change your password. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const input = 'w-full px-4 py-3 bg-[#f7f8f6] border border-transparent rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2c4c3b] focus:bg-white transition-colors';

    return (
        <main className="min-h-screen bg-[#f7f8f6] flex items-center justify-center p-6">
            <div className="bg-white w-full max-w-md rounded-[2rem] shadow-xl border border-[#c1d1b9] px-8 py-10">
                <Beaker size={40} className="mx-auto text-[#1f382a] mb-4" aria-hidden />
                <h1 className="text-center text-2xl font-bold text-[#1f382a] mb-6">Choose a new password</h1>
                {done ? (
                    <div className="text-center">
                        <p role="status" className="text-[#3a5a4a] mb-6">Your password was changed. Anywhere you were signed in has been signed out.</p>
                        <Link to="/?signin=1" className="inline-block py-3 px-8 rounded-full text-sm font-bold text-white bg-[#2c4c3b] hover:bg-[#1f382a]">Sign in</Link>
                    </div>
                ) : (
                    <form className="space-y-5" onSubmit={submit}>
                        <div>
                            <label htmlFor="new-password" className="block text-sm font-medium text-gray-700 mb-1">New password</label>
                            <input id="new-password" type="password" required minLength={10} maxLength={72} autoComplete="new-password" className={input} value={password} onChange={e => setPassword(e.target.value)} />
                            <p className="text-xs text-gray-500 mt-1">At least 10 characters.</p>
                        </div>
                        <div>
                            <label htmlFor="new-password-again" className="block text-sm font-medium text-gray-700 mb-1">New password again</label>
                            <input id="new-password-again" type="password" required maxLength={72} autoComplete="new-password" className={input} value={again} onChange={e => setAgain(e.target.value)} />
                        </div>
                        {error && <div role="alert" className="text-sm font-medium p-3 rounded-xl bg-red-50 text-red-700">{error}</div>}
                        <button type="submit" disabled={saving || !token} className="w-full py-3.5 px-4 rounded-full text-sm font-bold text-white bg-[#2c4c3b] hover:bg-[#1f382a] disabled:opacity-50 transition-colors">
                            {saving ? 'Saving...' : 'Change password'}
                        </button>
                        <Link to="/?signin=1" className="block text-center text-sm font-medium text-[#3a5a4a] hover:text-[#1f382a]">Back to sign in</Link>
                    </form>
                )}
            </div>
        </main>
    );
}
