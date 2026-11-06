import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Beaker } from 'lucide-react';
import { AuthError, verifyEmail } from '../lib/authClient';

// Where the link in the confirmation email lands. It uses the link once, then sends the person on to sign in.
export default function VerifyEmailPage() {
    const [params] = useSearchParams();
    const token = params.get('token') ?? '';
    const [state, setState] = useState<{ status: 'working' } | { status: 'done' } | { status: 'failed'; message: string }>(token ? { status: 'working' } : { status: 'failed', message: 'This link is incomplete. Open the link from your email again.' });
    const started = useRef(false);

    useEffect(() => {
        // Once only: a link can be used a single time, and React may run an effect twice in development
        if (!token || started.current) return;
        started.current = true;
        verifyEmail(token)
            .then(() => setState({ status: 'done' }))
            .catch(error => setState({ status: 'failed', message: error instanceof AuthError ? error.message : 'Could not confirm your email. Please try again.' }));
    }, [token]);

    return (
        <main className="min-h-screen bg-[#f7f8f6] flex items-center justify-center p-6">
            <div className="bg-white w-full max-w-md rounded-[2rem] shadow-xl border border-[#c1d1b9] px-8 py-10 text-center">
                <Beaker size={40} className="mx-auto text-[#1f382a] mb-4" aria-hidden />
                <h1 className="text-2xl font-bold text-[#1f382a] mb-3">Confirm your email</h1>
                {state.status === 'working' && <p role="status" className="text-[#3a5a4a]">Confirming...</p>}
                {state.status === 'done' && (
                    <>
                        <p role="status" className="text-[#3a5a4a] mb-6">Your email address is confirmed. You can sign in now.</p>
                        <Link to="/?signin=1" className="inline-block py-3 px-8 rounded-full text-sm font-bold text-white bg-[#2c4c3b] hover:bg-[#1f382a]">Sign in</Link>
                    </>
                )}
                {state.status === 'failed' && (
                    <>
                        <p role="alert" className="text-red-700 mb-6">{state.message}</p>
                        <Link to="/?signin=1" className="text-sm font-medium text-[#2c4c3b] underline">Back to sign in</Link>
                    </>
                )}
            </div>
        </main>
    );
}
