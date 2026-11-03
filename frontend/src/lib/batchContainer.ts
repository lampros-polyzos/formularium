// Sizing a batch from a container: how many grams fill N bottles, or how many bottles a batch fills.

export interface DensityRow { percentage: number; solubility?: string | null }

const OIL_DENSITY = 0.92;
const WATER_DENSITY = 1;

/**
 * About how heavy a millilitre of the product is. Oils are lighter than water, so an oil-based product weighs less
 * per millilitre than a water-based one. An estimate: weigh a full container once to know exactly.
 */
export function estimateDensity(rows: DensityRow[]): number {
    const total = rows.reduce((sum, r) => sum + Math.max(r.percentage, 0), 0);
    if (total <= 0) return WATER_DENSITY;
    const volume = rows.reduce((sum, r) => sum + Math.max(r.percentage, 0) / (r.solubility === 'oil' ? OIL_DENSITY : WATER_DENSITY), 0);
    return Math.round((total / volume) * 100) / 100;
}

export const DEFAULT_FILL_PERCENT = 95;

const clampFill = (fillPercent: number) => Math.min(Math.max(fillPercent, 1), 100);

/** Grams of product that fill `count` containers to `fillPercent` of their nominal size. */
export function sizeForContainers(volumeMl: number, count: number, fillPercent: number, density: number): number {
    if (!(volumeMl > 0) || !(count > 0) || !(density > 0)) return 0;
    return Math.round(volumeMl * count * (clampFill(fillPercent) / 100) * density * 10) / 10;
}

/** How many containers a batch fills (a fraction when the last one is part full). */
export function containersFilled(sizeG: number, volumeMl: number, fillPercent: number, density: number): number {
    const perContainerG = volumeMl * (clampFill(fillPercent) / 100) * density;
    if (!(sizeG > 0) || !(perContainerG > 0)) return 0;
    return Math.round((sizeG / perContainerG) * 100) / 100;
}

/** "3.4 containers", "1 container". */
export function describeCount(count: number): string {
    const text = Number(count.toFixed(2)).toString();
    return `${text} container${count === 1 ? '' : 's'}`;
}
