// Most labels give an expiry as a month and year ("best before end of 03/2027"), so the stash only asks for that. The
// lot is stored as a date like everything else: the last day of the month, which is when such a label runs out.

/** A month typed or picked as YYYY-MM. */
export const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export const isValidMonth = (value: string) => MONTH_PATTERN.test(value);

/** "2027-02" is "2027-02-28". */
export function lastDayOfMonth(month: string): string {
    const [year, m] = month.split('-').map(Number);
    return `${month}-${String(new Date(year, m, 0).getDate()).padStart(2, '0')}`;
}

/** Whether a date is the last day of its month, which is how a month-only expiry is stored. */
export function isMonthEnd(iso: string | null | undefined): boolean {
    return Boolean(iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) && lastDayOfMonth(iso.slice(0, 7)) === iso);
}

/** What the month box shows for a stored date. */
export const toMonthInput = (iso: string | null | undefined): string =>
    iso && /^\d{4}-\d{2}/.test(iso) ? iso.slice(0, 7) : '';

/**
 * The date to store for a month. When the month is the one a lot already has, its date is kept, so that opening an old
 * lot that has an exact day and saving it does not quietly move it to the end of the month.
 */
export function expiryFromMonth(month: string, original?: string | null): string {
    if (original && original.slice(0, 7) === month) return original;
    return lastDayOfMonth(month);
}

/** A stored date as a local date (not shifted by the time zone). */
export function parseDay(iso: string): Date {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
}

/**
 * How to show an expiry: month and year when it is a month-end (03/2027, or 2027-03 in the ISO style), the full date
 * otherwise. `dateFormat` is the locale chosen in the settings.
 */
export function formatExpiry(iso: string | null | undefined, formatDate: (d: string | null) => string, dateFormat = 'en-US'): string {
    if (!iso) return formatDate(null);
    if (!isMonthEnd(iso)) return formatDate(iso);
    const [year, month] = iso.split('-').map(Number);
    return new Date(year, month - 1, 1).toLocaleDateString(dateFormat, { month: '2-digit', year: 'numeric' });
}
