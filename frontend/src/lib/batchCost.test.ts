import { describe, expect, it } from 'vitest';
import { buildPlan, type PlanRow, type StashLot } from './batchPlan';
import { costPerContainer, estimatePricePerG, formatMoney, lineCost, lotPrice, planCost } from './batchCost';
import { containersFilled, describeCount, estimateDensity, sizeForContainers } from './batchContainer';

const lot = (id: string, ingredient_id: string, grams: number | null, price: number | null | undefined, extra: Partial<StashLot> = {}): StashLot =>
    ({ id, ingredient_id, amount_left_g: grams, price_per_g: price, expiration_date: null, ...extra });
const row = (ingredient_id: string, name: string, percentage: number, extra: Partial<PlanRow> = {}): PlanRow =>
    ({ ingredient_id, name, inci_name: name, phase: 'A', percentage, ...extra });

describe('prices', () => {
    it('treats a missing or zero price as "not entered"', () => {
        expect(lotPrice(lot('a', 'g', 10, 0.02))).toBe(0.02);
        expect(lotPrice(lot('a', 'g', 10, 0))).toBeNull();
        expect(lotPrice(lot('a', 'g', 10, null))).toBeNull();
        expect(lotPrice(lot('a', 'g', 10, undefined))).toBeNull();
        expect(lotPrice(undefined)).toBeNull();
    });

    it('estimates an ingredient\'s price from the lots you hold, weighted by how much is left', () => {
        const lots = [lot('a', 'g', 300, 0.01), lot('b', 'g', 100, 0.05), lot('c', 'other', 100, 9)];
        expect(estimatePricePerG('g', lots)).toBeCloseTo((300 * 0.01 + 100 * 0.05) / 400, 6);
    });

    it('ignores unpriced lots, falls back to a plain average for empty lots, and gives nothing when there is no price', () => {
        expect(estimatePricePerG('g', [lot('a', 'g', 100, 0), lot('b', 'g', 100, 0.04)])).toBeCloseTo(0.04, 6);
        expect(estimatePricePerG('g', [lot('a', 'g', 0, 0.02), lot('b', 'g', 0, 0.04)])).toBeCloseTo(0.03, 6);
        expect(estimatePricePerG('g', [lot('a', 'g', 100, null)])).toBeNull();
        expect(estimatePricePerG('g', [])).toBeNull();
        expect(estimatePricePerG(null, [lot('a', 'g', 100, 0.02)])).toBeNull();
    });
});

describe('what a batch line cost (the same rules as the database)', () => {
    const plan = (rows: PlanRow[], lots: StashLot[], useStash = true, size = 100) => buildPlan(rows, size, lots, undefined, useStash);

    it('is the grams taken from a lot times its price, and not an estimate', () => {
        const lots = [lot('a', 'g', 200, 0.02)];
        const [c] = plan([row('g', 'Glycerin', 50)], lots).map(l => lineCost(l, lots));
        expect(c.cost).toBeCloseTo(1, 6);
        expect(c.estimated).toBe(false);
    });

    it('adds up grams taken from lots bought at different prices (the lot that expires first goes first)', () => {
        const lots = [lot('old', 's', 30, 0.01, { expiration_date: '2099-01-01' }), lot('new', 's', 100, 0.03, { expiration_date: '2099-06-01' })];
        const [c] = plan([row('s', 'Shea', 50)], lots).map(l => lineCost(l, lots));
        expect(c.cost).toBeCloseTo(30 * 0.01 + 20 * 0.03, 6);
    });

    it('costs grams not taken from the stash with the estimate, and says so', () => {
        const lots = [lot('a', 'g', 200, 0.03)];
        const [c] = plan([row('g', 'Glycerin', 50)], lots, false).map(l => lineCost(l, lots));
        expect(c.cost).toBeCloseTo(1.5, 6);
        expect(c.estimated).toBe(true);
        expect(c.estimatePerG).toBeCloseTo(0.03, 6);
    });

    it('prices only the part the stash cannot cover with the estimate', () => {
        const lots = [lot('a', 'g', 40, 0.02)];
        const [c] = plan([row('g', 'Glycerin', 50)], lots).map(l => lineCost(l, lots));
        expect(c.cost).toBeCloseTo(40 * 0.02 + 10 * 0.02, 6); // the estimate is this lot's own price
        expect(c.estimated).toBe(true);
    });

    it('has no cost when no price is known anywhere', () => {
        const [c] = plan([row('s', 'Shea', 50)], []).map(l => lineCost(l, []));
        expect(c).toEqual({ cost: null, estimated: false, estimatePerG: null });
    });

    it('treats a lot with no price as unknown and uses the estimate from the other lots', () => {
        const lots = [lot('free', 's', 100, 0), lot('paid', 's', 0, 0.04)];
        const [c] = plan([row('s', 'Shea', 10)], lots).map(l => lineCost(l, lots));
        expect(c.cost).toBeCloseTo(0.4, 6);
        expect(c.estimated).toBe(true);
    });

    it('costs the part the priced lots cannot cover at their average price, and says it is an estimate', () => {
        const lots = [lot('a', 'g', 30, 0.02), lot('b', 'g', 0, null)];
        const [c] = plan([row('g', 'Glycerin', 50)], lots).map(l => lineCost(l, lots));
        expect(c.cost).toBeCloseTo(30 * 0.02 + 20 * 0.02, 6);
        expect(c.estimated).toBe(true);
    });
});

describe('planCost', () => {
    it('totals the priced lines, counts the unpriced ones and gives the cost per 100 g', () => {
        const lots = [lot('a', 'g', 100, 0.02), lot('o', 'o', 100, 0.05)];
        const rows = [row('g', 'Glycerin', 50), row('s', 'Shea', 20), row('o', 'Jojoba', 10)];
        const plan = buildPlan(rows, 200, lots);
        const cost = planCost(plan, lots, 200);
        // glycerin 100 g x 0.02 = 2.00; shea unpriced; jojoba 20 g x 0.05 = 1.00
        expect(cost.total).toBeCloseTo(3, 6);
        expect(cost.unpriced).toBe(1);
        expect(cost.per100g).toBeCloseTo(1.5, 6);
        expect(cost.estimated).toBe(false);
    });

    it('has no total, and no per-100 g figure, when nothing is priced', () => {
        const plan = buildPlan([row('s', 'Shea', 50)], 100, []);
        expect(planCost(plan, [], 100)).toMatchObject({ total: null, per100g: null, unpriced: 1, estimated: false });
    });

    it('follows the batch size', () => {
        const lots = [lot('a', 'g', 1000, 0.02)];
        const rows = [row('g', 'Glycerin', 50)];
        expect(planCost(buildPlan(rows, 100, lots), lots, 100).total).toBeCloseTo(1, 6);
        expect(planCost(buildPlan(rows, 400, lots), lots, 400).total).toBeCloseTo(4, 6);
    });
});

describe('money and per-container cost', () => {
    it('shows small amounts with enough digits to mean something', () => {
        expect(formatMoney(1.5)).toBe('$1.50');
        expect(formatMoney(0.0456)).toBe('$0.046');
        expect(formatMoney(0, '€')).toBe('€0.00');
        expect(formatMoney(12.345, '£')).toBe('£12.35');
    });

    it('adds the container to its share of the batch', () => {
        expect(costPerContainer(6, 4, 0.8)).toEqual({ ingredients: 1.5, containerPrice: 0.8, total: 2.3 });
        expect(costPerContainer(null, 4, 0.8)).toBeNull();
        expect(costPerContainer(6, 0, 0.8)).toBeNull();
    });
});

describe('density and container sizing', () => {
    it('estimates a water-based product as water and an oil-based one as lighter', () => {
        expect(estimateDensity([{ percentage: 100, solubility: 'water' }])).toBe(1);
        expect(estimateDensity([{ percentage: 100, solubility: 'oil' }])).toBe(0.92);
        const lotion = estimateDensity([{ percentage: 70, solubility: 'water' }, { percentage: 30, solubility: 'oil' }]);
        expect(lotion).toBeGreaterThan(0.92);
        expect(lotion).toBeLessThan(1);
        expect(estimateDensity([])).toBe(1);
        expect(estimateDensity([{ percentage: 50 }, { percentage: 50, solubility: null }])).toBe(1);
    });

    it('works out the grams that fill some containers', () => {
        expect(sizeForContainers(50, 1, 100, 1)).toBe(50);
        expect(sizeForContainers(50, 3, 95, 0.97)).toBeCloseTo(138.2, 1);
        expect(sizeForContainers(200, 2, 90, 0.92)).toBeCloseTo(331.2, 1);
    });

    it('never sizes from nonsense', () => {
        expect(sizeForContainers(0, 1, 95, 1)).toBe(0);
        expect(sizeForContainers(50, 0, 95, 1)).toBe(0);
        expect(sizeForContainers(50, 1, 95, 0)).toBe(0);
        expect(sizeForContainers(50, 1, 500, 1)).toBe(50); // a fill level above 100% is treated as full
    });

    it('works out how many containers a batch fills, and agrees with the sizing', () => {
        expect(containersFilled(138.2, 50, 95, 0.97)).toBeCloseTo(3, 1);
        expect(containersFilled(100, 50, 100, 1)).toBe(2);
        expect(containersFilled(0, 50, 95, 1)).toBe(0);
        expect(containersFilled(100, 0, 95, 1)).toBe(0);
        const grams = sizeForContainers(30, 7, 95, 1.02);
        expect(containersFilled(grams, 30, 95, 1.02)).toBeCloseTo(7, 1);
    });

    it('describes a count', () => {
        expect(describeCount(1)).toBe('1 container');
        expect(describeCount(3.4)).toBe('3.4 containers');
        expect(describeCount(2)).toBe('2 containers');
        expect(describeCount(0.5)).toBe('0.5 containers');
    });
});
