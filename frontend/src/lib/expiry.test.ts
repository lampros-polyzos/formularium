import { describe, expect, it } from 'vitest';
import { expiryFromMonth, formatExpiry, isMonthEnd, isValidMonth, lastDayOfMonth, parseDay, toMonthInput } from './expiry';
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
