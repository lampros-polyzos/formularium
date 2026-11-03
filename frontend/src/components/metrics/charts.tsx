import type { ReactNode } from 'react';

// Small building blocks for the Metrics page. Every chart is a single series in one colour, thin marks with rounded
// ends, with the values written out as text so nothing depends on colour or on hovering.

const BAR = 'bg-[#2c4c3b]';
const TRACK = 'bg-[#e9eee7]';

export function Panel({ title, hint, children, id }: { title: string; hint?: string; children: ReactNode; id?: string }) {
    const headingId = `${id ?? title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-title`;
    return (
        <section aria-labelledby={headingId} className="bg-white border border-[#c1d1b9] rounded-2xl p-5">
            <h2 id={headingId} className="text-base font-bold text-[#1f382a]">{title}</h2>
            {hint && <p className="text-xs text-gray-500 mt-0.5">{hint}</p>}
            <div className="mt-4">{children}</div>
        </section>
    );
}

export function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
    return (
        <div className="bg-white border border-[#c1d1b9] rounded-2xl p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500">{label}</p>
            <p className="mt-1 text-2xl font-bold text-[#1f382a] tabular-nums break-words">{value}</p>
            {hint && <p className="mt-0.5 text-xs text-gray-500">{hint}</p>}
        </div>
    );
}

export interface BarRow { id: string; label: string; value: number; display: string; sub?: string }

/** Horizontal bars, longest first as given, each with its figure written out beside it. */
export function BarList({ rows, label, empty = 'Nothing to show yet.' }: { rows: BarRow[]; label: string; empty?: string }) {
    if (rows.length === 0) return <p className="text-sm text-gray-500">{empty}</p>;
    const max = Math.max(...rows.map(r => r.value), 0);
    return (
        <ul aria-label={label} className="space-y-3">
            {rows.map(r => (
                <li key={r.id}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="font-medium text-gray-800 truncate" title={r.label}>{r.label}</span>
                        <span className="shrink-0 tabular-nums font-bold text-[#1f382a]">{r.display}</span>
                    </div>
                    <div className={`mt-1 h-2 rounded-full ${TRACK} overflow-hidden`} aria-hidden>
                        <div className={`h-full rounded-full ${BAR}`} style={{ width: `${max > 0 ? Math.max(2, (r.value / max) * 100) : 0}%` }} />
                    </div>
                    {r.sub && <p className="mt-0.5 text-xs text-gray-500">{r.sub}</p>}
                </li>
            ))}
        </ul>
    );
}

export interface Column { id: string; label: string; value: number; display: string }

/**
 * Columns over time. Only the tallest and the latest are written on the chart; the rest are in each column's label
 * and in the table underneath, which has every figure.
 */
export function ColumnChart({ columns, label, unit }: { columns: Column[]; label: string; unit: string }) {
    const max = Math.max(...columns.map(c => c.value), 0);
    const peak = max > 0 ? columns.findIndex(c => c.value === max) : -1;
    const latest = columns.length - 1;
    return (
        <div>
            <div role="img" aria-label={`${label}: ${columns.map(c => `${c.label}: ${c.display}`).join(', ')}`} className="flex items-end gap-1.5 h-40">
                {columns.map((c, n) => (
                    <div key={c.id} className="flex-1 min-w-0 h-full flex flex-col justify-end items-center" title={`${c.label}: ${c.display} ${unit}`}>
                        <span className={`text-[11px] tabular-nums text-gray-700 h-4 ${n === peak || n === latest ? '' : 'invisible'}`}>{c.value > 0 ? c.display : ''}</span>
                        <div className={`w-full max-w-6 rounded-t-md ${c.value > 0 ? BAR : TRACK}`} style={{ height: `${max > 0 && c.value > 0 ? Math.max(3, (c.value / max) * 100) : 2}%` }} />
                    </div>
                ))}
            </div>
            <div className="flex gap-1.5 mt-1" aria-hidden>
                {columns.map(c => <span key={c.id} className="flex-1 min-w-0 text-center text-[10px] text-gray-500 truncate">{c.label}</span>)}
            </div>
            <details className="mt-3 text-sm">
                <summary className="cursor-pointer font-bold text-[#2c4c3b]">Show as a table</summary>
                <table className="mt-2 w-full text-left">
                    <caption className="sr-only">{label}</caption>
                    <thead className="text-xs uppercase tracking-wider text-gray-500"><tr><th className="py-1 pr-3">Month</th><th className="py-1">{unit}</th></tr></thead>
                    <tbody>{columns.map(c => <tr key={c.id} className="border-t border-gray-100"><td className="py-1 pr-3">{c.label}</td><td className="py-1 tabular-nums">{c.display}</td></tr>)}</tbody>
                </table>
            </details>
        </div>
    );
}
