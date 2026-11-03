import { describe, expect, it } from 'vitest';
import { MONTH_NAMES, NO_EXPIRY, expiryFromMonth, expiryParts, formatExpiry, isMonthEnd, isPartialExpiry, isValidMonth, lastDayOfMonth, monthsFromNow, nextYearFor, parseDay, partsToMonth, toMonthInput } from './expiry';
import { lotLabel } from './batchPlan';

const formatDate = (d: string | null) => (d ? `full:${d}` : '—');

describe('a month as an expiry', () => {
    it('expires on the last day of that month, whatever its length', () => {
        expect(lastDayOfMonth('2027-01')).toBe('2027-01-31');
        expect(lastDayOfMonth('2027-04')).toBe('2027-04-30');
        expect(lastDayOfMonth('2027-02')).toBe('2027-02-28');
        expect(lastDayOfMonth('2028-02')).toBe('2028-02-29'); // a leap year
        expect(lastDayOfMonth('2027-12')).toBe('2027-12-31');
    });

    it('accepts YYYY-MM and nothing else', () => {
        for (const ok of ['2027-03', '1999-12', '2030-01']) expect(isValidMonth(ok), ok).toBe(true);
        for (const bad of ['', '2027', '2027-3', '2027-13', '2027-00', '27-03', '2027-03-15', 'march 2027', ' 2027-03']) expect(isValidMonth(bad), bad).toBe(false);
    });

    it('knows a month-end from any other date', () => {
        expect(isMonthEnd('2027-03-31')).toBe(true);
        expect(isMonthEnd('2028-02-29')).toBe(true);
        expect(isMonthEnd('2027-02-28')).toBe(true);
        expect(isMonthEnd('2027-03-30')).toBe(false);
        expect(isMonthEnd('2027-03-15')).toBe(false);
        for (const none of [null, undefined, '', 'soon', '2027-03']) expect(isMonthEnd(none), String(none)).toBe(false);
    });

    it('shows a stored date in the month box', () => {
        expect(toMonthInput('2027-03-31')).toBe('2027-03');
        expect(toMonthInput('2027-03-10')).toBe('2027-03');
        for (const none of [null, undefined, '']) expect(toMonthInput(none)).toBe('');
    });
});

describe('storing a month', () => {
    it('uses the end of the month for a new lot or a different month', () => {
        expect(expiryFromMonth('2027-03')).toBe('2027-03-31');
        expect(expiryFromMonth('2027-03', null)).toBe('2027-03-31');
        expect(expiryFromMonth('2027-05', '2027-03-10')).toBe('2027-05-31');
    });

    it('keeps the exact day of an older lot when its month is left alone', () => {
        expect(expiryFromMonth('2027-03', '2027-03-10')).toBe('2027-03-10');
        expect(expiryFromMonth('2027-03', '2027-03-31')).toBe('2027-03-31');
    });
});

describe('showing an expiry', () => {
    it('shows only the month and year for a month-end, in the style of the chosen date format', () => {
        expect(formatExpiry('2027-03-31', formatDate, 'en-US')).toBe('03/2027');
        expect(formatExpiry('2027-03-31', formatDate, 'en-GB')).toBe('03/2027');
        expect(formatExpiry('2027-03-31', formatDate, 'sv-SE')).toBe('2027-03');
        expect(formatExpiry('2028-02-29', formatDate, 'en-US')).toBe('02/2028');
    });

    it('shows the full date when a day was recorded', () => {
        expect(formatExpiry('2027-03-10', formatDate)).toBe('full:2027-03-10');
    });

    it('shows nothing for no date', () => {
        expect(formatExpiry(null, formatDate)).toBe('—');
        expect(formatExpiry(undefined, formatDate)).toBe('—');
    });

    it('is not moved by the time zone', () => {
        expect(parseDay('2027-03-31').getDate()).toBe(31);
        expect(parseDay('2027-03-31').getMonth()).toBe(2);
    });

    it('names a lot in a batch plan by its month, or by its date', () => {
        const lot = { id: 'l', ingredient_id: 'i', amount_left_g: 5 };
        expect(lotLabel({ ...lot, expiration_date: '2027-03-31' })).toBe('expires 2027-03');
        expect(lotLabel({ ...lot, expiration_date: '2027-03-10' })).toBe('expires 2027-03-10');
        expect(lotLabel({ ...lot, expiration_date: null })).toBe('stash lot');
    });
});

describe('the month and year as two pieces', () => {
    it('splits a stored date, and joins the pieces back', () => {
        expect(expiryParts('2027-03-31')).toEqual({ year: '2027', month: '03' });
        expect(expiryParts('2027-03-10')).toEqual({ year: '2027', month: '03' });
        for (const none of [null, undefined, '']) expect(expiryParts(none)).toEqual(NO_EXPIRY);
        expect(partsToMonth({ year: '2027', month: '03' })).toBe('2027-03');
        expect(partsToMonth(NO_EXPIRY)).toBe('');
    });

    it('only gives a month once both pieces are chosen', () => {
        expect(partsToMonth({ year: '2027', month: '' })).toBe('');
        expect(partsToMonth({ year: '', month: '03' })).toBe('');
    });

    it('knows an expiry that is only half chosen', () => {
        expect(isPartialExpiry({ year: '2027', month: '' })).toBe(true);
        expect(isPartialExpiry({ year: '', month: '03' })).toBe(true);
        expect(isPartialExpiry({ year: '2027', month: '03' })).toBe(false);
        expect(isPartialExpiry(NO_EXPIRY)).toBe(false);
    });

    it('counts months from now, across year ends', () => {
        const today = new Date(2026, 10, 18); // November 2026
        expect(monthsFromNow(6, today)).toEqual({ year: '2027', month: '05' });
        expect(monthsFromNow(12, today)).toEqual({ year: '2027', month: '11' });
        expect(monthsFromNow(36, today)).toEqual({ year: '2029', month: '11' });
        expect(monthsFromNow(2, today)).toEqual({ year: '2027', month: '01' });
        expect(monthsFromNow(0, today)).toEqual({ year: '2026', month: '11' });
        expect(monthsFromNow(1, new Date(2026, 11, 31))).toEqual({ year: '2027', month: '01' });
    });

    it('does not skip a month at the end of a long month', () => {
        expect(monthsFromNow(1, new Date(2027, 0, 31))).toEqual({ year: '2027', month: '02' }); // 31 January plus a month is still February
    });

    it('picks the next time a month comes round', () => {
        const today = new Date(2026, 10, 18); // November 2026
        expect(nextYearFor('11', today)).toBe('2026'); // this month: still to come
        expect(nextYearFor('12', today)).toBe('2026');
        expect(nextYearFor('10', today)).toBe('2027'); // already passed
        expect(nextYearFor('01', today)).toBe('2027');
    });

    it('names the twelve months in order', () => {
        expect(MONTH_NAMES).toHaveLength(12);
        expect(MONTH_NAMES[0]).toBe('January');
        expect(MONTH_NAMES[11]).toBe('December');
    });
});
