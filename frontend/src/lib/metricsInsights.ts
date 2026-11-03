import { formatMoney } from './batchCost';
import { OBSERVATION_LABELS } from '../types/batches';
import type { Metrics } from './metrics';

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export interface Insight { id: string; tone: 'good' | 'note' | 'warn'; text: string }

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const grams = (g: number) => (g >= 1000 ? `${Number((g / 1000).toFixed(2))} kg` : `${Number(g.toFixed(1))} g`);

/** A few plain sentences about what the numbers say, most useful first. Nothing is said when there is nothing to say. */
export function buildInsights(m: Metrics, currency = '$'): Insight[] {
    const out: Insight[] = [];
    const o = m.overview;

    if (m.activity.streakWeeks >= 2) {
        out.push({ id: 'streak', tone: 'good', text: `You have made something in ${m.activity.streakWeeks} weeks in a row.` });
    } else if (o.daysSinceLast !== null && o.daysSinceLast >= 60) {
        out.push({ id: 'gap', tone: 'note', text: `Your last batch was ${o.daysSinceLast} days ago.` });
    }

    const topIngredient = m.ingredientsByUse[0];
    if (topIngredient && m.batchCount >= 2 && topIngredient.batches >= 2) {
        out.push({ id: 'top-ingredient', tone: 'note', text: `${topIngredient.name} goes into ${topIngredient.batches} of your ${m.batchCount} batches, more than anything else.` });
    }

    if (m.activity.busiestWeekday !== null && m.batchCount >= 5) {
        out.push({ id: 'weekday', tone: 'note', text: `You make most of your batches on ${WEEKDAYS[m.activity.busiestWeekday]}s.` });
    }

    const s = m.stability;
    if (s.goodShare !== null && s.checksDone >= 3) {
        const pct = Math.round(s.goodShare * 100);
        out.push({ id: 'stability', tone: pct >= 80 ? 'good' : 'warn', text: `${pct}% of your stability check-ins say the batch looks good.` });
    }
    if (s.problems[0] && s.problems[0].count >= 2) {
        out.push({ id: 'problem', tone: 'warn', text: `"${OBSERVATION_LABELS[s.problems[0].id] ?? s.problems[0].id}" is the problem you have noted most (${plural(s.problems[0].count, 'time')}).` });
    }

    if (o.discarded > 0) {
        const cost = o.discardedCost > 0 ? ` and ${formatMoney(o.discardedCost, currency)} of ingredients` : '';
        out.push({ id: 'waste', tone: 'warn', text: `${plural(o.discarded, 'batch', 'batches')} had to be thrown away: ${grams(o.discardedGrams)}${cost}.` });
    }

    if (m.favorites.neverUsed.length > 0) {
        out.push({ id: 'favorites', tone: 'note', text: `${plural(m.favorites.neverUsed.length, 'starred ingredient')} ${m.favorites.neverUsed.length === 1 ? 'has' : 'have'} never gone into a batch.` });
    }

    if (m.stash.expired > 0) {
        out.push({ id: 'expired', tone: 'warn', text: `${plural(m.stash.expired, 'lot')} in your stash ${m.stash.expired === 1 ? 'has' : 'have'} expired.` });
    }
    if (m.stash.idleValue > 0) {
        out.push({ id: 'idle', tone: 'note', text: `${formatMoney(m.stash.idleValue, currency)} of your stash has never been used in a batch.` });
    }

    if (o.pricedBatches < o.batches && o.batches > 0) {
        out.push({ id: 'unpriced', tone: 'note', text: `${plural(o.batches - o.pricedBatches, 'batch', 'batches')} had no price information, so ${o.batches - o.pricedBatches === 1 ? 'it is' : 'they are'} missing from the cost figures. Add prices to your stash lots to fix that.` });
    }

    if (m.library.neverMade.length > 0 && m.library.formulas >= 3) {
        out.push({ id: 'never-made', tone: 'note', text: `${plural(m.library.neverMade.length, 'formula')} ${m.library.neverMade.length === 1 ? 'has' : 'have'} never been made into a batch.` });
    }

    return out.slice(0, 6);
}
