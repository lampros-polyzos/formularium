// What counts as "running low" depends on how much of an ingredient a batch uses. Fifteen grams of glycerin is a few
// batches, but fifteen grams of an essential oil used at 0.5% is months of supply.

/** The usage rate (in %) at which the low-stock level in the settings applies in full. */
export const REFERENCE_USAGE_PCT = 10;

/** Smallest share of the setting an ingredient can be given, so even the tiniest-dose ingredient gets a level. */
const MIN_SHARE = 0.05;

/**
 * The low-stock level for one ingredient, in grams: the setting for ingredients used at 10% or more, and
 * proportionally less for those used in small amounts (an ingredient used at most 1% gets a tenth of it).
 * Without a known usage limit the setting applies as it is.
 */
export function lowStockLevel(maxUsagePct: number | null | undefined, settingG: number): number {
    const max = Number(maxUsagePct);
    if (!Number.isFinite(max) || max <= 0) return settingG;
    return settingG * Math.min(1, Math.max(MIN_SHARE, max / REFERENCE_USAGE_PCT));
}
