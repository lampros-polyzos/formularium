import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FormulaHistoryPage from './FormulaHistoryPage';
import type { FormulaVersion, VersionLine } from '../lib/formulaVersions';

const mocks = vi.hoisted(() => ({
    state: { value: { status: 'loading' } as unknown },
    reload: vi.fn(),
    restore: vi.fn(),
    remove: vi.fn(),
    confirm: vi.fn(),
    alert: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({ supabase: {} }));
vi.mock('../hooks/useFormulaHistory', () => ({ useFormulaHistory: () => ({ state: mocks.state.value, reload: mocks.reload }) }));
vi.mock('../lib/restoreVersion', () => ({ restoreVersion: (...a: unknown[]) => mocks.restore(...a) }));
vi.mock('../lib/formulaVersions', async (orig) => ({ ...(await orig<typeof import('../lib/formulaVersions')>()), deleteVersion: (...a: unknown[]) => mocks.remove(...a) }));
vi.mock('../hooks/useDialog', () => ({ useDialog: () => ({ alert: mocks.alert, confirm: mocks.confirm }) }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('../contexts/SettingsContext', () => ({ useSettings: () => ({ formatDate: (d: string | null) => (d ? `on ${d.slice(0, 10)}` : '—') }) }));
vi.mock('../components/StudioLayout', () => ({ default: ({ children, title }: { children: React.ReactNode; title: string }) => <div><h1>{title}</h1>{children}</div> }));

const line = (id: string, percentage: number, phase = 'A'): VersionLine => ({ ingredient_id: id, inci_name: id.toUpperCase(), trade_name: id, phase, percentage, is_qs: false });
const version = (n: number | null, lines: VersionLine[], note: string | null = null): FormulaVersion => ({
    id: n === null ? null : `v${n}`, version_number: n, note, name: 'Day Cream', profile_id: 'ow_lotion',
    target_weight_g: 100, target_ph: 5.5, lines, created_at: n === null ? null : `2026-11-0${n}T10:00:00Z`,
});

const V1 = version(1, [line('water', 80), line('shea', 8, 'B'), line('pres', 1, 'C')], 'First draft');
const V2 = version(2, [line('water', 82), line('shea', 6, 'B'), line('pres', 1, 'C')], 'Less shea, it felt greasy');
const CURRENT = version(null, [line('water', 82), line('shea', 6, 'B'), line('pres', 1, 'C'), line('oil', 3, 'B')]);

const ready = (versions: FormulaVersion[], current = CURRENT) => { mocks.state.value = { status: 'ready', current, versions }; };
const renderPage = () => render(
    <MemoryRouter initialEntries={['/studio/f1/history']}>
        <Routes>
            <Route path="/studio/:id/history" element={<FormulaHistoryPage />} />
            <Route path="/studio/:id" element={<p>EDITOR</p>} />
        </Routes>
    </MemoryRouter>,
);
const compare = () => screen.getByRole('region', { name: 'Compare' });
const rowFor = (name: string) => within(compare()).getByRole('cell', { name }).closest('tr') as HTMLElement;

beforeEach(() => {
    mocks.reload.mockReset(); mocks.restore.mockReset().mockResolvedValue(undefined); mocks.remove.mockReset().mockResolvedValue(undefined);
    mocks.confirm.mockReset().mockResolvedValue(true); mocks.alert.mockReset();
});
afterEach(cleanup);

describe('the version history page', () => {
    it('shows loading, then problems with a way to try again', () => {
        mocks.state.value = { status: 'loading' };
        const { unmount } = renderPage();
        expect(screen.getByText(/Loading the history/)).toBeInTheDocument();
        unmount();
        mocks.state.value = { status: 'error', message: 'Could not load the history: boom' };
        renderPage();
        expect(screen.getByRole('alert')).toHaveTextContent('boom');
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
        expect(mocks.reload).toHaveBeenCalled();
    });

    it('explains how to save the first version when there are none', () => {
        ready([]);
        renderPage();
        expect(screen.getByText('No versions saved yet')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Open the formula' })).toHaveAttribute('href', '/studio/f1');
    });

    it('compares the latest version with the formula as it is now, and lists every version with its note', () => {
        ready([V2, V1]);
        renderPage();
        expect(screen.getByRole('heading', { name: 'History: Day Cream' })).toBeInTheDocument();
        const saved = within(screen.getByRole('region', { name: 'Saved versions' }));
        expect(saved.getAllByRole('listitem')).toHaveLength(2);
        expect(saved.getByText('Less shea, it felt greasy')).toBeInTheDocument();
        expect(saved.getByText('First draft')).toBeInTheDocument();

        expect(screen.getByLabelText('From')).toHaveValue('v2');
        expect(screen.getByLabelText('To')).toHaveValue('current');
        expect(screen.getByRole('status')).toHaveTextContent('1 added · 3 unchanged');
        expect(rowFor('oil')).toHaveAttribute('data-change', 'added');
    });

    it('hides what did not change, and shows it on request', () => {
        ready([V2, V1]);
        renderPage();
        expect(within(compare()).queryByRole('cell', { name: 'water' })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Show 3 unchanged ingredients' }));
        expect(within(rowFor('water')).getAllByText('82% · A')).toHaveLength(2); // the same in both versions
    });

    it('compares any two versions, showing the change in each ingredient', () => {
        ready([V2, V1]);
        renderPage();
        fireEvent.change(screen.getByLabelText('From'), { target: { value: 'v1' } });
        fireEvent.change(screen.getByLabelText('To'), { target: { value: 'v2' } });
        expect(screen.getByRole('status')).toHaveTextContent('2 changed · 1 unchanged');
        const shea = rowFor('shea');
        expect(shea).toHaveTextContent('8% · B');
        expect(shea).toHaveTextContent('6% · B');
        expect(shea).toHaveTextContent('−2 pts');
        expect(rowFor('water')).toHaveTextContent('+2 pts');
        expect(compare()).toHaveTextContent('First draft');
        expect(compare()).toHaveTextContent('Less shea, it felt greasy');
    });

    it('asks for two different versions, and says when two are the same', () => {
        ready([V2, V1], { ...CURRENT, lines: V2.lines });
        renderPage();
        expect(screen.getByRole('status')).toHaveTextContent('These two are identical.');
        fireEvent.change(screen.getByLabelText('To'), { target: { value: 'v2' } });
        expect(screen.getByText('Pick two different versions to compare.')).toBeInTheDocument();
    });

    it('shows changes to the details of the formula as well', () => {
        ready([V2], { ...CURRENT, lines: V2.lines, target_ph: 6.5, name: 'Day Cream v3' });
        renderPage();
        const meta = within(screen.getByRole('list', { name: 'Other differences' }));
        expect(meta.getByText(/6.5/)).toBeInTheDocument();
        expect(meta.getByText(/Day Cream v3/)).toBeInTheDocument();
    });

    it('"Compare with current" sets up the comparison for that version', () => {
        ready([V2, V1]);
        renderPage();
        fireEvent.click(within(screen.getByRole('region', { name: 'Saved versions' })).getAllByRole('button', { name: 'Compare with current' })[1]);
        expect(screen.getByLabelText('From')).toHaveValue('v1');
        expect(screen.getByLabelText('To')).toHaveValue('current');
    });

    it('goes back to a version after asking, and opens the formula', async () => {
        ready([V2, V1]);
        renderPage();
        fireEvent.click(screen.getAllByRole('button', { name: 'Go back to this' })[1]);
        await waitFor(() => expect(screen.getByText('EDITOR')).toBeInTheDocument());
        expect(mocks.confirm).toHaveBeenCalledWith(expect.stringContaining('kept as a new version first'), expect.objectContaining({ title: 'Go back to version 1?' }));
        expect(mocks.restore).toHaveBeenCalledWith('f1', 'u1', V1);
    });

    it('does nothing when you decline, and explains when going back fails', async () => {
        ready([V2, V1]);
        renderPage();
        mocks.confirm.mockResolvedValueOnce(false);
        fireEvent.click(screen.getAllByRole('button', { name: 'Go back to this' })[0]);
        await waitFor(() => expect(mocks.confirm).toHaveBeenCalled());
        expect(mocks.restore).not.toHaveBeenCalled();

        mocks.restore.mockRejectedValueOnce(new Error('nope'));
        fireEvent.click(screen.getAllByRole('button', { name: 'Go back to this' })[0]);
        await waitFor(() => expect(mocks.alert).toHaveBeenCalledWith('nope', expect.objectContaining({ tone: 'error' })));
        expect(screen.queryByText('EDITOR')).not.toBeInTheDocument();
    });

    it('deletes a version after asking, then reloads', async () => {
        ready([V2, V1]);
        renderPage();
        fireEvent.click(screen.getByRole('button', { name: 'Delete Version 1' }));
        await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith('v1'));
        expect(mocks.confirm).toHaveBeenCalledWith(expect.stringContaining('cannot be undone'), expect.objectContaining({ tone: 'danger' }));
        await waitFor(() => expect(mocks.reload).toHaveBeenCalled());
    });

    it('keeps a version when you decline to delete it', async () => {
        ready([V2, V1]);
        mocks.confirm.mockResolvedValue(false);
        renderPage();
        fireEvent.click(screen.getByRole('button', { name: 'Delete Version 2' }));
        await waitFor(() => expect(mocks.confirm).toHaveBeenCalled());
        expect(mocks.remove).not.toHaveBeenCalled();
    });
});
