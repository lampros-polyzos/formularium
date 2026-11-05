import { useEffect, useRef } from 'react';

/** The part of Google's sign-in library this button uses (https://developers.google.com/identity/gsi/web) */
interface GoogleIdentity {
    accounts: {
        id: {
            initialize: (options: { client_id: string; callback: (response: { credential: string }) => void }) => void;
            renderButton: (element: HTMLElement, options: Record<string, unknown>) => void;
        };
    };
}

declare global {
    interface Window { google?: GoogleIdentity }
}

const SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
let loading: Promise<void> | null = null;

function loadGoogle(): Promise<void> {
    if (window.google) return Promise.resolve();
    loading ??= new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = SCRIPT_SRC;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => { loading = null; reject(new Error('Google sign-in could not be loaded.')); };
        document.head.appendChild(script);
    });
    return loading;
}

interface Props {
    onCredential: (idToken: string) => void;
    onError: (message: string) => void;
}

/**
 * Google's own "Sign in with Google" button. It gives the page an ID token, which the Spring backend checks with Google.
 * Needs VITE_GOOGLE_CLIENT_ID; without it nothing is shown (email sign-in still works).
 */
export default function GoogleSignInButton({ onCredential, onError }: Props) {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
    const holder = useRef<HTMLDivElement>(null);
    const callbacks = useRef({ onCredential, onError });
    useEffect(() => { callbacks.current = { onCredential, onError }; });

    useEffect(() => {
        if (!clientId) return;
        let live = true;
        loadGoogle().then(() => {
            if (!live || !holder.current || !window.google) return;
            window.google.accounts.id.initialize({ client_id: clientId, callback: r => callbacks.current.onCredential(r.credential) });
            window.google.accounts.id.renderButton(holder.current, { type: 'standard', theme: 'outline', size: 'large', text: 'continue_with', shape: 'pill', width: 320 });
        }).catch(e => { if (live) callbacks.current.onError(e.message); });
        return () => { live = false; };
    }, [clientId]);

    if (!clientId) return null;
    return <div ref={holder} className="flex justify-center mb-6 min-h-[44px]" data-testid="google-button" />;
}
