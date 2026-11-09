import { useRef, useState } from 'react';
import { Turnstile } from '@marsidev/react-turnstile';
import { useNavigate } from 'react-router-dom';
import { startGuest } from '../lib/authClient';

interface Props {
    /** The look of the button; the text and the behaviour are the same everywhere */
    className?: string;
    /** Called once the demo account is made and signed in, before moving on to the studio (a dialog can close itself here) */
    onStarted?: () => void;
}

/**
 * "Try the demo": one press makes a temporary account, signs in and opens the studio, so a visitor can look around without signing up.
 * The bot check runs only after the press (so the page loads nothing for people who never press it), and is invisible unless Cloudflare wants
 * a challenge solved. A bot check works once, so a failed try asks the widget for a new one.
 */
export default function DemoButton({ className, onStarted }: Props) {
    const navigate = useNavigate();
    const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
    const [phase, setPhase] = useState<'idle' | 'checking' | 'starting'>('idle');
    const [message, setMessage] = useState('');
    const [widgetKey, setWidgetKey] = useState(0);
    const used = useRef(false);

    const begin = async (token: string) => {
        if (used.current) return;
        used.current = true;
        setPhase('starting');
        try {
            await startGuest(token);
            onStarted?.();
            navigate('/studio');
        } catch (error) {
            setMessage(error instanceof Error ? error.message : 'The demo could not be started. Please try again.');
            setPhase('idle');
            used.current = false;
            setWidgetKey(k => k + 1);
        }
    };

    const press = () => {
        setMessage('');
        if (siteKey) setPhase('checking');   // the widget below hands over a token, and the demo starts
        else void begin('');                 // no bot check configured (local development)
    };

    const busy = phase !== 'idle';

    return (
        <span className="inline-flex flex-col items-start gap-2">
            <button type="button" onClick={press} disabled={busy} className={className}>
                {busy ? 'Starting the demo…' : 'Try the demo'}
            </button>
            {phase === 'checking' && siteKey && (
                <Turnstile
                    key={widgetKey}
                    siteKey={siteKey}
                    options={{ appearance: 'interaction-only' }}
                    onSuccess={(token) => { void begin(token); }}
                    onError={() => { setMessage('The bot check could not run. Please try again.'); setPhase('idle'); setWidgetKey(k => k + 1); }}
                />
            )}
            {message && <span role="alert" className="text-sm font-medium text-red-700">{message}</span>}
        </span>
    );
}
