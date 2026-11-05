import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MakeBatchModal from './MakeBatchModal';

// Today's lot-number prefix (YYMMDD), so the test does not depend on the day it runs
const TODAY_CODE = vi.hoisted(() => {
    const d = new Date();
    return `${String(d.getFullYear()).slice(-2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
});

const mocks = vi.hoisted(() => ({
    createBatch: vi.fn(),
    lots: [] as Record<string, unknown>[],
    lotError: null as unknown,
    stashReads: 0,
    containers: [] as Record<string, unknown>[],
}));

vi.mock('../lib/batches', () => ({
    createBatch: mocks.createBatch,
    lotNumbersLike: vi.fn().mockResolvedValue([`${TODAY_CODE}-1`]),
}));
// The stash and the containers come from the backend
vi.mock('../lib/libraryApi', () => ({
    fetchStash: () => {
        mocks.stashReads += 1;
        return mocks.lotError ? Promise.reject(mocks.lotError) : Promise.resolve(mocks.lots);
    },
    fetchContainers: () => Promise.resolve(mocks.containers),
}));

const rows = [
    { ingredient_id: 'water', name: 'Distilled Water', inci_name: 'Aqua', phase: 'A', percentage: 70 },
    { ingredient_id: 'gly', name: 'Glycerin', inci_name: 'Glycerin', phase: 'A', percentage: 5 },
    { ingredient_id: 'shea', name: 'Shea Butter', inci_name: 'Butyrospermum Parkii Butter', phase: 'B', percentage: 25 },
];

const lot = (id: string, ingredient: string, grams: number | null, expires: string | null = null, label = id) =>
    ({ id, ingredient_id: ingredient, amount_left_g: grams, expiration_date: expires, batch_lot_number: label, supplier_name: null });

const onClose = vi.fn();
const onCreated = vi.fn();

async function open(overrides: Partial<React.ComponentProps<typeof MakeBatchModal>> = {}) {
    render(
        <MakeBatchModal
            userId="u1" formulationId="f1" formulaName="Day Cream" targetPh={5.5} defaultBatchSizeG={100}
            rows={rows} onClose={onClose} onCreated={onCreated} {...overrides}
        />
    );
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });
}

beforeEach(() => {
    mocks.createBatch.mockReset().mockResolvedValue('batch-1');
    mocks.lots = [lot('w1', 'water', 500), lot('g1', 'gly', 3), lot('s1', 'shea', 100, '2027-01-01', 'SHEA-9')];
    mocks.lotError = null;
    mocks.stashReads = 0;
    mocks.containers = [];
    onClose.mockReset();
    onCreated.mockReset();
});
afterEach(cleanup);

describe('MakeBatchModal: nothing happens until you confirm', () => {
    it('only reads the stash while it is open and changes nothing by itself', async () => {
        await open();
        expect(mocks.stashReads).toBeGreaterThan(0);
        expect(mocks.createBatch).not.toHaveBeenCalled();
        expect(screen.getByText(/Nothing changes in your stash until you press Start batch/)).toBeInTheDocument();
    });

    it('editing amounts, toggling stash use and cancelling never writes anything', async () => {
        await open();
        fireEvent.change(screen.getByLabelText('Amount of Glycerin in grams'), { target: { value: '4' } });
        fireEvent.click(screen.getByLabelText('Take Shea Butter from stash'));
        fireEvent.click(screen.getByLabelText(/Take these amounts out of my stash/));
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

        expect(mocks.createBatch).not.toHaveBeenCalled();
        expect(onClose).toHaveBeenCalled();
        expect(onCreated).not.toHaveBeenCalled();
    });

    it('closes with Escape without writing anything', async () => {
        await open();
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(onClose).toHaveBeenCalled();
        expect(mocks.createBatch).not.toHaveBeenCalled();
    });
});

describe('MakeBatchModal: starting the batch', () => {
    it('shows exactly what will be taken, then sends those allocations when you confirm', async () => {
        await open();
        // 100 g batch: 70 g water (500 in stash), 5 g glycerin (only 3), 25 g shea (100 in stash)
        expect(screen.getByRole('button', { name: /Start batch and use 98 g of stash/ })).toBeInTheDocument();
        expect(screen.getByText(/Will take 98 g from 3 stash lots/)).toBeInTheDocument();
        expect(screen.getByText(/2 g won't be tracked/)).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /Start batch and use 98 g of stash/ }));
        await waitFor(() => expect(onCreated).toHaveBeenCalledWith('batch-1'));

        expect(mocks.createBatch).toHaveBeenCalledTimes(1);
        const sent = mocks.createBatch.mock.calls[0][0];
        expect(sent).toMatchObject({ formulationId: 'f1', name: 'Day Cream', lotNumber: `${TODAY_CODE}-2`, batchSizeG: 100, targetPh: 5.5 });
        const byName = Object.fromEntries(sent.lines.map((l: { name: string }) => [l.name, l]));
        expect(byName['Distilled Water'].allocations).toEqual([{ stash_id: 'w1', grams: 70, label: 'w1' }]);
        expect(byName['Glycerin'].allocations).toEqual([{ stash_id: 'g1', grams: 3, label: 'g1' }]);
        expect(byName['Shea Butter']).toMatchObject({ planned_g: 25, actual_g: 25, allocations: [{ stash_id: 's1', grams: 25, label: 'SHEA-9' }] });
    });

    it('records the batch without touching the stash when "take from my stash" is off', async () => {
        await open();
        fireEvent.click(screen.getByLabelText(/Take these amounts out of my stash/));
        expect(screen.getByText('Your stash will not be changed')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Start batch (stash unchanged)' }));
        await waitFor(() => expect(onCreated).toHaveBeenCalled());
        const sent = mocks.createBatch.mock.calls[0][0];
        expect(sent.lines.every((l: { allocations: unknown[] }) => l.allocations.length === 0)).toBe(true);
    });

    it('lets you skip one ingredient, and use your own weighed amount', async () => {
        await open();
        fireEvent.click(screen.getByLabelText('Take Distilled Water from stash'));
        fireEvent.change(screen.getByLabelText('Amount of Shea Butter in grams'), { target: { value: '30' } });
        fireEvent.click(screen.getByRole('button', { name: /Start batch and use 33 g of stash/ }));
        await waitFor(() => expect(onCreated).toHaveBeenCalled());

        const lines = mocks.createBatch.mock.calls[0][0].lines;
        expect(lines.find((l: { name: string }) => l.name === 'Distilled Water').allocations).toEqual([]);
        expect(lines.find((l: { name: string }) => l.name === 'Shea Butter')).toMatchObject({ planned_g: 25, actual_g: 30 });
    });

    it('scales the amounts when the batch size changes', async () => {
        await open();
        fireEvent.change(screen.getByLabelText('Batch size (g)'), { target: { value: '200' } });
        expect(screen.getByLabelText('Amount of Distilled Water in grams')).toHaveValue(140);
        expect(screen.getByLabelText('Amount of Shea Butter in grams')).toHaveValue(50);
    });

    it('never uses expired stock', async () => {
        mocks.lots = [lot('old', 'water', 500, '2020-01-01')];
        await open();
        expect(screen.getByText(/Only expired stock \(500 g\): not used/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Start batch (stash unchanged)' })).toBeInTheDocument();
    });

    it('explains that nothing is in the stash and still lets you record the batch', async () => {
        mocks.lots = [];
        await open();
        expect(screen.getByText(/None of these ingredients are in your stash/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Start batch (stash unchanged)' })).toBeEnabled();
    });

    it('records the batch if the stash cannot be read', async () => {
        mocks.lotError = { message: 'boom' };
        vi.spyOn(console, 'error').mockImplementation(() => {});
        await open();
        expect(screen.getByText(/Couldn't read your stash/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Start batch (stash unchanged)' })).toBeEnabled();
    });
});

describe('MakeBatchModal: guards', () => {
    it('blocks a formula that does not add up to 100%', async () => {
        await open({ rows: [{ ...rows[0], percentage: 60 }, rows[1], rows[2]] });
        expect(screen.getByRole('alert')).toHaveTextContent(/adds up to 90%, not 100%/);
        expect(screen.getByRole('button', { name: /Start batch/ })).toBeDisabled();
    });

    it('blocks an empty lot number and an empty formula', async () => {
        await open();
        fireEvent.change(screen.getByLabelText('Lot number'), { target: { value: '  ' } });
        expect(screen.getByRole('button', { name: /Start batch/ })).toBeDisabled();
        cleanup();
        await open({ rows: [] });
        expect(screen.getByRole('alert')).toHaveTextContent(/Add ingredients to the formula first/);
    });

    it('shows why a start failed, keeps the window open, and refreshes the stash when it changed', async () => {
        mocks.createBatch.mockRejectedValue(new Error('Not enough Glycerin left in your stash. It may have changed.'));
        await open();
        const readsBefore = mocks.stashReads;
        fireEvent.click(screen.getByRole('button', { name: /Start batch and use/ }));

        expect(await screen.findByText(/Not enough Glycerin left in your stash/)).toBeInTheDocument();
        expect(onCreated).not.toHaveBeenCalled();
        await waitFor(() => expect(mocks.stashReads).toBeGreaterThan(readsBefore));
        expect(screen.getByRole('button', { name: /Start batch/ })).toBeEnabled(); // can try again
    });

    it('cannot be started twice at once', async () => {
        let finish: (id: string) => void = () => {};
        mocks.createBatch.mockReturnValue(new Promise<string>(resolve => { finish = resolve; }));
        await open();
        const button = screen.getByRole('button', { name: /Start batch and use/ });
        fireEvent.click(button);
        fireEvent.click(button);
        expect(mocks.createBatch).toHaveBeenCalledTimes(1);
        await act(async () => { finish('batch-1'); });
        expect(onCreated).toHaveBeenCalledTimes(1);
    });
});
