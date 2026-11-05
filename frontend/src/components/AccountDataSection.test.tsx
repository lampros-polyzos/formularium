import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AccountDataSection from './AccountDataSection';
import { emailMatches } from '../lib/accountData';

const mocks = vi.hoisted(() => ({
    rpc: vi.fn(),
    deleteAccount: vi.fn(),
    leave: vi.fn(),
    download: vi.fn(),
    user: { id: 'u1', email: 'Alice@Example.com' } as { id: string; email: string } | null,
}));

vi.mock('../lib/supabase', () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock('../lib/authClient', () => ({ deleteAccount: mocks.deleteAccount }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: mocks.user, session: null, username: null, isLoading: false }) }));
vi.mock('../lib/accountData', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../lib/accountData')>()),
    leaveAfterDeletion: mocks.leave,
    downloadTextFile: mocks.download,
}));

const settle = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.deleteAccount.mockReset().mockResolvedValue(undefined);
    mocks.leave.mockReset();
    mocks.download.mockReset();
    mocks.user = { id: 'u1', email: 'Alice@Example.com' };
    vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('emailMatches', () => {
    it('ignores case and surrounding spaces, and never matches an empty or missing email', () => {
        expect(emailMatches('  alice@example.COM ', 'Alice@Example.com')).toBe(true);
        expect(emailMatches('bob@example.com', 'alice@example.com')).toBe(false);
        expect(emailMatches('', '')).toBe(false);
        expect(emailMatches('x', undefined)).toBe(false);
    });
});

describe('Download my data', () => {
    it('asks the database for the export and saves it as a dated JSON file', async () => {
        mocks.rpc.mockResolvedValue({ data: { account: { id: 'u1' }, data: { formulations: [] } }, error: null });
        render(<AccountDataSection />);
        fireEvent.click(screen.getByRole('button', { name: 'Download my data' }));
        await settle();

        expect(mocks.rpc).toHaveBeenCalledWith('export_my_data');
        expect(mocks.download).toHaveBeenCalledTimes(1);
        const [filename, text] = mocks.download.mock.calls[0];
        expect(filename).toMatch(/^formularium-data-\d{4}-\d{2}-\d{2}\.json$/);
        expect(JSON.parse(text)).toEqual({ account: { id: 'u1' }, data: { formulations: [] } });
    });

    it('says so, and downloads nothing, if the export fails', async () => {
        mocks.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
        render(<AccountDataSection />);
        fireEvent.click(screen.getByRole('button', { name: 'Download my data' }));
        await settle();

        expect(screen.getByRole('alert')).toHaveTextContent('Could not prepare your data');
        expect(mocks.download).not.toHaveBeenCalled();
        expect(screen.getByRole('button', { name: 'Download my data' })).toBeEnabled();
    });
});

describe('Delete my account', () => {
    const open = () => fireEvent.click(screen.getByRole('button', { name: /Delete my account\.\.\./ }));
    const confirmButton = () => screen.getByRole('button', { name: 'Delete everything' });

    it('asks for confirmation first and deletes nothing yet', () => {
        render(<AccountDataSection />);
        open();
        expect(screen.getByText('Alice@Example.com')).toBeInTheDocument();
        expect(confirmButton()).toBeDisabled();
        expect(mocks.rpc).not.toHaveBeenCalled();
    });

    it('stays disabled until the typed email matches', () => {
        render(<AccountDataSection />);
        open();
        const input = screen.getByLabelText(/Type your email address/);
        fireEvent.change(input, { target: { value: 'alice@exampl' } });
        expect(confirmButton()).toBeDisabled();
        fireEvent.change(input, { target: { value: ' alice@example.com ' } });
        expect(confirmButton()).toBeEnabled();
    });

    it('deletes the account through the backend, forgets the sign-in and leaves the app', async () => {
        render(<AccountDataSection />);
        open();
        fireEvent.change(screen.getByLabelText(/Type your email address/), { target: { value: 'alice@example.com' } });
        fireEvent.click(confirmButton());
        await settle();

        expect(mocks.deleteAccount).toHaveBeenCalledTimes(1);
        expect(mocks.leave).toHaveBeenCalledTimes(1);
    });

    it('keeps the session and says nothing was removed if the deletion fails', async () => {
        mocks.deleteAccount.mockRejectedValue(new Error('foreign key violation'));
        render(<AccountDataSection />);
        open();
        fireEvent.change(screen.getByLabelText(/Type your email address/), { target: { value: 'alice@example.com' } });
        fireEvent.click(confirmButton());
        await settle();

        expect(screen.getByRole('alert')).toHaveTextContent('nothing was removed');
        expect(mocks.leave).not.toHaveBeenCalled();
        expect(confirmButton()).toBeEnabled();
    });

    it('cancel closes the confirmation and forgets what was typed', () => {
        render(<AccountDataSection />);
        open();
        fireEvent.change(screen.getByLabelText(/Type your email address/), { target: { value: 'alice@example.com' } });
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(screen.queryByLabelText(/Type your email address/)).not.toBeInTheDocument();
        open();
        expect(screen.getByLabelText(/Type your email address/)).toHaveValue('');
    });
});

describe('when signed out', () => {
    it('shows nothing', () => {
        mocks.user = null;
        const { container } = render(<AccountDataSection />);
        expect(container).toBeEmptyDOMElement();
    });
});
