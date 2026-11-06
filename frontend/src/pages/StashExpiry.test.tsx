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

// The stash and the ingredient search come from the backend
vi.mock('../lib/libraryApi', () => ({
    fetchStash: () => Promise.resolve(mocks.items),
    searchIngredients: () => Promise.resolve([{ id: 'i1', trade_name: 'Shea Butter', inci_name: 'Butyrospermum Parkii Butter', function: 'Butter' }]),
    addStashLot: (payload: Record<string, unknown>) => { mocks.saved.push({ op: 'insert', payload }); return Promise.resolve({}); },
    changeStashLot: (_id: string, payload: Record<string, unknown>) => { mocks.saved.push({ op: 'update', payload }); return Promise.resolve({}); },
    deleteStashLot: () => Promise.resolve(),
}));
// The header's notification bell still reads and listens for notifications
vi.mock('../lib/batches', async (importOriginal) => ({ ...(await importOriginal<typeof import('../lib/batches')>()), countDueChecks: () => Promise.resolve(0) }));
// One object every time: a new one on each render would make the page load its stash over and over
const AUTH = vi.hoisted(() => ({ user: { id: 'u1', email: 'sam@example.com' }, session: null, username: null, isLoading: false }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => AUTH }));
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
const openAddForm = async () => {
    fireEvent.change(screen.getByPlaceholderText(/Search global library/), { target: { value: 'shea' } });
    fireEvent.click(await screen.findByText('Butyrospermum Parkii Butter • Butter'));
};
const monthBox = () => screen.getByLabelText('Expiry month') as HTMLSelectElement;
const yearBox = () => screen.getByLabelText('Expiry year') as HTMLSelectElement;
const pick = (month: string, year: string) => {
    fireEvent.change(monthBox(), { target: { value: month } });
    fireEvent.change(yearBox(), { target: { value: year } });
};
const ymFromNow = (months: number) => {
    const d = new Date(new Date().getFullYear(), new Date().getMonth() + months, 1);
    return [String(d.getMonth() + 1).padStart(2, '0'), String(d.getFullYear())];
};
const amountBox = () => screen.getByLabelText('Amount left (g)*') as HTMLInputElement;
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

    it('asks for a month and a year from two lists, with nothing to type', async () => {
        mocks.items = [item('A', '2030-03-31')];
        await renderStash();
        fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
        expect(monthBox().tagName).toBe('SELECT');
        expect(yearBox().tagName).toBe('SELECT');
        expect(monthBox().value).toBe('03');
        expect(yearBox().value).toBe('2030');
        expect(screen.queryByLabelText(/Expiration Date/)).not.toBeInTheDocument();
        expect(screen.getByText('Expires at the end of March 2030.')).toBeInTheDocument();
    });

    it('stores the last day of the month when a new month is picked', async () => {
        mocks.items = [item('A', '2030-03-31')];
        await renderStash();
        fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
        pick('02', '2032');
        save();
        await waitFor(() => expect(mocks.saved).toHaveLength(1));
        expect(mocks.saved[0]).toMatchObject({ op: 'update', payload: { expiration_date: '2032-02-29' } }); // a leap year
    });

    it('keeps the exact day of an older lot when its month is not changed', async () => {
        mocks.items = [item('A', '2030-06-10')];
        await renderStash();
        fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
        expect([monthBox().value, yearBox().value]).toEqual(['06', '2030']);
        save();
        await waitFor(() => expect(mocks.saved).toHaveLength(1));
        expect(mocks.saved[0].payload.expiration_date).toBe('2030-06-10');
    });

    it('moves an older lot to the end of the month only when you choose a different month', async () => {
        mocks.items = [item('A', '2030-06-10')];
        await renderStash();
        fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
        pick('08', '2030');
        save();
        await waitFor(() => expect(mocks.saved).toHaveLength(1));
        expect(mocks.saved[0].payload.expiration_date).toBe('2030-08-31');
    });

    it('clears the expiry with one click on "No expiry"', async () => {
        mocks.items = [item('A', '2030-03-31')];
        await renderStash();
        fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
        fireEvent.click(screen.getByRole('button', { name: 'No expiry' }));
        expect([monthBox().value, yearBox().value]).toEqual(['', '']);
        save();
        await waitFor(() => expect(mocks.saved).toHaveLength(1));
        expect(mocks.saved[0].payload.expiration_date).toBeNull();
    });

    it('offers quick options for the usual shelf lives, counted from this month', async () => {
        await renderStash();
        await openAddForm();
        const options = within(screen.getByRole('group', { name: 'Quick options' }));
        for (const [label, months] of [['6 months', 6], ['1 year', 12], ['2 years', 24], ['3 years', 36]] as const) {
            fireEvent.click(options.getByRole('button', { name: label }));
            const [month, year] = ymFromNow(months);
            expect([monthBox().value, yearBox().value], label).toEqual([month, year]);
            expect(options.getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'true');
        }
    });

    it('stores a quick option as the end of that month', async () => {
        await renderStash();
        await openAddForm();
        fireEvent.change(amountBox(), { target: { value: '100' } });
        fireEvent.click(screen.getByRole('button', { name: '1 year' }));
        save();
        await waitFor(() => expect(mocks.saved).toHaveLength(1));
        const [month, year] = ymFromNow(12);
        const lastDay = new Date(Number(year), Number(month), 0).getDate();
        expect(mocks.saved[0].payload.expiration_date).toBe(`${year}-${month}-${String(lastDay).padStart(2, '0')}`);
    });

    it('fills in the year when only a month is picked: the next time that month comes round', async () => {
        await renderStash();
        await openAddForm();
        const now = new Date();
        const nextYearFor = (month: string) => String(Number(month) >= now.getMonth() + 1 ? now.getFullYear() : now.getFullYear() + 1);
        const upcoming = String(now.getMonth() === 11 ? 12 : now.getMonth() + 2).padStart(2, '0'); // later this year (December in December)
        fireEvent.change(monthBox(), { target: { value: upcoming } });
        expect(yearBox().value).toBe(nextYearFor(upcoming));
        fireEvent.click(screen.getByRole('button', { name: 'No expiry' }));
        const passed = String(now.getMonth() === 0 ? 1 : now.getMonth()).padStart(2, '0'); // last month (January in January)
        fireEvent.change(monthBox(), { target: { value: passed } });
        expect(yearBox().value).toBe(nextYearFor(passed));
    });

    it('adds a new lot with the end of the month it is given', async () => {
        await renderStash();
        await openAddForm();
        expect([monthBox().value, yearBox().value]).toEqual(['', '']);
        fireEvent.change(amountBox(), { target: { value: '100' } });
        const year = String(new Date().getFullYear() + 2);
        pick('04', year);
        save();
        await waitFor(() => expect(mocks.saved).toHaveLength(1));
        expect(mocks.saved[0]).toMatchObject({ op: 'insert', payload: { ingredient_id: 'i1', amount_left_g: 100, expiration_date: `${year}-04-30` } });
    });

    it('adds a lot with no expiry when nothing is chosen', async () => {
        await renderStash();
        await openAddForm();
        fireEvent.change(amountBox(), { target: { value: '100' } });
        save();
        await waitFor(() => expect(mocks.saved).toHaveLength(1));
        expect(mocks.saved[0].payload.expiration_date).toBeNull();
    });

    it('does not save an expiry that is only half chosen, and says what is missing', async () => {
        await renderStash();
        await openAddForm();
        fireEvent.change(amountBox(), { target: { value: '100' } });
        fireEvent.change(yearBox(), { target: { value: String(new Date().getFullYear() + 1) } }); // a year but no month
        expect(screen.getByRole('alert')).toHaveTextContent('Choose both a month and a year.');
        expect(screen.getByRole('button', { name: 'Save Stock' })).toBeDisabled();
        save();
        expect(mocks.saved).toHaveLength(0);

        fireEvent.change(monthBox(), { target: { value: '05' } });
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Save Stock' })).toBeEnabled();
        save();
        await waitFor(() => expect(mocks.saved).toHaveLength(1));
    });

    it("includes the lot's own year in the list even when it is far away", async () => {
        mocks.items = [item('A', '2050-03-31')];
        await renderStash();
        fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
        expect(yearBox().value).toBe('2050');
        expect(within(yearBox()).getByRole('option', { name: '2050' })).toBeInTheDocument();
    });

    it('starts the next lot with an empty box, not the last lot\'s month', async () => {
        mocks.items = [item('A', '2030-03-31')];
        await renderStash();
        fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
        expect([monthBox().value, yearBox().value]).toEqual(['03', '2030']);
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        await openAddForm();
        expect([monthBox().value, yearBox().value]).toEqual(['', '']);
    });
});

describe('the stash dialog', () => {
    it('is a labelled dialog that can be closed with Escape or the close button', async () => {
        mocks.items = [item('A', null)];
        await renderStash();
        fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
        const dialog = screen.getByRole('dialog', { name: 'Edit Stock' });
        expect(dialog).toHaveAttribute('aria-modal', 'true');
        fireEvent.keyDown(dialog, { key: 'Escape' });
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
        fireEvent.click(screen.getByRole('button', { name: 'Close' }));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('stays inside the window: the header and buttons stay put, and the middle scrolls on a small screen', async () => {
        mocks.items = [item('A', null)];
        await renderStash();
        fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
        const dialog = screen.getByRole('dialog');
        expect(dialog.className).toMatch(/max-h-\[92vh\]/);
        expect(dialog.className).toContain('flex-col');
        const middle = dialog.querySelector('.overflow-y-auto')!;
        expect(middle).not.toBeNull();
        expect(middle.contains(monthBox())).toBe(true);
        expect(middle.contains(screen.getByRole('button', { name: 'Save Stock' }))).toBe(false); // the buttons are outside the scrolling part
    });

    it('groups the fields: how much, shelf life, where it came from', async () => {
        mocks.items = [item('A', null)];
        await renderStash();
        fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
        const dialog = within(screen.getByRole('dialog'));
        expect(within(dialog.getByRole('region', { name: 'How much you have' })).getByLabelText('Amount left (g)*')).toBeInTheDocument();
        expect(within(dialog.getByRole('region', { name: 'Shelf life' })).getByLabelText('Expiry month')).toBeInTheDocument();
        const source = within(dialog.getByRole('region', { name: 'Where it came from' }));
        for (const label of ['Supplier', 'Batch / lot number', 'Notes']) expect(source.getByLabelText(label), label).toBeInTheDocument();
    });

    it('labels every field so it can be reached by name', async () => {
        mocks.items = [item('A', null)];
        await renderStash();
        fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
        for (const label of ['Amount left (g)*', 'Total price ($)', 'Expiry month', 'Expiry year', 'Supplier', 'Batch / lot number', 'Notes']) {
            expect(screen.getByLabelText(label), label).toBeInTheDocument();
        }
    });

    it('shows the price per gram in the chosen currency', async () => {
        mocks.items = [item('A', null)];
        await renderStash();
        fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
        fireEvent.change(screen.getByLabelText('Total price ($)'), { target: { value: '10' } });
        expect(screen.getByText('= $0.2000 per gram')).toBeInTheDocument();
    });
});
