import type { ReactNode } from 'react';

export const inputClass = 'w-full px-3 py-2 border border-[#c1d1b9] rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#2c4c3b]';

export function Field({ label, value, onChange, suffix, placeholder, hint }: {
    label: string; value: string; onChange: (value: string) => void; suffix?: string; placeholder?: string; hint?: string;
}) {
    return (
        <label className="block">
            <span className="block text-xs font-bold text-[#3a5a4a] mb-1">{label}</span>
            <span className="flex items-center gap-2">
                <input type="text" inputMode="decimal" aria-label={label} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} className={inputClass} />
                {suffix && <span className="text-sm text-gray-500 shrink-0">{suffix}</span>}
            </span>
            {hint && <span className="block text-xs text-gray-500 mt-1">{hint}</span>}
        </label>
    );
}

export function Card({ title, children }: { title?: string; children: ReactNode }) {
    return (
        <section className="bg-white border border-[#c1d1b9] rounded-2xl p-5 mb-5">
            {title && <h3 className="font-bold text-[#1f382a] mb-3">{title}</h3>}
            {children}
        </section>
    );
}

export function Result({ children, tone = 'good' }: { children: ReactNode; tone?: 'good' | 'warn' | 'bad' }) {
    const colors = { good: 'bg-[#e9eee7] border-[#c1d1b9] text-[#1f382a]', warn: 'bg-amber-50 border-amber-200 text-amber-900', bad: 'bg-red-50 border-red-200 text-red-800' };
    return <div role="status" className={`mt-4 border rounded-xl p-4 text-sm ${colors[tone]}`}>{children}</div>;
}

export function Big({ children }: { children: ReactNode }) {
    return <strong className="text-lg font-bold">{children}</strong>;
}
