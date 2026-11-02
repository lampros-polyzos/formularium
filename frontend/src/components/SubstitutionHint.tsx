import { useState } from 'react';
import { displayName, formatGrams, type SourcingItem, type SubstituteOption } from '../lib/substitutions';

interface SubstitutionHintProps {
    item: SourcingItem;
    onSwap: (option: SubstituteOption) => void;
}

// Shown as an extra table row under an ingredient the user is missing or short on
export default function SubstitutionHint({ item, onSwap }: SubstitutionHintProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const { stashOptions, marketOptions } = item;
    const best = stashOptions[0];
    const optionCount = stashOptions.length + marketOptions.length;

    const statusText = item.status === 'low'
        ? `Low in your stash: have ${formatGrams(item.haveG ?? 0)}, need ${formatGrams(item.neededG)}`
        : `Not in your stash: need ${formatGrams(item.neededG)}`;

    return (
        <tr className="border-b border-gray-100 bg-amber-50/60">
            <td colSpan={6} className="px-4 py-2 text-xs">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <span className="font-semibold text-amber-800">⚠ {statusText}</span>

                    {best && !isExpanded && (
                        <button
                            onClick={() => onSwap(best)}
                            className="px-2 py-0.5 rounded border border-green-300 bg-green-50 text-green-800 hover:bg-green-100 transition-colors"
                            title={[...best.notes, ...best.warnings].join('\n') || undefined}
                        >
                            ⇄ Use <strong>{displayName(best.ingredient)}</strong> from your stash
                        </button>
                    )}

                    {optionCount > 0 ? (
                        <button
                            onClick={() => setIsExpanded(!isExpanded)}
                            className="text-[#2c4c3b] font-medium hover:underline"
                            aria-expanded={isExpanded}
                        >
                            {isExpanded ? 'Hide alternatives ▴' : `${optionCount} alternative${optionCount !== 1 ? 's' : ''} ▾`}
                        </button>
                    ) : (
                        <span className="text-gray-500 italic">No close substitutes found. Buy the original.</span>
                    )}
                </div>

                {isExpanded && (
                    <div className="mt-2 grid gap-3 sm:grid-cols-2">
                        <OptionList title="From your stash" empty="Nothing suitable in your stash." options={stashOptions} onSwap={onSwap} />
                        <OptionList title="To buy instead" empty="No purchasable alternatives found." options={marketOptions} onSwap={onSwap} />
                    </div>
                )}
            </td>
        </tr>
    );
}

interface OptionListProps {
    title: string;
    empty: string;
    options: SubstituteOption[];
    onSwap: (option: SubstituteOption) => void;
}

function OptionList({ title, empty, options, onSwap }: OptionListProps) {
    return (
        <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">{title}</div>
            {options.length === 0 ? (
                <p className="text-gray-400 italic">{empty}</p>
            ) : (
                <ul className="space-y-1.5">
                    {options.map(option => (
                        <li key={option.ingredient.id} className="bg-white border border-gray-200 rounded-md p-2">
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <div className="font-semibold text-[#1f382a] truncate">{displayName(option.ingredient)}</div>
                                    <div className="text-[10px] text-gray-500">
                                        {option.matchLabel} · {option.score}% · use {option.percentage}% ({formatGrams(option.neededG)})
                                        {option.ingredient.cost_category && ` · ${option.ingredient.cost_category} cost`}
                                    </div>
                                </div>
                                <button
                                    onClick={() => onSwap(option)}
                                    className="shrink-0 px-2 py-0.5 rounded border border-[#c1d1b9] text-[#2c4c3b] font-medium hover:bg-[#e9eee7] transition-colors"
                                >
                                    Swap
                                </button>
                            </div>
                            {option.notes.map(note => <p key={note} className="text-[10px] text-gray-500 mt-0.5">• {note}</p>)}
                            {option.warnings.map(warning => <p key={warning} className="text-[10px] text-amber-700 mt-0.5">⚠ {warning}</p>)}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
