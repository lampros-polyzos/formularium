import type { Batch, BatchCheck } from '../types/batches';

// Reminders that reach people when they are not in the app: an .ics file that any calendar can import. It holds one
// all-day event per check-in still to do, with an alert at 9:00 that day. Each event has a stable id, so importing the
// file again updates the events instead of duplicating them.

const CRLF = '\r\n';

/** Text values escape backslash, semicolon, comma and line breaks (RFC 5545). */
const escapeText = (text: string) => text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Lines longer than 75 bytes continue on the next line, which starts with a space. */
export function foldLine(line: string): string {
    const encoder = new TextEncoder();
    if (encoder.encode(line).length <= 75) return line;
    const parts: string[] = [];
    let current = '';
    let limit = 75;
    for (const char of line) {
        if (encoder.encode(current + char).length > limit) {
            parts.push(current);
            current = '';
            limit = 74; // the leading space counts
        }
        current += char;
    }
    parts.push(current);
    return parts.join(CRLF + ' ');
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "2026-11-08" -> "20261108" */
const dateValue = (iso: string) => iso.replace(/-/g, '');

/** The day after, for the exclusive end of an all-day event. Handles month and year ends. */
function nextDay(iso: string): string {
    const [y, m, d] = iso.split('-').map(Number);
    const next = new Date(Date.UTC(y, m - 1, d + 1));
    return `${next.getUTCFullYear()}${pad(next.getUTCMonth() + 1)}${pad(next.getUTCDate())}`;
}

const stamp = (d: Date) =>
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

type CalendarCheck = Pick<BatchCheck, 'id' | 'label' | 'due_on' | 'checked_at'>;
type CalendarBatch = Pick<Batch, 'id' | 'name' | 'lot_number'>;

/** The calendar file for a batch's unfinished check-ins, or null when there is nothing left to remind about. */
export function buildCheckCalendar(batch: CalendarBatch, checks: CalendarCheck[], origin: string, now: Date = new Date()): string | null {
    const pending = checks.filter(c => !c.checked_at);
    if (pending.length === 0) return null;

    const link = `${origin.replace(/\/$/, '')}/batches/${batch.id}`;
    const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Formularium//Stability check-ins//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
    ];
    for (const check of pending) {
        lines.push(
            'BEGIN:VEVENT',
            `UID:check-${check.id}@formularium`,
            `DTSTAMP:${stamp(now)}`,
            `DTSTART;VALUE=DATE:${dateValue(check.due_on)}`,
            `DTEND;VALUE=DATE:${nextDay(check.due_on)}`,
            `SUMMARY:${escapeText(`How does ${batch.name} look? (${check.label} check)`)}`,
            `DESCRIPTION:${escapeText(`Lot ${batch.lot_number}. Look for separation, grain, a change in smell or colour, and anything that looks like mold. Answer in Formularium: ${link}`)}`,
            `URL:${link}`,
            'TRANSP:TRANSPARENT',
            'BEGIN:VALARM',
            'ACTION:DISPLAY',
            `DESCRIPTION:${escapeText(`Check on ${batch.name}`)}`,
            'TRIGGER:PT9H',
            'END:VALARM',
            'END:VEVENT',
        );
    }
    lines.push('END:VCALENDAR');
    return lines.map(foldLine).join(CRLF) + CRLF;
}

export const calendarFilename = (batch: Pick<Batch, 'name' | 'lot_number'>) =>
    `${batch.name.replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '')}_${batch.lot_number}_checkins.ics`;
