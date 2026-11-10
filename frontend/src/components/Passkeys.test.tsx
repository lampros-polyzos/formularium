import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Passkeys from './Passkeys';
import { ApiError } from '../lib/apiClient';
import type { PasskeyStatus } from '../lib/passkeyClient';

const mocks = vi.hoisted(() => ({ fetchPasskeys: vi.fn(), addPasskey: vi.fn(), removePasskey: vi.fn(), setPasswordSignIn: vi.fn(), supported: true }));

vi.mock('../lib/passkeyClient', () => ({ fetchPasskeys: mocks.fetchPasskeys, addPasskey: mocks.addPasskey, removePasskey: mocks.removePasskey, setPasswordSignIn: mocks.setPasswordSignIn }));
vi.mock('@simplewebauthn/browser', () => ({ browserSupportsWebAuthn: () => mocks.supported }));

const PHONE = { id: 'p1', name: 'My phone', createdAt: '2026-11-03T10:00:00Z', lastUsedAt: '2026-11-09T08:00:00Z', synced: true };
const KEY = { id: 'p2', name: 'Security key', createdAt: '2026-11-05T10:00:00Z', lastUsedAt: null, synced: false };

const status = (over: Partial<PasskeyStatus> = {}): PasskeyStatus => ({ available: true, needsPassword: true, passwordSignInOn: true, hasUsedPasskey: false, passkeys: [], ...over });

beforeEach(() => {
    mocks.supported = true;
    mocks.fetchPasskeys.mockReset().mockResolvedValue(status());
    mocks.addPasskey.mockReset().mockResolvedValue(PHONE);
    mocks.removePasskey.mockReset().mockResolvedValue(undefined);
    mocks.setPasswordSignIn.mockReset().mockResolvedValue(undefined);
});
afterEach(cleanup);

const loaded = async () => { render(<Passkeys />); return screen.findByRole('heading', { name: 'Passkeys' }); };

describe('the Passkeys section of the settings', () => {
    it('is not shown when the server has passkeys switched off, or its state cannot be read', async () => {
        mocks.fetchPasskeys.mockResolvedValue(status({ available: false }));
        const { container, unmount } = render(<Passkeys />);
        await waitFor(() => expect(mocks.fetchPasskeys).toHaveBeenCalled());
        expect(container).toBeEmptyDOMElement();
        unmount();

        mocks.fetchPasskeys.mockRejectedValue(new Error('down'));
        const again = render(<Passkeys />);
        await waitFor(() => expect(mocks.fetchPasskeys).toHaveBeenCalledTimes(2));
        expect(again.container).toBeEmptyDOMElement();
    });

    it('lists the passkeys with when they were added and last used, and marks a synced one', async () => {
        mocks.fetchPasskeys.mockResolvedValue(status({ passkeys: [PHONE, KEY] }));
        await loaded();

        const list = within(screen.getByRole('list', { name: 'Your passkeys' }));
        const [phone, key] = list.getAllByRole('listitem');
        expect(phone).toHaveTextContent('My phone');
        expect(phone).toHaveTextContent('Synced');
        expect(phone).toHaveTextContent(/last used/);
        expect(key).toHaveTextContent('Security key');
        expect(key).not.toHaveTextContent('Synced');
        expect(key).toHaveTextContent('never used');
    });

    it('adds a passkey: a name and the password, then the browser takes over, then the list refreshes', async () => {
        mocks.fetchPasskeys.mockResolvedValueOnce(status()).mockResolvedValueOnce(status({ passkeys: [PHONE] }));
        await loaded();
        fireEvent.click(screen.getByRole('button', { name: 'Add a passkey' }));

        const next = screen.getByRole('button', { name: 'Continue' });
        expect(next).toBeDisabled();   // the password is needed first
        fireEvent.change(screen.getByLabelText('Name this passkey'), { target: { value: '  My phone  ' } });
        fireEvent.change(screen.getByLabelText('Your password'), { target: { value: 'a long password' } });
        expect(next).toBeEnabled();
        fireEvent.click(next);

        await waitFor(() => expect(mocks.addPasskey).toHaveBeenCalledWith({ password: 'a long password', name: 'My phone' }));
        expect(await screen.findByRole('list', { name: 'Your passkeys' })).toHaveTextContent('My phone');
        expect(screen.queryByLabelText('Name this passkey')).not.toBeInTheDocument();   // back to the start
        expect(screen.getByRole('button', { name: 'Add a passkey' })).toBeInTheDocument();
    });

    it('asks no password for an account that has none (Google only), and names a blank one itself', async () => {
        mocks.fetchPasskeys.mockResolvedValue(status({ needsPassword: false }));
        await loaded();
        fireEvent.click(screen.getByRole('button', { name: 'Add a passkey' }));

        expect(screen.queryByLabelText('Your password')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
        await waitFor(() => expect(mocks.addPasskey).toHaveBeenCalledWith({ password: undefined, name: 'My passkey' }));
    });

    it('shows why it failed (a wrong password, a cancelled prompt), keeps the form, and clears everything on Cancel', async () => {
        mocks.addPasskey.mockRejectedValueOnce(new ApiError(401, 'invalid_credentials', 'That password is not right.'));
        await loaded();
        fireEvent.click(screen.getByRole('button', { name: 'Add a passkey' }));
        fireEvent.change(screen.getByLabelText('Name this passkey'), { target: { value: 'Laptop' } });
        fireEvent.change(screen.getByLabelText('Your password'), { target: { value: 'wrong' } });
        fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

        expect(await screen.findByRole('alert')).toHaveTextContent('That password is not right.');
        expect(screen.getByLabelText('Name this passkey')).toHaveValue('Laptop');   // nothing to retype but the password

        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Add a passkey' }));
        expect(screen.getByLabelText('Name this passkey')).toHaveValue('');
        expect(screen.getByLabelText('Your password')).toHaveValue('');
    });

    it('removes a passkey after asking for the password, then refreshes the list', async () => {
        mocks.fetchPasskeys.mockResolvedValueOnce(status({ passkeys: [PHONE, KEY] })).mockResolvedValueOnce(status({ passkeys: [KEY] }));
        await loaded();
        fireEvent.click(screen.getByRole('button', { name: 'Remove My phone' }));

        expect(screen.getByText(/It will no longer sign you in/)).toBeInTheDocument();
        const confirm = screen.getByRole('button', { name: 'Remove' });
        expect(confirm).toBeDisabled();
        fireEvent.change(screen.getByLabelText('Your password'), { target: { value: 'a long password' } });
        fireEvent.click(confirm);

        await waitFor(() => expect(mocks.removePasskey).toHaveBeenCalledWith('p1', 'a long password'));
        await waitFor(() => expect(screen.queryByText('My phone')).not.toBeInTheDocument());
        expect(screen.getByText('Security key')).toBeInTheDocument();
    });

    it('keeps the passkey, and says why, when the password is wrong', async () => {
        mocks.fetchPasskeys.mockResolvedValue(status({ passkeys: [PHONE] }));
        mocks.removePasskey.mockRejectedValueOnce(new ApiError(401, 'invalid_credentials', 'That password is not right.'));
        await loaded();
        fireEvent.click(screen.getByRole('button', { name: 'Remove My phone' }));
        fireEvent.change(screen.getByLabelText('Your password'), { target: { value: 'wrong' } });
        fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

        expect(await screen.findByRole('alert')).toHaveTextContent('That password is not right.');
        expect(within(screen.getByRole('list', { name: 'Your passkeys' })).getByText('My phone')).toBeInTheDocument();   // still there
    });

    it('in a browser without passkey support, explains instead of offering to add, but still lets existing ones be removed', async () => {
        mocks.supported = false;
        mocks.fetchPasskeys.mockResolvedValue(status({ passkeys: [PHONE] }));
        await loaded();

        expect(screen.getByText(/This browser cannot make passkeys/)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Add a passkey' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Remove My phone' })).toBeInTheDocument();
    });
});

describe('the password sign-in switch in the Passkeys section', () => {
    const withProvenPasskey = (over: Partial<PasskeyStatus> = {}) => status({ passkeys: [PHONE], hasUsedPasskey: true, ...over });

    it('is not offered to an account with no passkey, or with no password (Google only)', async () => {
        mocks.fetchPasskeys.mockResolvedValue(status());
        const none = render(<Passkeys />);
        await screen.findByRole('heading', { name: 'Passkeys' });
        expect(screen.queryByText(/Password sign-in is/)).not.toBeInTheDocument();
        none.unmount();

        mocks.fetchPasskeys.mockResolvedValue(withProvenPasskey({ needsPassword: false }));
        render(<Passkeys />);
        await screen.findByRole('heading', { name: 'Passkeys' });
        expect(screen.queryByText(/Password sign-in is/)).not.toBeInTheDocument();
    });

    it('says why it cannot be turned off yet, when no passkey has signed in, and offers no button', async () => {
        mocks.fetchPasskeys.mockResolvedValue(status({ passkeys: [PHONE], hasUsedPasskey: false }));
        await loaded();
        expect(screen.getByText('Password sign-in is on')).toBeInTheDocument();
        expect(screen.getByText(/first sign in once with a passkey so we know it works/)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Turn off password sign-in' })).not.toBeInTheDocument();
    });

    it('turns password sign-in off: the consequences first, then the password, then the state changes and says what happened', async () => {
        mocks.fetchPasskeys.mockResolvedValueOnce(withProvenPasskey()).mockResolvedValueOnce(withProvenPasskey({ passwordSignInOn: false }));
        await loaded();
        fireEvent.click(screen.getByRole('button', { name: 'Turn off password sign-in' }));

        expect(screen.getByText(/Your password will no longer sign anyone in, even the right one/)).toBeInTheDocument();
        expect(screen.getByText(/Your other devices are signed out now/)).toBeInTheDocument();
        expect(screen.getByText(/emails you a link that turns it back on/)).toBeInTheDocument();
        const confirm = screen.getByRole('button', { name: 'Turn off' });
        expect(confirm).toBeDisabled();   // the password first
        fireEvent.change(screen.getByLabelText('Your password'), { target: { value: 'a long password' } });
        fireEvent.click(confirm);

        await waitFor(() => expect(mocks.setPasswordSignIn).toHaveBeenCalledExactlyOnceWith(false, 'a long password'));
        expect(await screen.findByText('Password sign-in is off')).toBeInTheDocument();
        expect(screen.getByRole('status')).toHaveTextContent('Your other devices were signed out');
        expect(screen.getByRole('button', { name: 'Turn password sign-in back on' })).toBeInTheDocument();
        expect(screen.queryByLabelText('Your password')).not.toBeInTheDocument();
    });

    it('while it is off, says how to get back in if every passkey is lost, and turns it back on with the password', async () => {
        mocks.fetchPasskeys.mockResolvedValueOnce(withProvenPasskey({ passwordSignInOn: false })).mockResolvedValueOnce(withProvenPasskey());
        await loaded();
        expect(screen.getByText(/Forgot your password\?/)).toBeInTheDocument();
        expect(screen.getByText(/turns password sign-in back on/)).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Turn password sign-in back on' }));
        fireEvent.change(screen.getByLabelText('Your password'), { target: { value: 'a long password' } });
        fireEvent.click(screen.getByRole('button', { name: 'Turn on' }));

        await waitFor(() => expect(mocks.setPasswordSignIn).toHaveBeenCalledExactlyOnceWith(true, 'a long password'));
        expect(await screen.findByText('Password sign-in is on')).toBeInTheDocument();
        expect(screen.getByRole('status')).toHaveTextContent('Password sign-in is back on.');
    });

    it('shows the server\'s reason, keeps the form, and clears the password on Cancel', async () => {
        mocks.fetchPasskeys.mockResolvedValue(withProvenPasskey());
        mocks.setPasswordSignIn.mockRejectedValueOnce(new ApiError(401, 'invalid_credentials', 'That password is not right.'));
        await loaded();
        fireEvent.click(screen.getByRole('button', { name: 'Turn off password sign-in' }));
        fireEvent.change(screen.getByLabelText('Your password'), { target: { value: 'wrong' } });
        fireEvent.click(screen.getByRole('button', { name: 'Turn off' }));

        expect(await screen.findByRole('alert')).toHaveTextContent('That password is not right.');
        expect(screen.getByText('Turn off')).toBeInTheDocument();   // still on the confirm screen

        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Turn off password sign-in' }));
        expect(screen.getByLabelText('Your password')).toHaveValue('');
    });

    it('is hidden while another form is open, so only one thing is asked at a time', async () => {
        mocks.fetchPasskeys.mockResolvedValue(withProvenPasskey());
        await loaded();
        fireEvent.click(screen.getByRole('button', { name: 'Add a passkey' }));
        expect(screen.queryByText(/Password sign-in is/)).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(screen.getByText('Password sign-in is on')).toBeInTheDocument();
    });

    it('shows the server\'s reason when the last working passkey cannot be removed', async () => {
        mocks.fetchPasskeys.mockResolvedValue(withProvenPasskey({ passwordSignInOn: false }));
        mocks.removePasskey.mockRejectedValueOnce(new ApiError(409, 'last_passkey', 'Password sign-in is turned off, so this passkey is one of the only ways into your account. Turn password sign-in back on before you remove it.'));
        await loaded();
        fireEvent.click(screen.getByRole('button', { name: 'Remove My phone' }));
        fireEvent.change(screen.getByLabelText('Your password'), { target: { value: 'a long password' } });
        fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

        expect(await screen.findByRole('alert')).toHaveTextContent('Turn password sign-in back on before you remove it');
        expect(within(screen.getByRole('list', { name: 'Your passkeys' })).getByText('My phone')).toBeInTheDocument();
    });
});
