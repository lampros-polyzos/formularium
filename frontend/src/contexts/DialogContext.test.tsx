import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DialogProvider } from './DialogContext';
import { useDialog } from '../hooks/useDialog';
import type { AlertOptions, ConfirmOptions, DialogApi } from './dialogApi';

let api: DialogApi;
function Grab() {
    const dialog = useDialog();
    useEffect(() => { api = dialog; });
    return null;
}

const mount = () => render(<DialogProvider><Grab /></DialogProvider>);
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

/** Asks, and records what came back, so a test can look at the answer after clicking. */
function ask<T>(start: () => Promise<T>) {
    const out: { done: boolean; value?: T } = { done: false };
    act(() => { void start().then(value => { out.done = true; out.value = value; }); });
    return out;
}
const askConfirm = (message: string, options?: ConfirmOptions) => ask(() => api.confirm(message, options));
const askAlert = (message: string, options?: AlertOptions) => ask(() => api.alert(message, options));

beforeEach(() => { vi.restoreAllMocks(); });
afterEach(cleanup);

describe('alert', () => {
    it('shows the message, and resolves once it is closed', async () => {
        mount();
        const result = askAlert('Your recipe was saved.');
        expect(screen.getByRole('dialog')).toHaveTextContent('Your recipe was saved.');
        expect(result.done).toBe(false);
        fireEvent.click(screen.getByRole('button', { name: 'Close' }));
        await flush();
        expect(result.done).toBe(true);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it.each([
        [undefined, 'Heads up', 'dialog'],
        ['info', 'Heads up', 'dialog'],
        ['success', 'Done', 'dialog'],
        ['error', 'Something went wrong', 'alertdialog'],
    ] as const)('with tone %s has a fitting title', (tone, title, role) => {
        mount();
        askAlert('Message', { tone });
        expect(screen.getByRole(role, { name: title })).toBeInTheDocument();
    });

    it('takes its own title and button label', () => {
        mount();
        askAlert('Message', { title: 'Sign in to vote', closeLabel: 'Got it' });
        expect(screen.getByRole('dialog', { name: 'Sign in to vote' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Got it' })).toBeInTheDocument();
    });

    it('also resolves when dismissed with Escape or a click outside', async () => {
        mount();
        const byEscape = askAlert('One');
        fireEvent.keyDown(window, { key: 'Escape' });
        await flush();
        expect(byEscape.done).toBe(true);

        const byClick = askAlert('Two');
        fireEvent.click(screen.getByRole('dialog').parentElement!);
        await flush();
        expect(byClick.done).toBe(true);
    });
});

describe('confirm', () => {
    it('resolves true when confirmed', async () => {
        mount();
        const result = askConfirm('Delete this post?', { confirmLabel: 'Delete post', tone: 'danger' });
        fireEvent.click(screen.getByRole('button', { name: 'Delete post' }));
        await flush();
        expect(result.value).toBe(true);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('resolves false when cancelled', async () => {
        mount();
        const result = askConfirm('Delete this post?');
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        await flush();
        expect(result.value).toBe(false);
    });

    it('resolves false on Escape and on a click outside: backing out is never a yes', async () => {
        mount();
        const byEscape = askConfirm('Sure?');
        fireEvent.keyDown(window, { key: 'Escape' });
        await flush();
        expect(byEscape.value).toBe(false);

        const byClick = askConfirm('Sure?');
        fireEvent.click(screen.getByRole('dialog').parentElement!);
        await flush();
        expect(byClick.value).toBe(false);
    });

    it('has a sensible default title and button, and takes its own', () => {
        mount();
        askConfirm('Go ahead?');
        expect(screen.getByRole('dialog', { name: 'Are you sure?' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
        cleanup();
        mount();
        askConfirm('Go ahead?', { title: 'Start over?', confirmLabel: 'Start over', cancelLabel: 'Keep going' });
        expect(screen.getByRole('dialog', { name: 'Start over?' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Keep going' })).toBeInTheDocument();
    });

    it('works as a plain condition: if (await confirm(...))', async () => {
        mount();
        let ran = false;
        act(() => { void (async () => { if (await api.confirm('Run it?')) ran = true; })(); });
        fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
        await flush();
        expect(ran).toBe(true);
    });
});

describe('several at once', () => {
    it('shows them one at a time, in the order they were asked', async () => {
        mount();
        const first = askAlert('First message');
        const second = askAlert('Second message');
        expect(screen.getAllByRole('dialog')).toHaveLength(1);
        expect(screen.getByRole('dialog')).toHaveTextContent('First message');

        fireEvent.click(screen.getByRole('button', { name: 'Close' }));
        await flush();
        expect(first.done).toBe(true);
        expect(second.done).toBe(false);
        expect(screen.getByRole('dialog')).toHaveTextContent('Second message');

        fireEvent.click(screen.getByRole('button', { name: 'Close' }));
        await flush();
        expect(second.done).toBe(true);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('makes a question wait for a message that is already showing', async () => {
        mount();
        askAlert('Something happened.');
        const answer = askConfirm('Keep going?');
        expect(screen.getByRole('dialog')).toHaveTextContent('Something happened.');
        fireEvent.click(screen.getByRole('button', { name: 'Close' }));
        await flush();
        expect(screen.getByRole('dialog')).toHaveTextContent('Keep going?');
        fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
        await flush();
        expect(answer.value).toBe(true);
    });
});

describe('the service itself', () => {
    it('hands out the same functions on every render, so effects that use them do not run again', () => {
        const { rerender } = mount();
        const before = api;
        rerender(<DialogProvider><Grab /></DialogProvider>);
        expect(api.alert).toBe(before.alert);
        expect(api.confirm).toBe(before.confirm);
    });

    it('counts a question left open when the app goes away as "no", so nothing waits forever', async () => {
        const { unmount } = mount();
        const answer = askConfirm('Still there?');
        unmount();
        await flush();
        expect(answer.done).toBe(true);
        expect(answer.value).toBe(false);
    });

    it('releases a waiting message too', async () => {
        const { unmount } = mount();
        const message = askAlert('Hello');
        unmount();
        await flush();
        expect(message.done).toBe(true);
    });
});

describe('without the service (an isolated component)', () => {
    function Bare() {
        const dialog = useDialog();
        useEffect(() => { api = dialog; });
        return null;
    }

    it('falls back to the browser\'s own dialogs, so nothing breaks', async () => {
        const alertSpy = vi.fn();
        const confirmSpy = vi.fn().mockReturnValue(true);
        vi.stubGlobal('alert', alertSpy);
        vi.stubGlobal('confirm', confirmSpy);
        render(<Bare />);
        await api.alert('Hello');
        expect(alertSpy).toHaveBeenCalledWith('Hello');
        expect(await api.confirm('Sure?')).toBe(true);
        confirmSpy.mockReturnValue(false);
        expect(await api.confirm('Sure?')).toBe(false);
        vi.unstubAllGlobals();
    });
});
