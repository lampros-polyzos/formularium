import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import type { LineMatch, MatchStatus, RecipeMatch } from '../../lib/pantry';
import { displayName } from '../../lib/substitutions';

const STATUS: Record<MatchStatus, { label: string; style: string }> = {
    'ready': { label: 'Ready to make', style: 'bg-green-100 text-green-800' },
    'ready-with-swaps': { label: 'Ready with swaps', style: 'bg-emerald-100 text-emerald-800' },
    'partial': { label: 'Partly covered', style: 'bg-amber-100 text-amber-800' },
    'far': { label: 'Far off', style: 'bg-gray-100 text-gray-600' },
};

const grams = (g: number) => `${g < 10 ? g.toFixed(1) : Math.round(g)} g`;

function lineSummary(l: LineMatch): string {
    if (l.state === 'have') return 'In your stash';
    if (l.state === 'assumed') return 'Water, assumed';
    if (l.state === 'low') return `Only ${l.haveG !== null ? grams(l.haveG) : 'some'} of ${grams(l.neededG)}`;
    return 'Not in your stash';
}

export default function RecipeMatchCard({ match }: { match: RecipeMatch }) {
    const [open, setOpen] = useState(false);
    const { recipe } = match;
    const percent = Math.round(match.readiness * 100);
    const status = STATUS[match.status];
    const to = recipe.source === 'own' ? `/studio/${recipe.id}` : `/community/${recipe.id}`;

    return (
        <li className="bg-white border border-[#c1d1b9] rounded-2xl p-5">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <Link to={to} className="font-bold text-[#1f382a] hover:underline break-words">{recipe.name}</Link>
                    <p className="text-xs text-gray-500 mt-0.5">
                        {recipe.source === 'own' ? 'Your formula' : `Community${recipe.author ? ` · ${recipe.author}` : ''}`}
                    </p>
                </div>
                <span className={`shrink-0 text-xs font-bold px-2.5 py-1 rounded-full ${status.style}`}>{status.label}</span>
            </div>

            <div className="mt-3 flex items-center gap-3">
                <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden" role="progressbar" aria-label={`${recipe.name} coverage`} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
                    <div className="h-full bg-[#2c4c3b]" style={{ width: `${percent}%` }} />
                </div>
                <span className="text-sm font-bold text-[#1f382a] tabular-nums">{percent}%</span>
            </div>

            <p className="mt-2 text-sm text-gray-600">
                You have {match.haveCount} of {match.lines.length}
                {match.swapCount > 0 && ` · ${match.swapCount} ${match.swapCount === 1 ? 'swap' : 'swaps'}`}
                {match.missing.length > 0 && ` · ${match.missing.length} to buy`}
            </p>
            {match.missing.length > 0 && (
                <p className="mt-1 text-sm text-gray-500">Missing: {match.missing.map(l => displayName(l.line.ingredient)).join(', ')}</p>
            )}
            {match.missingPreservative && (
                <p className="mt-2 flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
                    No preservative in your stash for this water-based recipe. Do not skip it.
                </p>
            )}

            <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-[#2c4c3b] hover:underline">
                {open ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
                {open ? 'Hide ingredients' : 'Show ingredients'}
            </button>

            {open && (
                <ul className="mt-3 divide-y divide-gray-100 text-sm">
                    {match.lines.map(l => (
                        <li key={`${l.line.phase}-${l.line.ingredient.id}`} className="py-2">
                            <div className="flex justify-between gap-3">
                                <span className="font-medium text-gray-800">{displayName(l.line.ingredient)}</span>
                                <span className="text-gray-500 tabular-nums">{l.line.percentage}%</span>
                            </div>
                            <p className={l.state === 'have' || l.state === 'assumed' ? 'text-green-700' : l.swap ? 'text-amber-700' : 'text-red-700'}>
                                {lineSummary(l)}
                            </p>
                            {l.swap && (
                                <div className="mt-1 pl-3 border-l-2 border-[#c1d1b9] text-gray-700">
                                    <p>Use <span className="font-bold">{displayName(l.swap.ingredient)}</span> ({grams(l.swap.neededG)}) · {l.swap.matchLabel}</p>
                                    {l.swap.notes.map(n => <p key={n} className="text-xs text-gray-500">{n}</p>)}
                                    {l.swap.warnings.map(w => <p key={w} className="text-xs text-amber-700">{w}</p>)}
                                    {l.alternatives.length > 0 && (
                                        <p className="text-xs text-gray-500">Also: {l.alternatives.map(a => displayName(a.ingredient)).join(', ')}</p>
                                    )}
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </li>
    );
}
