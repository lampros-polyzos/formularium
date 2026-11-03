import { describe, expect, it } from 'vitest';
import { buildCheckCalendar, calendarFilename, foldLine } from './checkCalendar';

const batch = { id: 'b1', name: 'Day Cream', lot_number: '261108-1' };
const check = (id: string, label: string, due_on: string, checked_at: string | null = null) => ({ id, label, due_on, checked_at });
const NOW = new Date(Date.UTC(2026, 10, 8, 9, 5, 7));

const unfold = (ics: string) => ics.replace(/\r\n /g, '');
const eventsOf = (ics: string) => unfold(ics).split('BEGIN:VEVENT').slice(1);

describe('buildCheckCalendar', () => {
    const ics = buildCheckCalendar(batch, [check('c1', '24 hours', '2026-11-09'), check('c2', '1 week', '2026-11-15')], 'https://app.example.com/', NOW)!;

    it('is a valid calendar file, with line breaks the standard asks for', () => {
        expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
        expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
        expect(ics).not.toMatch(/[^\r]\n/); // every line ends CRLF
        expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
        expect(ics.match(/END:VEVENT/g)).toHaveLength(2);
    });

    it('makes an all-day event per check-in that asks "how does it look?"', () => {
        const [first] = eventsOf(ics);
        expect(first).toContain('DTSTART;VALUE=DATE:20261109');
        expect(first).toContain('DTEND;VALUE=DATE:20261110');
        expect(first).toContain('SUMMARY:How does Day Cream look? (24 hours check)');
        expect(first).toContain('Lot 261108-1');
    });

    it('links back to the batch, whether or not the address ends with a slash', () => {
        expect(ics).toContain('URL:https://app.example.com/batches/b1');
        expect(buildCheckCalendar(batch, [check('c1', 'x', '2026-11-09')], 'https://app.example.com', NOW)).toContain('URL:https://app.example.com/batches/b1');
    });

    it('reminds at 9:00 that day', () => {
        for (const event of eventsOf(ics)) {
            expect(event).toContain('BEGIN:VALARM');
            expect(event).toContain('TRIGGER:PT9H');
        }
    });

    it('gives each event a stable id, so importing again updates instead of duplicating', () => {
        expect(ics).toContain('UID:check-c1@formularium');
        expect(ics).toContain('UID:check-c2@formularium');
        expect(buildCheckCalendar(batch, [check('c1', '24 hours', '2026-11-09')], 'https://x', new Date(0))).toContain('UID:check-c1@formularium');
    });

    it('stamps the time it was made, in UTC', () => {
        expect(ics).toContain('DTSTAMP:20261108T090507Z');
    });

    it('does not block the user\'s calendar time', () => {
        expect(eventsOf(ics)[0]).toContain('TRANSP:TRANSPARENT');
    });
});

describe('what goes in it', () => {
    it('leaves out check-ins that are already done, and gives nothing when none are left', () => {
        const done = check('c1', '24 hours', '2026-11-09', '2026-11-09T10:00:00Z');
        const ics = buildCheckCalendar(batch, [done, check('c2', '1 week', '2026-11-15')], 'https://x', NOW)!;
        expect(ics).not.toContain('check-c1@');
        expect(ics).toContain('check-c2@');
        expect(buildCheckCalendar(batch, [done], 'https://x', NOW)).toBeNull();
        expect(buildCheckCalendar(batch, [], 'https://x', NOW)).toBeNull();
    });

    it('ends an all-day event on the right day at the end of a month and a year', () => {
        const ics = buildCheckCalendar(batch, [check('a', 'x', '2026-11-30'), check('b', 'y', '2026-12-31'), check('c', 'z', '2028-02-28')], 'https://x', NOW)!;
        expect(ics).toContain('DTEND;VALUE=DATE:20261201');
        expect(ics).toContain('DTEND;VALUE=DATE:20270101');
        expect(ics).toContain('DTEND;VALUE=DATE:20280229'); // a leap year
    });

    it('escapes characters that mean something in the format', () => {
        const ics = buildCheckCalendar({ id: 'b', name: 'Cream; rich, "new"\nbatch', lot_number: 'A\\1' }, [check('c', 'x', '2026-11-09')], 'https://x', NOW)!;
        const text = unfold(ics);
        expect(text).toContain('SUMMARY:How does Cream\\; rich\\, "new"\\nbatch look?');
        expect(text).toContain('Lot A\\\\1.');
        expect(text).not.toMatch(/SUMMARY:[^\r]*\n[^\r]/);
    });
});

describe('foldLine', () => {
    it('leaves short lines alone', () => {
        expect(foldLine('SUMMARY:short')).toBe('SUMMARY:short');
    });

    it('breaks a long line into pieces of at most 75 bytes that read back as the original', () => {
        const long = 'DESCRIPTION:' + 'word '.repeat(60);
        const folded = foldLine(long);
        const pieces = folded.split('\r\n');
        expect(pieces.length).toBeGreaterThan(1);
        expect(pieces.every(p => new TextEncoder().encode(p).length <= 75)).toBe(true);
        expect(pieces.slice(1).every(p => p.startsWith(' '))).toBe(true);
        expect(folded.replace(/\r\n /g, '')).toBe(long);
    });

    it('never splits a character in the middle', () => {
        const long = 'SUMMARY:' + 'é€漢'.repeat(40);
        const folded = foldLine(long);
        expect(folded.replace(/\r\n /g, '')).toBe(long);
        expect(folded.split('\r\n').every(p => new TextEncoder().encode(p).length <= 75)).toBe(true);
    });
});

describe('calendarFilename', () => {
    it('is safe to save, and says which batch it is for', () => {
        expect(calendarFilename({ name: 'Day Cream', lot_number: '261108-1' })).toBe('Day_Cream_261108-1_checkins.ics');
        expect(calendarFilename({ name: 'Crème / "rich"', lot_number: 'A1' })).toBe('Cr_me_rich_A1_checkins.ics');
    });
});
