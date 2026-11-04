import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BatchDetailPage from './BatchDetailPage';
import PostDetail from './PostDetail';
import BenchMode from '../components/bench/BenchMode';
import { SettingsModal } from '../components/SettingsModal';
import { DialogProvider } from '../contexts/DialogContext';
import type { BatchLine } from '../types/batches';

// What these tests prove: the screens that used the browser's own alert/confirm now ask with the app's dialog.
// The browser's own are replaced with spies that must never be called.

const mocks = vi.hoisted(() => ({
    user: null as { id: string; email: string } | null,
    username: 'Sam' as string | null,
    getBatch: vi.fn(),
    updateBatch: vi.fn(),
    voidBatch: vi.fn(),
    upsertError: null as { message: string } | null,
    post: null as Record<string, unknown> | null,
    ops: [] as string[],
}));

vi.mock('../lib/batches', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../lib/batches')>()),
    getBatch: mocks.getBatch,
    updateBatch: mocks.updateBatch,
    voidBatch: mocks.voidBatch,
    countDueChecks: () => Promise.resolve(0),
}));
vi.mock('../lib/benchAlarm', () => ({ playAlarm: vi.fn(), prepareAlarm: vi.fn() }));
vi.mock('../components/RecipeRatings', () => ({ default: () => null }));
vi.mock('../lib/supabase', () => {
    const builder = (table: string) => {
        const b: Record<string, unknown> = {};
        const state = { op: 'select' };
        for (const m of ['select', 'eq', 'order', 'limit', 'in', 'is']) b[m] = () => b;
        b.delete = () => { state.op = 'delete'; return b; };
        b.upsert = () => { state.op = 'upsert'; return b; };
        b.single = () => Promise.resolve({ data: table === 'community_posts' ? mocks.post : null, error: null });
        b.then = (resolve: (v: unknown) => void) => {
            mocks.ops.push(`${state.op}:${table}`);
            if (state.op === 'upsert') return resolve({ error: mocks.upsertError });
            return resolve({ data: [], error: null });
        };
        return b;
    };
    return { supabase: { auth: { signOut: vi.fn() }, from: builder, channel: () => ({ on: () => ({ subscribe: () => ({}) }) }), removeChannel: vi.fn() } };
});
vi.mock('../contexts/AuthContext', () => ({
    useAuth: () => ({ user: mocks.user, session: null, username: mocks.username, isLoading: false }),
}));
vi.mock('../contexts/SettingsContext', () => ({
    useSettings: () => ({ currency: '$', setCurrency: vi.fn(), dateFormat: 'en-US', setDateFormat: vi.fn(), warningDays: 30, setWarningDays: vi.fn(), formatDate: (d: string) => d }),
}));

const nativeAlert = vi.fn();
const nativeConfirm = vi.fn();
const settle = () => act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });
const dialog = () => screen.queryByRole('dialog') ?? screen.getByRole('alertdialog');

beforeEach(() => {
    localStorage.clear();
    mocks.user = null;
    mocks.username = 'Sam';
    mocks.upsertError = null;
    mocks.post = null;
    mocks.ops = [];
    mocks.getBatch.mockReset();
    mocks.updateBatch.mockReset().mockResolvedValue(undefined);
    mocks.voidBatch.mockReset().mockResolvedValue(undefined);
    nativeAlert.mockReset();
    nativeConfirm.mockReset().mockReturnValue(true);
    vi.stubGlobal('alert', nativeAlert);
    vi.stubGlobal('confirm', nativeConfirm);
    Object.defineProperty(navigator, 'wakeLock', { value: undefined, configurable: true });
    vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    // Whatever happened, the browser's own dialogs were not what asked
    expect(nativeAlert).not.toHaveBeenCalled();
    expect(nativeConfirm).not.toHaveBeenCalled();
});

describe('bench mode: start over', () => {
    const lines: BatchLine[] = [
        { id: 'w', batch_id: 'b1', ingredient_id: 'w', name: 'Water', inci_name: null, phase: 'A', percentage: 90, planned_g: 90, actual_g: 90 },
        { id: 'g', batch_id: 'b1', ingredient_id: 'g', name: 'Glycerin', inci_name: null, phase: 'A', percentage: 10, planned_g: 10, actual_g: 10 },
    ];
    const open = () => render(<DialogProvider><BenchMode batch={{ id: 'b1', name: 'Day Cream', lot_number: 'L1' }} lines={lines} onExit={vi.fn()} /></DialogProvider>);

    it('asks with the app\'s own dialog, and clears everything when confirmed', async () => {
        open();
        fireEvent.click(screen.getByRole('checkbox', { name: /Water/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Start over' }));
        const box = dialog();
        expect(within(box).getByRole('heading', { name: 'Start over?' })).toBeInTheDocument();
        expect(box).toHaveTextContent('clears every tick');
        fireEvent.click(within(box).getByRole('button', { name: 'Start over' }));
        await settle();
        expect(screen.getByRole('checkbox', { name: /Water/ })).toHaveAttribute('aria-checked', 'false');
    });

    it('keeps everything if you cancel', async () => {
        open();
        fireEvent.click(screen.getByRole('checkbox', { name: /Water/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Start over' }));
        fireEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }));
        await settle();
        expect(screen.getByRole('checkbox', { name: /Water/ })).toHaveAttribute('aria-checked', 'true');
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
});

describe('batch page: discarding and undoing', () => {
    const batch = (over: Record<string, unknown> = {}) => ({
        id: 'b1', formulation_id: 'f1', name: 'Day Cream', lot_number: '261108-1', batch_size_g: 100, made_on: '2026-11-08', status: 'active',
        target_ph: 5.5, measured_ph: null, final_weight_g: null, notes: null, stash_deducted: true, created_at: '2026-11-08T10:00:00Z', ...over,
    });
    const open = async (over: Record<string, unknown> = {}) => {
        mocks.getBatch.mockResolvedValue({ batch: batch(over), lines: [], usage: [{ id: 'u', batch_ingredient_id: null, grams: 5, label: 'LOT' }], checks: [] });
        render(
            <MemoryRouter initialEntries={['/batches/b1']}>
                <DialogProvider><Routes><Route path="/batches/:id" element={<BatchDetailPage />} /></Routes></DialogProvider>
            </MemoryRouter>
        );
        await settle();
    };

    it('asks before discarding, naming the action, and does it when confirmed', async () => {
        await open();
        fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
        const box = dialog();
        expect(within(box).getByRole('heading', { name: 'Discard this batch?' })).toBeInTheDocument();
        expect(box).toHaveTextContent('remaining check-ins will stop reminding you');
        expect(mocks.updateBatch).not.toHaveBeenCalled();
        fireEvent.click(within(box).getByRole('button', { name: 'Discard batch' }));
        await waitFor(() => expect(mocks.updateBatch).toHaveBeenCalledWith('b1', { status: 'discarded' }));
    });

    it('does nothing when you change your mind', async () => {
        await open();
        fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
        fireEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }));
        await settle();
        expect(mocks.updateBatch).not.toHaveBeenCalled();
    });

    it('asks before undoing a batch, and says how much stash goes back', async () => {
        await open();
        fireEvent.click(screen.getByRole('button', { name: /Undo batch and restore stash/ }));
        const box = dialog();
        expect(within(box).getByRole('heading', { name: 'Undo this batch?' })).toBeInTheDocument();
        expect(box).toHaveTextContent('5 g will be put back into your stash');
        fireEvent.click(within(box).getByRole('button', { name: 'Undo batch' }));
        await waitFor(() => expect(mocks.voidBatch).toHaveBeenCalledWith('b1'));
    });

    it('asks before marking a batch as never made', async () => {
        await open({ stash_deducted: false });
        fireEvent.click(screen.getByRole('button', { name: 'Mark as never made' }));
        expect(within(dialog()).getByRole('heading', { name: 'Mark as never made?' })).toBeInTheDocument();
    });
});

describe('settings: a name that could not be saved', () => {
    it('says so in the app\'s own dialog, and stays open with what was typed so it can be tried again', async () => {
        mocks.user = { id: 'u1', email: 'sam@example.com' };
        mocks.upsertError = { message: 'permission denied' };
        const onClose = vi.fn();
        render(<DialogProvider><SettingsModal isOpen onClose={onClose} /></DialogProvider>);

        fireEvent.change(screen.getByPlaceholderText(/OrganicChemist99/), { target: { value: 'New Name' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save & Close' }));
        await settle();

        const box = screen.getByRole('alertdialog');
        expect(within(box).getByRole('heading', { name: "Couldn't save your name" })).toBeInTheDocument();
        expect(box).toHaveTextContent('Failed to save display name.');

        fireEvent.click(within(box).getByRole('button', { name: 'Close' }));
        await settle();
        expect(screen.getByPlaceholderText(/OrganicChemist99/)).toHaveValue('New Name'); // still there, still filled in
        expect(screen.getByRole('heading', { name: 'Global Settings' })).toBeInTheDocument();
    });
});

describe('a community post', () => {
    const discussion = (over: Record<string, unknown> = {}) => ({
        id: 'p1', title: 'My question', post_type: 'discussion', author_id: 'author', author_name: 'Kim', write_up: 'Hello', created_at: '2026-11-02', ...over,
    });
    const open = async () => {
        render(
            <MemoryRouter initialEntries={['/community/p1']}>
                <DialogProvider>
                    <Routes>
                        <Route path="/community/:id" element={<PostDetail />} />
                        <Route path="/community" element={<p>THE HUB</p>} />
                    </Routes>
                </DialogProvider>
            </MemoryRouter>
        );
        await settle();
    };

    it('no longer shows vote arrows (there is nowhere to keep votes)', async () => {
        mocks.post = discussion();
        await open();
        expect(screen.queryByTitle('Upvote')).not.toBeInTheDocument();
        expect(screen.queryByTitle('Downvote')).not.toBeInTheDocument();
    });

    it('asks before deleting your own post, naming the action', async () => {
        mocks.user = { id: 'author', email: 'kim@example.com' };
        mocks.post = discussion();
        await open();
        fireEvent.click(screen.getByRole('button', { name: 'Delete Post' }));
        const box = dialog();
        expect(within(box).getByRole('heading', { name: 'Delete this post?' })).toBeInTheDocument();
        expect(box).toHaveTextContent('This cannot be undone');
        expect(mocks.ops).not.toContain('delete:community_posts');

        fireEvent.click(within(box).getByRole('button', { name: 'Delete post' }));
        await waitFor(() => expect(screen.getByText('THE HUB')).toBeInTheDocument());
        expect(mocks.ops).toContain('delete:community_posts');
    });

    it('does not delete the post when you cancel', async () => {
        mocks.user = { id: 'author', email: 'kim@example.com' };
        mocks.post = discussion();
        await open();
        fireEvent.click(screen.getByRole('button', { name: 'Delete Post' }));
        fireEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }));
        await settle();
        expect(mocks.ops).not.toContain('delete:community_posts');
        expect(screen.getByRole('heading', { name: 'My question' })).toBeInTheDocument();
    });
});
