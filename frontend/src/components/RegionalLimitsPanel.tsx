import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { REGIONS, checkRegionalLimits, regionFrom, type LimitWarning } from '../lib/regionalLimits';

const STYLE: Record<LimitWarning['level'], string> = {
    over: 'border-red-300 bg-red-50 text-red-900',
    depends: 'border-amber-300 bg-amber-50 text-amber-900',
    blend: 'border-blue-300 bg-blue-50 text-blue-900',
};
const BADGE: Record<LimitWarning['level'], string> = { over: 'Over the limit', depends: 'Depends on product', blend: 'Check the blend' };

interface Props {
    /** Where you plan to sell, from your settings. Nothing shows when you are not selling. */
    region: unknown;
    ingredients: { inci_name: string; percentage: number }[];
}

/** Warnings for ingredients above the legal maximum where you plan to sell. */
export default function RegionalLimitsPanel({ region: setting, ingredients }: Props) {
    const region = regionFrom(setting);
    if (region === 'none') return null;
    const info = REGIONS[region];
    const warnings = checkRegionalLimits(region, ingredients);

    return (
        <section aria-label={`${info.label} selling limits`} className="bg-white border border-[#c1d1b9] rounded-lg p-4 shadow-sm">
            <h3 className="text-sm font-bold uppercase tracking-wider text-[#1f382a] mb-3">Selling in the {info.label === 'European Union' ? 'EU' : info.label}</h3>

            {warnings.length === 0 ? (
                <p className="flex items-start gap-2 text-xs text-emerald-800">
                    <CheckCircle2 size={14} className="mt-0.5 shrink-0" aria-hidden />
                    None of the ingredients checked is over its limit.
                </p>
            ) : (
                <ul className="space-y-3">
                    {warnings.map(w => (
                        <li key={w.id} className={`p-3 rounded-md border text-xs ${STYLE[w.level]}`}>
                            <div className="flex items-center justify-between gap-2 mb-1">
                                <span className="font-semibold text-sm flex items-center gap-1.5"><AlertTriangle size={14} aria-hidden />{w.substance}</span>
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-white/60">{BADGE[w.level]}</span>
                            </div>
                            <p className="leading-relaxed">{w.message}</p>
                            {w.note && <p className="mt-1 opacity-80">{w.note}</p>}
                        </li>
                    ))}
                </ul>
            )}

            <p className="mt-3 text-[11px] text-gray-500 leading-relaxed">
                Only some ingredients are checked, and this is guidance, not legal advice. {info.reminders.join(' ')}{' '}
                <a href={info.reference} target="_blank" rel="noreferrer" className="underline">{info.rule}</a>
            </p>
        </section>
    );
}
