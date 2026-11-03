import { Fragment } from 'react';
import { Lock, LockOpen, Scale } from 'lucide-react';
import SubstitutionHint from '../SubstitutionHint';
import { displayName, type CatalogIngredient, type SourcingItem, type SubstituteOption } from '../../lib/substitutions';
import type { FormulaIngredient } from '../../types/formulation';

type Phase = 'A' | 'B' | 'C';

const cyclePhase = (current: Phase, dir: number): Phase => {
    const phases: Phase[] = ['A', 'B', 'C'];
    let idx = phases.indexOf(current) + dir;
    if (idx < 0) idx = 2;
    if (idx > 2) idx = 0;
    return phases[idx];
};

interface PhasesPanelProps {
    formulaIngredients: FormulaIngredient[];
    targetWeight: number;
    currentTotalPercentage: number;
    /** Per-ingredient stock status, shown only while the stash check is visible. */
    sourcing: SourcingItem[];
    showStashHints: boolean;
    /** True while substitute candidates are still being fetched, so "none found" is not shown too early. */
    isSearchingSubstitutes: boolean;
    isAutoBalance: boolean;
    onOpenDetails: (item: FormulaIngredient) => void;
    onPercentageChange: (index: number, value: string) => void;
    onToggleLock: (index: number) => void;
    onPhaseChange: (index: number, phase: Phase) => void;
    onRemove: (index: number) => void;
    onSwap: (index: number, option: SubstituteOption) => void;
    onUndoSwap: (index: number) => void;
    onBalance: () => void;
    onToggleAutoBalance: (on: boolean) => void;
}

export default function PhasesPanel({
    formulaIngredients, targetWeight, currentTotalPercentage, sourcing, showStashHints, isSearchingSubstitutes, isAutoBalance,
    onOpenDetails, onPercentageChange, onToggleLock, onPhaseChange, onRemove, onSwap, onUndoSwap, onBalance, onToggleAutoBalance,
}: PhasesPanelProps) {
    const getPhaseIngredients = (phase: Phase) => formulaIngredients
        .map((ing, idx) => ({ ...ing, originalIndex: idx }))
        .filter(ing => ing.phase === phase);

    return (
        <div className="bg-white border border-[#c1d1b9] rounded-lg shadow-sm overflow-hidden text-sm" data-tour="phases">

            {(['A', 'B', 'C'] as const).map((phaseLetter) => {
                const phaseNames = {
                    A: 'PHASE A (Water Phase)',
                    B: 'PHASE B (Oil Phase)',
                    C: 'PHASE C (Cool Down Phase)'
                };
                const phaseHeaderBg = {
                    A: 'bg-[#cbd8d0]',
                    B: 'bg-[#e6e1cd]',
                    C: 'bg-[#bdcdbd]'
                };

                const phaseItems = getPhaseIngredients(phaseLetter);

                return (
                    <div key={phaseLetter}>
                        <div className={`${phaseHeaderBg[phaseLetter]} px-4 py-2 font-semibold flex justify-between border-t first:border-t-0 border-[#c1d1b9]`}>
                            <span>{phaseNames[phaseLetter]}</span>
                            <span className="text-xs font-normal text-gray-700">
                                {phaseItems.reduce((sum, item) => sum + item.percentage, 0).toFixed(2)}%
                            </span>
                        </div>

                        {phaseItems.length === 0 ? (
                            <div className="p-4 text-gray-500 text-center text-xs italic bg-gray-50 border-b border-gray-100">
                                No ingredients added to Phase {phaseLetter} yet.
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse table-fixed min-w-[650px]">
                                    <thead>
                                        <tr className="border-b border-gray-200 text-xs text-gray-500">
                                            <th className="px-4 py-2 font-medium w-[36%]">Ingredient</th>
                                            <th className="px-4 py-2 font-medium w-[23%]">Function</th>
                                            <th className="px-4 py-2 font-medium w-[12%]">Target %</th>
                                            <th className="px-4 py-2 font-medium w-[10%]">Weight (g)</th>
                                            <th className="px-4 py-2 font-medium w-[13%] text-center">Phase</th>
                                            <th className="px-4 py-2 font-medium w-[6%] text-center">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {phaseItems.map((item) => {
                                            const stock = showStashHints ? sourcing[item.originalIndex!] : undefined;
                                            const needsAttention = stock && (stock.status === 'missing' || stock.status === 'low');
                                            return (
                                            <Fragment key={item.originalIndex}>
                                            <tr className={`hover:bg-gray-50 ${needsAttention ? 'bg-amber-50/40' : 'border-b border-gray-100'}`}>
                                                {/* 1. Ingredient Column */}
                                                <td className="px-4 py-2 font-medium text-[#1f382a] truncate">
                                                    <button
                                                        onClick={() => onOpenDetails(item)}
                                                        className="hover:underline hover:text-[#2c4c3b] text-left transition-colors flex flex-col"
                                                        title="View ingredient details"
                                                    >
                                                        <span>{item.trade_name}</span>
                                                        <span className="text-[10px] text-gray-500 font-normal">{item.inci_name}</span>
                                                    </button>
                                                    {item.substitutedFor && (
                                                        <div className="text-[10px] text-gray-500 font-normal mt-0.5 truncate">
                                                            ⇄ replaces {displayName(item.substitutedFor as unknown as CatalogIngredient)} ·{' '}
                                                            <button onClick={() => onUndoSwap(item.originalIndex!)} className="text-[#2c4c3b] font-medium hover:underline">
                                                                Undo
                                                            </button>
                                                        </div>
                                                    )}
                                                </td>

                                                {/* 2. Function Column */}
                                                <td className="px-4 py-2 text-gray-600 truncate">{item.function}</td>

                                                {/* 3. Target % Column (with tightened spacing) */}
                                                <td className="px-4 py-2">
                                                    <div className="flex flex-col justify-center items-start">
                                                        <div className="flex items-center gap-1">
                                                        <div className="relative w-16">
                                                            <input
                                                                type="number"
                                                                step="0.5"
                                                                min="0"
                                                                max="100"
                                                                value={item.percentage === 0 ? '' : item.percentage}
                                                                disabled={item.isQS}
                                                                onChange={(e) => onPercentageChange(item.originalIndex!, e.target.value)}
                                                                className={`w-full border rounded py-0.5 pl-1.5 pr-4 text-sm outline-none focus:ring-1 
                                                        [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:_textfield]
                                                        ${item.isQS
                                                                        ? 'bg-blue-50 text-blue-700 font-bold border-blue-200 cursor-not-allowed'
                                                                        : 'bg-white text-gray-800 border-gray-200 focus:ring-[#2c4c3b]'
                                                                    }
                                                        ${!item.isQS && ((item.min_usage_pct !== null && item.percentage < item.min_usage_pct && item.percentage > 0) || (item.max_usage_pct !== null && item.percentage > item.max_usage_pct))
                                                                        ? 'border-amber-500 text-amber-700 focus:ring-amber-500'
                                                                        : ''
                                                                    }`}
                                                                placeholder="0"
                                                            />
                                                            <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 pointer-events-none">%</span>
                                                        </div>
                                                        {!item.isQS && (
                                                            <button
                                                                onClick={() => onToggleLock(item.originalIndex!)}
                                                                aria-label={item.locked ? 'Unlock percentage' : 'Lock percentage'}
                                                                aria-pressed={!!item.locked}
                                                                title={item.locked ? 'Locked: balancing keeps this value. Click to unlock.' : 'Lock this value so balancing never changes it'}
                                                                className={`p-0.5 rounded transition-colors ${item.locked ? 'text-[#2c4c3b]' : 'text-gray-300 hover:text-gray-500'}`}
                                                            >
                                                                {item.locked ? <Lock size={12} /> : <LockOpen size={12} />}
                                                            </button>
                                                        )}
                                                        </div>

                                                        <div className="mt-0.5 leading-none">
                                                            {item.isQS ? (
                                                                <span className="text-[9px] font-bold text-blue-500 uppercase tracking-wider">Q.S. Base</span>
                                                            ) : (
                                                                (item.min_usage_pct !== null || item.max_usage_pct !== null) && (
                                                                    <span
                                                                        className={`text-[9px] font-mono tracking-tighter ${(item.min_usage_pct !== null && item.percentage < item.min_usage_pct && item.percentage > 0) ||
                                                                            (item.max_usage_pct !== null && item.percentage > item.max_usage_pct)
                                                                            ? 'text-amber-600 font-semibold'
                                                                            : 'text-gray-400'
                                                                            }`}
                                                                        title={`Recommended range: ${item.min_usage_pct ?? 0}% - ${item.max_usage_pct ?? 100}%`}
                                                                    >
                                                                        {item.min_usage_pct !== null && item.max_usage_pct !== null
                                                                            ? `${item.min_usage_pct}–${item.max_usage_pct}%`
                                                                            : item.max_usage_pct !== null
                                                                                ? `≤${item.max_usage_pct}%`
                                                                                : `≥${item.min_usage_pct}%`}
                                                                    </span>
                                                                )
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>

                                                {/* 4. Weight Column */}
                                                <td className="px-4 py-2 text-gray-600">
                                                    {item.percentage
                                                        ? `${((item.percentage / 100) * targetWeight).toFixed(2)}g`
                                                        : '0.00g'}
                                                </td>

                                                {/* 5. Phase Column (Moved here) */}
                                                <td className="px-4 py-2">
                                                    <div className="flex items-center justify-center gap-2">
                                                        <button
                                                            onClick={() => onPhaseChange(item.originalIndex!, cyclePhase(item.phase, -1))}
                                                            className="text-gray-400 hover:text-[#2c4c3b] font-bold px-1"
                                                        >
                                                            ◀
                                                        </button>
                                                        <span className="font-bold text-gray-700 w-4 text-center">{item.phase}</span>
                                                        <button
                                                            onClick={() => onPhaseChange(item.originalIndex!, cyclePhase(item.phase, 1))}
                                                            className="text-gray-400 hover:text-[#2c4c3b] font-bold px-1"
                                                        >
                                                            ▶
                                                        </button>
                                                    </div>
                                                </td>

                                                {/* 6. Action Column */}
                                                <td
                                                    className="px-4 py-2 text-gray-400 cursor-pointer hover:text-red-500 text-center"
                                                    onClick={() => onRemove(item.originalIndex!)}
                                                    title="Remove ingredient"
                                                >
                                                    🗑
                                                </td>
                                            </tr>
                                            {needsAttention && (
                                                <SubstitutionHint
                                                    item={stock}
                                                    isSearching={isSearchingSubstitutes}
                                                    onSwap={(option) => onSwap(item.originalIndex!, option)}
                                                />
                                            )}
                                            </Fragment>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                );
            })}

            {/* Total Footer */}
            <div className="bg-[#f0f4ef] px-4 py-3 text-right font-medium flex flex-wrap justify-between gap-3 items-center border-t border-[#c1d1b9]" data-tour="total">
                <div className="flex items-center gap-3" data-tour="balance">
                    <button
                        onClick={() => onBalance()}
                        disabled={formulaIngredients.length === 0}
                        title="Suggest logical percentages and fill to 100%"
                        className="flex items-center gap-1.5 px-3 py-1 bg-white border border-[#c1d1b9] rounded shadow-sm text-xs font-bold text-[#2c4c3b] hover:bg-[#e9eee7] disabled:opacity-50 transition-colors"
                    >
                        <Scale size={14} aria-hidden /> Balance
                    </button>
                    <label className="flex items-center gap-1.5 text-xs font-normal text-gray-600 cursor-pointer" title="Rebalance automatically when you add or remove ingredients. Values you type are locked.">
                        <input
                            type="checkbox"
                            checked={isAutoBalance}
                            onChange={(e) => onToggleAutoBalance(e.target.checked)}
                            className="w-3.5 h-3.5 accent-[#2c4c3b]"
                        />
                        Auto
                    </label>
                </div>
                <div className="flex items-center gap-2">
                <span>
                    Total: {currentTotalPercentage.toFixed(2)}% | {((currentTotalPercentage / 100) * targetWeight).toFixed(2)}g
                    {targetWeight > 0 && ` (of ${targetWeight.toFixed(2)}g target)`}
                </span>
                {Math.abs(currentTotalPercentage - 100) > 0.001 && (
                    <span
                        className="w-4 h-4 bg-yellow-400 rounded-full flex items-center justify-center text-[10px] text-white"
                        title="Formula total must equal 100%"
                    >
                        !
                    </span>
                )}
                </div>
            </div>
        </div>
    );
}
