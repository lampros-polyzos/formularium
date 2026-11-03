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

// ---------- The month and year as two pieces, for the pickers ----------

/** The month ("01"-"12") and year ("2027") chosen so far; either can be missing while the user is still choosing. */
export interface ExpiryParts { month: string; year: string }

export const NO_EXPIRY: ExpiryParts = { month: '', year: '' };

/** The stored date as the two pieces. */
export function expiryParts(iso: string | null | undefined): ExpiryParts {
    const ym = toMonthInput(iso);
    return ym ? { year: ym.slice(0, 4), month: ym.slice(5, 7) } : NO_EXPIRY;
}

/** "2027-03" once both are chosen, otherwise nothing. */
export const partsToMonth = ({ month, year }: ExpiryParts): string => (month && year ? `${year}-${month}` : '');

/** One of the two is chosen and the other is not: the expiry is not finished, and cannot be saved yet. */
export const isPartialExpiry = ({ month, year }: ExpiryParts): boolean => Boolean(month) !== Boolean(year);

/** The month this many months from now, for the quick options ("in a year"). */
export function monthsFromNow(count: number, today: Date = new Date()): ExpiryParts {
    const d = new Date(today.getFullYear(), today.getMonth() + count, 1);
    return { year: String(d.getFullYear()), month: String(d.getMonth() + 1).padStart(2, '0') };
}

/** When only a month is chosen, the next time that month comes round: this year, or next year if it has already passed. */
export function nextYearFor(month: string, today: Date = new Date()): string {
    return String(Number(month) >= today.getMonth() + 1 ? today.getFullYear() : today.getFullYear() + 1);
}

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
