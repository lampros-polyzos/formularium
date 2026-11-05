import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MakeBatchModal from './MakeBatchModal';

const mocks = vi.hoisted(() => ({
    createBatch: vi.fn(),
    lots: [] as Record<string, unknown>[],
    containers: [] as Record<string, unknown>[],
}));

vi.mock('../lib/batches', () => ({
    createBatch: mocks.createBatch,
    lotNumbersLike: vi.fn().mockResolvedValue(['261103-1']),
}));
// The stash and the containers come from the backend
vi.mock('../lib/libraryApi', () => ({
    fetchStash: () => Promise.resolve(mocks.lots),
    fetchContainers: () => Promise.resolve(mocks.containers),
}));

const rows = [
    { ingredient_id: 'water', name: 'Distilled Water', inci_name: 'Aqua', phase: 'A', percentage: 70 },
    { ingredient_id: 'gly', name: 'Glycerin', inci_name: 'Glycerin', phase: 'A', percentage: 5 },
    { ingredient_id: 'shea', name: 'Shea Butter', inci_name: 'Butyrospermum Parkii Butter', phase: 'B', percentage: 25 },
];
const oilyRows = rows.map(r => ({ ...r, solubility: r.name === 'Shea Butter' ? 'oil' : 'water' }));

const lot = (id: string, ingredient: string, grams: number, price: number | null, expires: string | null = null) =>
    ({ id, ingredient_id: ingredient, amount_left_g: grams, expiration_date: expires, batch_lot_number: id, supplier_name: null, price_per_g: price });

const onCreated = vi.fn();

async function open(overrides: Partial<React.ComponentProps<typeof MakeBatchModal>> = {}) {
    render(
        <MakeBatchModal
            userId="u1" formulationId="f1" formulaName="Day Cream" targetPh={5.5} defaultBatchSizeG={100}
            rows={rows} onClose={vi.fn()} onCreated={onCreated} {...overrides}
        />
    );
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });
}

beforeEach(() => {
    mocks.createBatch.mockReset().mockResolvedValue('batch-1');
    mocks.containers = [];
    onCreated.mockReset();
});
afterEach(cleanup);

describe('MakeBatchModal: what it costs', () => {
    // 100 g: water 70 g (500 g in stash at 0.001/g), glycerin 5 g (only 3 g in stash at 0.02/g), shea 25 g (100 g at 0.03/g)
    beforeEach(() => {
        mocks.lots = [lot('w1', 'water', 500, 0.001), lot('g1', 'gly', 3, 0.02), lot('s1', 'shea', 100, 0.03, '2027-01-01')];
    });

    it('shows what the ingredients cost, per 100 g, and marks the part that is an estimate', async () => {
        await open();
        const cost = screen.getByRole('region', { name: 'Cost' });
        // water 0.07 + glycerin (3 g from the lot at 0.02, the other 2 g at your average price) 0.10 + shea 0.75
        expect(cost).toHaveTextContent('About $0.92');
        expect(cost).toHaveTextContent('$0.92 per 100 g');
        expect(cost).toHaveTextContent(/average price/);
    });

    it('shows the cost of each ingredient, with ~ where it is an estimate', async () => {
        await open();
        const row = (name: string) => screen.getByLabelText(`Amount of ${name} in grams`).closest('tr')!;
        expect(row('Distilled Water')).toHaveTextContent('$0.07');
        expect(row('Glycerin')).toHaveTextContent('~$0.10');
        expect(row('Shea Butter')).toHaveTextContent('$0.75');
    });

    it('is exact, with no "about", when every gram comes from a priced lot', async () => {
        mocks.lots = [lot('w1', 'water', 500, 0.001), lot('g1', 'gly', 50, 0.02), lot('s1', 'shea', 100, 0.03)];
        await open();
        const cost = screen.getByRole('region', { name: 'Cost' });
        expect(cost).toHaveTextContent('$0.92 for the ingredients');
        expect(cost).not.toHaveTextContent('About');
        expect(cost).toHaveTextContent('Worked out from the prices of the stash lots');
    });

    it('follows the batch size', async () => {
        mocks.lots = [lot('w1', 'water', 5000, 0.001), lot('g1', 'gly', 500, 0.02), lot('s1', 'shea', 1000, 0.03)];
        await open();
        fireEvent.change(screen.getByLabelText(/Batch size/), { target: { value: '200' } });
        expect(screen.getByRole('region', { name: 'Cost' })).toHaveTextContent('$1.84 for the ingredients');
    });

    it('says plainly when there are no prices yet', async () => {
        mocks.lots = [lot('w1', 'water', 500, null), lot('s1', 'shea', 100, null)];
        await open();
        expect(screen.getByRole('region', { name: 'Cost' })).toHaveTextContent(/No prices known yet/);
        expect(screen.getAllByText('no price').length).toBe(3);
    });

    it('warns when only some ingredients have a price', async () => {
        mocks.lots = [lot('w1', 'water', 500, 0.001), lot('s1', 'shea', 100, null)];
        await open();
        expect(screen.getByRole('region', { name: 'Cost' })).toHaveTextContent('2 ingredients have no price yet');
    });

    it('uses the currency it is given', async () => {
        await open({ currency: '€' });
        expect(screen.getByRole('region', { name: 'Cost' })).toHaveTextContent('€0.92');
    });

    it('sends the price to use for grams that are not taken from the stash', async () => {
        await open();
        fireEvent.click(screen.getByLabelText(/Take these amounts out of my stash/));
        fireEvent.click(screen.getByRole('button', { name: 'Start batch (stash unchanged)' }));
        await waitFor(() => expect(onCreated).toHaveBeenCalled());
        const lines = mocks.createBatch.mock.calls[0][0].lines as { name: string; est_price_per_g: number | null }[];
        expect(lines.find(l => l.name === 'Shea Butter')!.est_price_per_g).toBeCloseTo(0.03, 6);
        expect(lines.find(l => l.name === 'Distilled Water')!.est_price_per_g).toBeCloseTo(0.001, 6);
    });

    it('sends no price for an ingredient nothing is known about', async () => {
        mocks.lots = [lot('w1', 'water', 500, 0.001)];
        await open();
        fireEvent.click(screen.getByRole('button', { name: /Start batch/ }));
        await waitFor(() => expect(onCreated).toHaveBeenCalled());
        const lines = mocks.createBatch.mock.calls[0][0].lines as { name: string; est_price_per_g: number | null }[];
        expect(lines.find(l => l.name === 'Shea Butter')!.est_price_per_g).toBeNull();
    });
});

describe('MakeBatchModal: filling containers', () => {
    const bottle = { id: 'c1', name: '50 ml bottle', volume_ml: 50, price_per_unit: 0.8 };

    beforeEach(() => {
        mocks.containers = [bottle, { id: 'c2', name: 'Mystery jar', volume_ml: 0, price_per_unit: 1 }, { id: 'c3', name: 'Jar 100 ml', volume_ml: 100, price_per_unit: null }];
        mocks.lots = [lot('w1', 'water', 5000, 0.001), lot('g1', 'gly', 500, 0.02), lot('s1', 'shea', 1000, 0.03)];
    });

    const pick = (name: string) =>
        fireEvent.change(screen.getByLabelText(/Fill containers/), { target: { value: mocks.containers.find(c => c.name === name)!.id } });

    it('is not offered when you have no containers', async () => {
        mocks.containers = [];
        await open({ rows: oilyRows });
        expect(screen.queryByLabelText(/Fill containers/)).not.toBeInTheDocument();
    });

    it('lists only the containers with a known size', async () => {
        await open({ rows: oilyRows });
        const options = Array.from(screen.getByLabelText(/Fill containers/).querySelectorAll('option')).map(o => o.textContent);
        expect(options).toEqual(['Just use the weight above', '50 ml bottle (50 ml)', 'Jar 100 ml (100 ml)']);
    });

    it('sets the batch size to fill the containers, allowing for how heavy the product is', async () => {
        await open({ rows: oilyRows });
        pick('50 ml bottle');
        fireEvent.change(screen.getByLabelText('How many'), { target: { value: '2' } });
        // 2 x 50 ml x 95% x 0.98 g/ml (a quarter of the formula is oil, which is lighter than water)
        expect(screen.getByLabelText(/Batch size/)).toHaveValue(93.1);
        expect(screen.getByText(/fills about/)).toHaveTextContent('2 containers of 50 ml bottle, assuming 0.98 g per ml');
    });

    it('follows how full you fill them', async () => {
        await open({ rows: oilyRows });
        pick('50 ml bottle');
        fireEvent.change(screen.getByLabelText('Fill to (%)'), { target: { value: '100' } });
        expect(screen.getByLabelText(/Batch size/)).toHaveValue(49);
    });

    it('still lets you type a weight, and says how many containers that fills', async () => {
        await open({ rows: oilyRows });
        pick('50 ml bottle');
        fireEvent.change(screen.getByLabelText(/Batch size/), { target: { value: '140' } });
        expect(screen.getByText(/fills about/)).toHaveTextContent('3.01 containers');
    });

    it('shows what one filled container costs, including the container', async () => {
        await open({ rows: oilyRows });
        pick('50 ml bottle');
        fireEvent.change(screen.getByLabelText('How many'), { target: { value: '2' } });
        // 93.1 g of ingredients is about $0.86, so $0.43 for each bottle's share + $0.80 for the bottle
        expect(screen.getByRole('region', { name: 'Cost' })).toHaveTextContent(/\$1\.2\d per 50 ml bottle including the container/);
    });

    it('treats a container with no price as free', async () => {
        await open({ rows: oilyRows });
        pick('Jar 100 ml');
        expect(screen.getByRole('region', { name: 'Cost' })).toHaveTextContent(/per Jar 100 ml including the container/);
    });

    it('records the container with the batch', async () => {
        await open({ rows: oilyRows });
        pick('50 ml bottle');
        fireEvent.change(screen.getByLabelText('How many'), { target: { value: '2' } });
        fireEvent.click(screen.getByRole('button', { name: /Start batch/ }));
        await waitFor(() => expect(onCreated).toHaveBeenCalled());
        const sent = mocks.createBatch.mock.calls[0][0];
        expect(sent.batchSizeG).toBe(93.1);
        expect(sent.container).toMatchObject({ id: 'c1', name: '50 ml bottle', volume_ml: 50, unit_price: 0.8, density_g_ml: 0.98 });
        expect(sent.container.count).toBeCloseTo(2, 1);
    });

    it('records no container when none was picked', async () => {
        await open({ rows: oilyRows });
        fireEvent.click(screen.getByRole('button', { name: /Start batch/ }));
        await waitFor(() => expect(onCreated).toHaveBeenCalled());
        expect(mocks.createBatch.mock.calls[0][0].container).toBeNull();
    });

    it('goes back to a plain weight when you choose "Just use the weight"', async () => {
        await open({ rows: oilyRows });
        pick('50 ml bottle');
        fireEvent.change(screen.getByLabelText(/Fill containers/), { target: { value: '' } });
        expect(screen.queryByLabelText('How many')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Start batch/ }));
        await waitFor(() => expect(onCreated).toHaveBeenCalled());
        expect(mocks.createBatch.mock.calls[0][0].container).toBeNull();
    });
});
