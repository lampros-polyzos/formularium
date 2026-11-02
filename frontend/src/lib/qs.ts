/**
 * Makes the Q.S. ingredient (usually water) fill whatever the others leave, so the formula adds up to 100%.
 * Returns the same list when nothing needs to change.
 */
export function settleQS<T extends { isQS: boolean; percentage: number }>(list: T[]): T[] {
    const qs = list.findIndex(i => i.isQS);
    if (qs === -1) return list;

    const others = list.reduce((sum, i, index) => (index === qs ? sum : sum + (i.percentage || 0)), 0);
    const balance = Math.max(0, parseFloat((100 - others).toFixed(2)));
    if (list[qs].percentage === balance) return list;

    return list.map((i, index) => (index === qs ? { ...i, percentage: balance } : i));
}
