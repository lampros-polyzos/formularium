import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DueCheckRow from './DueCheckRow';
import ObservationHelp from './ObservationHelp';
import { BATCHES_CHANGED } from '../hooks/useDueChecks';
import { isoDate } from '../lib/batches';
import { searchLearn } from '../content/search';
import { OBSERVATIONS } from '../types/batches';

const mocks = vi.hoisted(() => ({ completeCheck: vi.fn() }));

vi.mock('../lib/batches', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../lib/batches')>()),
    completeCheck: mocks.completeCheck,
}));

const day = (offset: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return isoDate(d);
};
const batch = { id: 'b1', name: 'Day Cream', lot_number: '261108-1', target_ph: 5.5 };
const check = (offset = 0) => ({ id: 'c1', label: '1 week', due_on: day(offset) });

const onAnswered = vi.fn();
const changed = vi.fn();

function renderRow(due = check()) {
    return render(
        <MemoryRouter>
            <ul><DueCheckRow batch={batch} check={due} onAnswered={onAnswered} /></ul>
        </MemoryRouter>
    );
}

beforeEach(() => {
    mocks.completeCheck.mockReset().mockResolvedValue(undefined);
    onAnswered.mockReset();
    changed.mockReset();
    window.addEventListener(BATCHES_CHANGED, changed);
});
afterEach(() => {
    window.removeEventListener(BATCHES_CHANGED, changed);
    cleanup();
});

describe('answering a check-in that is due', () => {
    it('asks "how does it look?" and says which batch and check it is, with a link to the batch', () => {
        renderRow();
        expect(screen.getByText('How does it look?')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /Day Cream/ })).toHaveAttribute('href', '/batches/b1');
        expect(screen.getByText(/1 week check/)).toBeInTheDocument();
        expect(screen.getByText('due today')).toBeInTheDocument();
    });

    it('says how late it is', () => {
        renderRow(check(-3));
        expect(screen.getByText('3 days overdue')).toBeInTheDocument();
    });

    it('saves "Looks good" with a single tap, and tells the rest of the app', async () => {
        renderRow();
        fireEvent.click(screen.getByRole('button', { name: 'Looks good' }));
        await waitFor(() => expect(onAnswered).toHaveBeenCalledTimes(1));
        expect(mocks.completeCheck).toHaveBeenCalledTimes(1);
        expect(mocks.completeCheck).toHaveBeenCalledWith('c1', { result: 'good', observations: [], measured_ph: null, notes: '' });
        expect(changed).toHaveBeenCalled(); // so the badge and other lists update
    });

    it('cannot be tapped twice while it is saving', async () => {
        let finish!: () => void;
        mocks.completeCheck.mockReturnValue(new Promise<void>(resolve => { finish = resolve; }));
        renderRow();
        fireEvent.click(screen.getByRole('button', { name: 'Looks good' }));
        expect(await screen.findByRole('button', { name: 'Saving...' })).toBeDisabled();
        expect(screen.getByRole('button', { name: /Something's changed/ })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'A problem' })).toBeDisabled();
        await act(async () => { finish(); });
        expect(mocks.completeCheck).toHaveBeenCalledTimes(1);
    });

    it('says so, and lets you try again, if saving fails', async () => {
        mocks.completeCheck.mockRejectedValueOnce(new Error("Couldn't reach the server."));
        renderRow();
        fireEvent.click(screen.getByRole('button', { name: 'Looks good' }));
        expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't reach the server.");
        expect(onAnswered).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Looks good' }));
        await waitFor(() => expect(onAnswered).toHaveBeenCalledTimes(1));
    });

    it('"Something\'s changed" opens the details with a minor change selected, and saves nothing yet', () => {
        renderRow();
        fireEvent.click(screen.getByRole('button', { name: /Something's changed/ }));
        expect(screen.getByRole('radio', { name: 'Minor change' })).toBeChecked();
        expect(screen.getByText('Anything you noticed?')).toBeInTheDocument();
        expect(mocks.completeCheck).not.toHaveBeenCalled();
    });

    it('"A problem" opens the details with failed selected', () => {
        renderRow();
        fireEvent.click(screen.getByRole('button', { name: 'A problem' }));
        expect(screen.getByRole('radio', { name: 'Failed' })).toBeChecked();
    });

    it('records what was noticed, and points to why it happens', async () => {
        renderRow();
        fireEvent.click(screen.getByRole('button', { name: /Something's changed/ }));
        fireEvent.click(screen.getByLabelText('Separation or oil on top'));
        expect(screen.getByRole('link', { name: /Why: separation or oil on top/ })).toHaveAttribute('href', '/learn?q=separates');

        fireEvent.change(screen.getByPlaceholderText(/texture, smell/), { target: { value: 'oil on top after a week' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save check-in' }));
        await waitFor(() => expect(onAnswered).toHaveBeenCalled());
        expect(mocks.completeCheck).toHaveBeenCalledWith('c1', { result: 'minor', observations: ['separation'], measured_ph: null, notes: 'oil on top after a week' });
        expect(changed).toHaveBeenCalled();
    });

    it('goes back to the quick answers on cancel, saving nothing', () => {
        renderRow();
        fireEvent.click(screen.getByRole('button', { name: 'A problem' }));
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(screen.getByRole('button', { name: 'Looks good' })).toBeInTheDocument();
        expect(mocks.completeCheck).not.toHaveBeenCalled();
    });
});

describe('"why does this happen?" links', () => {
    const inRouter = (ids: string[]) => render(<MemoryRouter><ObservationHelp observations={ids} /></MemoryRouter>);

    it('lead to something for everything the form can record: no dead ends', () => {
        for (const observation of OBSERVATIONS) {
            const found = searchLearn(observation.learn);
            expect(found.troubleshooting.length, `Learn has nothing for "${observation.learn}" (${observation.id})`).toBeGreaterThan(0);
        }
    });

    it('link each noticed thing to the Learn hub search', () => {
        inRouter(['mold', 'ph-drift']);
        expect(screen.getByRole('link', { name: /mold, spots or fuzz/i })).toHaveAttribute('href', '/learn?q=mold');
        expect(screen.getByRole('link', { name: /ph drifted/i })).toHaveAttribute('href', '/learn?q=ph%20changed');
    });

    it('show nothing when nothing was noticed, or for something unknown', () => {
        const { container } = inRouter([]);
        expect(container).toBeEmptyDOMElement();
        cleanup();
        const unknown = inRouter(['something-new']);
        expect(unknown.container).toBeEmptyDOMElement();
    });
});
