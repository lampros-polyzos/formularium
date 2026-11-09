import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DemoButton from './DemoButton';
import { AuthError } from '../lib/authClient';

const mocks = vi.hoisted(() => ({ startGuest: vi.fn(), navigate: vi.fn(), widgets: 0, widgetFails: false }));

vi.mock('../lib/authClient', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../lib/authClient')>()),
    startGuest: mocks.startGuest,
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate }));

// Each new widget gives one token (a token works once): 'check-1', 'check-2'... Or fails, when asked to.
vi.mock('@marsidev/react-turnstile', () => ({
    Turnstile: ({ onSuccess, onError }: { onSuccess: (token: string) => void; onError?: () => void }) => {
        const fired = React.useRef(false);
        if (!fired.current) {
            fired.current = true;
            const n = ++mocks.widgets;
            queueMicrotask(() => { if (mocks.widgetFails) onError?.(); else onSuccess(`check-${n}`); });
        }
        return <div data-testid="turnstile" />;
    },
}));

beforeEach(() => {
    mocks.startGuest.mockReset().mockResolvedValue({ id: 'g1', email: 'g@guest.invalid', username: 'guest-1', guest: true });
    mocks.navigate.mockReset();
    mocks.widgets = 0;
    mocks.widgetFails = false;
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'site-key');
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

const press = () => fireEvent.click(screen.getByRole('button', { name: 'Try the demo' }));

describe('the "Try the demo" button', () => {
    it('loads no bot check until it is pressed', () => {
        render(<DemoButton />);
        expect(screen.queryByTestId('turnstile')).not.toBeInTheDocument();
        expect(mocks.widgets).toBe(0);
    });

    it('one press: runs the bot check, starts the demo with its token, and opens the studio', async () => {
        const onStarted = vi.fn();
        render(<DemoButton onStarted={onStarted} />);
        press();

        await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/studio'));
        expect(mocks.startGuest).toHaveBeenCalledExactlyOnceWith('check-1');
        expect(onStarted).toHaveBeenCalledOnce();
    });

    it('shows that it is working, and cannot be pressed twice', async () => {
        let finish: (value: unknown) => void = () => {};
        mocks.startGuest.mockReturnValue(new Promise(resolve => { finish = resolve; }));
        render(<DemoButton />);
        press();

        const working = await screen.findByRole('button', { name: /Starting the demo/ });
        expect(working).toBeDisabled();
        finish({});
        await waitFor(() => expect(mocks.navigate).toHaveBeenCalled());
        expect(mocks.startGuest).toHaveBeenCalledTimes(1);
    });

    it('when the server refuses, says why and can be tried again with a NEW bot check', async () => {
        mocks.startGuest
            .mockRejectedValueOnce(new AuthError('demo_busy', 'The demo is busy right now. Try again in a few minutes, or create a free account.', 503))
            .mockResolvedValueOnce({ id: 'g2', email: 'g2@guest.invalid', username: 'guest-2', guest: true });
        render(<DemoButton />);
        press();

        expect(await screen.findByRole('alert')).toHaveTextContent('The demo is busy right now');
        expect(mocks.navigate).not.toHaveBeenCalled();

        await waitFor(() => expect(screen.getByRole('button', { name: 'Try the demo' })).toBeEnabled());
        press();
        await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/studio'));
        expect(mocks.startGuest.mock.calls.map(c => c[0])).toEqual(['check-1', 'check-2']);   // the first token was used up
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('when the bot check itself fails, says so and starts nothing', async () => {
        mocks.widgetFails = true;
        render(<DemoButton />);
        press();

        expect(await screen.findByRole('alert')).toHaveTextContent('bot check could not run');
        expect(mocks.startGuest).not.toHaveBeenCalled();
        expect(screen.getByRole('button', { name: 'Try the demo' })).toBeEnabled();
    });

    it('without a bot check configured (local development), starts at once with an empty token', async () => {
        vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '');
        render(<DemoButton />);
        press();

        await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/studio'));
        expect(mocks.startGuest).toHaveBeenCalledWith('');
        expect(mocks.widgets).toBe(0);
    });
});
