import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StashPage from './StashPage';

const mocks = vi.hoisted(() => ({
    items: [] as Record<string, unknown>[],
    saved: [] as { op: 'insert' | 'update'; payload: Record<string, unknown> }[],
    dateFormat: 'en-US',
}));

vi.mock('../lib/supabase', () => {
    const builder = (table: string): Record<string, unknown> => {
        let op: 'select' | 'insert' | 'update' = 'select';
        const b: Record<string, unknown> = {};
        for (const m of ['select', 'eq', 'order', 'or', 'limit', 'in', 'is', 'delete']) b[m] = () => b;
        b.insert = (rows: Record<string, unknown>[]) => { op = 'insert'; mocks.saved.push({ op: 'insert', payload: rows[0] }); return b; };
        b.update = (payload: Record<string, unknown>) => { op = 'update'; mocks.saved.push({ op: 'update', payload }); return b; };
        b.then = (resolve: (v: unknown) => void) => {
            if (op !== 'select') return resolve({ data: null, error: null });
            if (table === 'ingredients') return resolve({ data: [{ id: 'i1', trade_name: 'Shea Butter', inci_name: 'Butyrospermum Parkii Butter', function: 'Butter' }], error: null });
            resolve({ data: table === 'user_stash' ? mocks.items : [], error: null });
        };
        return b;
    };
    return { supabase: { auth: { signOut: vi.fn() }, from: builder, channel: () => ({ on: () => ({ subscribe: () => ({}) }) }), removeChannel: vi.fn() } };
});
vi.mock('../lib/batches', async (importOriginal) => ({ ...(await importOriginal<typeof import('../lib/batches')>()), countDueChecks: () => Promise.resolve(0) }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1', email: 'sam@example.com' }, session: null, username: null, isLoading: false }) }));
vi.mock('../contexts/SettingsContext', () => ({
    useSettings: () => ({
        currency: '$', setCurrency: vi.fn(), dateFormat: mocks.dateFormat, setDateFormat: vi.fn(), warningDays: 30, setWarningDays: vi.fn(),
        formatDate: (d: string | null) => (d ? `full:${d}` : '—'),
    }),
}));

const item = (id: string, expiration_date: string | null) => ({
    id, user_id: 'u1', ingredient_id: 'i1', supplier_name: 'Acme', batch_lot_number: id, amount_left_g: 50, price_per_g: 0.1, expiration_date, notes: null,
    ingredients: { id: 'i1', trade_name: 'Shea Butter', inci_name: 'Butyrospermum Parkii Butter', function: 'Butter' },
});

const renderStash = async () => {
    render(<MemoryRouter><StashPage /></MemoryRouter>);
    await screen.findByPlaceholderText(/Search my stash/);
    if (mocks.items.length > 0) await screen.findAllByText('Shea Butter');
    else await waitFor(() => expect(screen.queryByText(/Loading/)).not.toBeInTheDocument());
};
const rows = () => screen.getAllByRole('row').slice(1);
const expiryBox = () => screen.getByLabelText('Expires (month and year)') as HTMLInputElement;
// The label is not tied to its box in the page, so the box is found next to the label
const amountBox = () => screen.getByText('Amount Left (g)*').nextElementSibling as HTMLInputElement;
const save = () => fireEvent.submit(screen.getByRole('button', { name: 'Save Stock' }).closest('form')!);

beforeEach(() => {
    mocks.saved = [];
    mocks.dateFormat = 'en-US';
    mocks.items = [];
});
afterEach(cleanup);

describe('stash expiry as month and year', () => {
    it('shows a month-end expiry as month and year, in the chosen date style, and an exact date in full', async () => {
        mocks.items = [item('A', '2030-03-31'), item('B', '2030-06-10')];
        await renderStash();
        expect(within(rows()[0]).getByText('03/2030')).toBeInTheDocument();
        expect(within(rows()[1]).getByText('full:2030-06-10')).toBeInTheDocument();
    });

    it('follows the date style from the settings', async () => {
        mocks.dateFormat = 'sv-SE';
        mocks.items = [item('A', '2030-03-31')];
        await renderStash();
        expect(within(rows()[0]).getByText('2030-03')).toBeInTheDocument();
    });

    it('shows a dash when there is no expiry', async () => {
        mocks.items = [item('A', null)];
        await renderStash();
        expect(within(rows()[0]).getByText('—')).toBeInTheDocument();
    });

    it('still marks a lot red once its month has passed, and not before the month ends', async () => {
        const now = new Date();
        const ym = (monthsAhead: number) => { const d = new Date(now.getFullYear(), now.getMonth() + monthsAhead, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
        const end = (m: string) => { const [y, mo] = m.split('-').map(Number); return `${m}-${new Date(y, mo, 0).getDate()}`; };
        mocks.items = [item('PAST', end(ym(-2))), item('THIS', end(ym(0))), item('LATER', end(ym(12)))];
        await renderStash();
        expect(rows()[0].className).toContain('bg-red-50');
        expect(rows()[1].className).not.toContain('bg-red-50'); // this month has not ended
        expect(rows()[2].className).not.toContain('bg-red');
    });

    it('asks for a month and year only, and says the end of the month is used', async () => {
        mocks.items = [item('A', '2030-03-31')];
        await renderStash();
        fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
        expect(expiryBox()).toHaveAttribute('type', 'month');
        expect(screen.queryByLabelText(/Expiration Date/)).not.toBeInTheDocument();
        expect(screen.getByText(/last day of the month is used/)).toBeInTheDocument();
    });

    it('stores the last day of the month when a new month is entered', async () => {
        mocks.items = [item('A', '2030-03-31')];
        await renderStash();
        fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
        expect(expiryBox().value).toBe('2030-03');
        fireEvent.change(expiryBox(), { target: { value: '2032-02' } });
        save();
        await waitFor(() => expect(mocks.saved).toHaveLength(1));
        expect(mocks.saved[0]).toMatchObject({ op: 'update', payload: { expiration_date: '2032-02-29' } }); // a leap year
    });

    it('keeps the exact day of an older lot when its month is not changed', async () => {
        mocks.items = [item('A', '2030-06-10')];
        await renderStash();
        fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
        expect(expiryBox().value).toBe('2030-06');
        save();
        await waitFor(() => expect(mocks.saved).toHaveLength(1));
        expect(mocks.saved[0].payload.expiration_date).toBe('2030-06-10');
    });

    it('moves an older lot to the end of the month only when you choose a different month', async () => {
        mocks.items = [item('A', '2030-06-10')];
        await renderStash();
        fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
        fireEvent.change(expiryBox(), { target: { value: '2030-08' } });
        save();
        await waitFor(() => expect(mocks.saved).toHaveLength(1));
        expect(mocks.saved[0].payload.expiration_date).toBe('2030-08-31');
    });

    it('clears the expiry when the box is emptied', async () => {
        mocks.items = [item('A', '2030-03-31')];
        await renderStash();
        fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
        fireEvent.change(expiryBox(), { target: { value: '' } });
        save();
        await waitFor(() => expect(mocks.saved).toHaveLength(1));
        expect(mocks.saved[0].payload.expiration_date).toBeNull();
    });

    it('adds a new lot with the end of the month it is given', async () => {
        await renderStash();
        fireEvent.change(screen.getByPlaceholderText(/Search global library/), { target: { value: 'shea' } });
        fireEvent.click(await screen.findByText('Butyrospermum Parkii Butter • Butter'));
        expect(expiryBox().value).toBe('');
        fireEvent.change(amountBox(), { target: { value: '100' } });
        fireEvent.change(expiryBox(), { target: { value: '2031-04' } });
        save();
        await waitFor(() => expect(mocks.saved).toHaveLength(1));
        expect(mocks.saved[0]).toMatchObject({ op: 'insert', payload: { ingredient_id: 'i1', amount_left_g: 100, expiration_date: '2031-04-30' } });
    });

    it('adds a lot with no expiry when the box is left empty', async () => {
        await renderStash();
        fireEvent.change(screen.getByPlaceholderText(/Search global library/), { target: { value: 'shea' } });
        fireEvent.click(await screen.findByText('Butyrospermum Parkii Butter • Butter'));
        fireEvent.change(amountBox(), { target: { value: '100' } });
        save();
        await waitFor(() => expect(mocks.saved).toHaveLength(1));
        expect(mocks.saved[0].payload.expiration_date).toBeNull();
    });

    it('lets a browser without a month picker type the month, and refuses to save half of it', async () => {
        await renderStash();
        fireEvent.change(screen.getByPlaceholderText(/Search global library/), { target: { value: 'shea' } });
        fireEvent.click(await screen.findByText('Butyrospermum Parkii Butter • Butter'));
        fireEvent.change(amountBox(), { target: { value: '100' } });

        expiryBox().type = 'text'; // what a browser with no month picker does with the box
        fireEvent.change(expiryBox(), { target: { value: '2031-0' } });
        expect(expiryBox()).toHaveAttribute('aria-invalid', 'true');
        expect(screen.getByText('Type the month and year like 2027-03.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Save Stock' })).toBeDisabled();
        save();
        expect(mocks.saved).toHaveLength(0);

        fireEvent.change(expiryBox(), { target: { value: '2031-04' } });
        expect(expiryBox()).toHaveAttribute('aria-invalid', 'false');
        expect(screen.getByRole('button', { name: 'Save Stock' })).toBeEnabled();
        save();
        await waitFor(() => expect(mocks.saved).toHaveLength(1));
        expect(mocks.saved[0].payload.expiration_date).toBe('2031-04-30');
    });

    it('starts the next lot with an empty box, not the last lot\'s month', async () => {
        mocks.items = [item('A', '2030-03-31')];
        await renderStash();
        fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
        expect(expiryBox().value).toBe('2030-03');
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        fireEvent.change(screen.getByPlaceholderText(/Search global library/), { target: { value: 'shea' } });
        fireEvent.click(await screen.findByText('Butyrospermum Parkii Butter • Butter'));
        expect(expiryBox().value).toBe('');
    });
});
