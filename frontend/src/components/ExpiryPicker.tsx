import { useId } from 'react';
import { MONTH_NAMES, NO_EXPIRY, isPartialExpiry, monthsFromNow, nextYearFor, partsToMonth, type ExpiryParts } from '../lib/expiry';

const QUICK: { months: number; label: string }[] = [
    { months: 6, label: '6 months' },
    { months: 12, label: '1 year' },
    { months: 24, label: '2 years' },
    { months: 36, label: '3 years' },
];

const SELECT = 'w-full px-3 py-2 border rounded-lg bg-white focus:ring-1 focus:ring-[#2c4c3b] outline-none';

interface ExpiryPickerProps {
    value: ExpiryParts;
    onChange: (value: ExpiryParts) => void;
}

/**
 * Expiry as a month and a year, picked from two lists, with one-click options for the usual shelf lives. Nothing has to
 * be typed. Choosing a month on its own fills in the year it next comes round, so the usual case is a single choice.
 */
export default function ExpiryPicker({ value, onChange }: ExpiryPickerProps) {
    const id = useId();
    const partial = isPartialExpiry(value);
    const complete = Boolean(partsToMonth(value));
    const thisYear = new Date().getFullYear();

    // A year a little in the past (for a lot that has already expired) to well into the future, plus the lot's own year
    const years = Array.from({ length: 14 }, (_, n) => String(thisYear - 1 + n));
    if (value.year && !years.includes(value.year)) years.push(value.year);
    years.sort();

    const hint = partial
        ? 'Choose both a month and a year.'
        : complete
            ? `Expires at the end of ${MONTH_NAMES[Number(value.month) - 1]} ${value.year}.`
            : 'Optional. Pick a month and year, or a quick option. The last day of the month is used.';

    return (
        <div role="group" aria-labelledby={`${id}-label`}>
            <span id={`${id}-label`} className="block text-sm font-medium text-gray-700 mb-1">Expires</span>
            <div className="grid grid-cols-2 gap-2">
                <select
                    aria-label="Expiry month"
                    value={value.month}
                    onChange={e => {
                        const month = e.target.value;
                        onChange(month ? { month, year: value.year || nextYearFor(month) } : { month: '', year: value.year });
                    }}
                    className={`${SELECT} ${partial && !value.month ? 'border-red-400' : 'border-gray-300'}`}
                >
                    <option value="">Month</option>
                    {MONTH_NAMES.map((name, n) => <option key={name} value={String(n + 1).padStart(2, '0')}>{name}</option>)}
                </select>
                <select
                    aria-label="Expiry year"
                    value={value.year}
                    onChange={e => onChange({ month: value.month, year: e.target.value })}
                    className={`${SELECT} ${partial && !value.year ? 'border-red-400' : 'border-gray-300'}`}
                >
                    <option value="">Year</option>
                    {years.map(year => <option key={year} value={year}>{year}</option>)}
                </select>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-1.5" role="group" aria-label="Quick options">
                <span className="text-xs text-gray-500 mr-0.5">In</span>
                {QUICK.map(({ months, label }) => {
                    const target = monthsFromNow(months);
                    const on = target.month === value.month && target.year === value.year;
                    return (
                        <button
                            key={months}
                            type="button"
                            aria-pressed={on}
                            onClick={() => onChange(target)}
                            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${on ? 'bg-[#2c4c3b] text-white border-[#2c4c3b]' : 'bg-white text-[#2c4c3b] border-[#c1d1b9] hover:bg-[#e9eee7]'}`}
                        >
                            {label}
                        </button>
                    );
                })}
                {(value.month || value.year) && (
                    <button type="button" onClick={() => onChange(NO_EXPIRY)} className="ml-auto text-xs font-medium text-gray-500 hover:text-red-600 underline">
                        No expiry
                    </button>
                )}
            </div>

            <p role={partial ? 'alert' : undefined} className={`text-[11px] mt-1.5 ${partial ? 'text-red-600' : 'text-gray-500'}`}>{hint}</p>
        </div>
    );
}
