import { useEffect } from 'react';
import { Lock, Scale, TriangleAlert, X } from 'lucide-react';
import { fmt, ROLE_LABELS, type BalanceResult, type FormulaKind } from '../lib/autoBalance';

const KIND_LABELS: Record<FormulaKind, string> = {
    ow: 'Oil-in-water emulsion',
    wo: 'Water-in-oil emulsion',
    anhydrous: 'Anhydrous (no water)',
    aqueous: 'Water-based (toner, serum, gel)',
    surfactant: 'Cleanser (surfactant system)',
};

interface BalancePreviewModalProps {
    result: BalanceResult;
    names: string[];
    keepLipidLoad: boolean;
    onKeepLipidLoadChange: (value: boolean) => void;
    onApply: () => void;
    onClose: () => void;
}

export default function BalancePreviewModal({ result, names, keepLipidLoad, onKeepLipidLoadChange, onApply, onClose }: BalancePreviewModalProps) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const changedCount = result.lines.filter(l => l.changed).length;
    const showsLipidOption = result.kind === 'ow' || result.kind === 'wo';

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="balance-title"
                className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="bg-[#e9eee7] px-6 py-4 border-b border-[#c1d1b9] flex justify-between items-start gap-4">
                    <div>
                        <h3 id="balance-title" className="text-lg font-bold text-[#1f382a] flex items-center gap-2">
                            <Scale size={20} aria-hidden /> Balance percentages
                        </h3>
                        <p className="text-xs text-gray-600 mt-0.5">
                            Treated as: <strong>{KIND_LABELS[result.kind]}</strong>. Locked rows are kept as they are.
                        </p>
                    </div>
                    <button onClick={onClose} aria-label="Close" className="text-gray-500 hover:text-gray-800 p-1">
                        <X size={20} />
                    </button>
                </div>

                <div className="overflow-y-auto px-6 py-4 space-y-4">
                    {showsLipidOption && (
                        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={keepLipidLoad}
                                onChange={(e) => onKeepLipidLoadChange(e.target.checked)}
                                className="w-4 h-4 accent-[#2c4c3b]"
                            />
                            Keep my current amount of oils and butters (otherwise use the typical level for this product type)
                        </label>
                    )}

                    {result.warnings.length > 0 && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-900 space-y-1">
                            {result.warnings.map(w => (
                                <p key={w} className="flex gap-2"><TriangleAlert size={16} className="shrink-0 mt-0.5" aria-hidden /> {w}</p>
                            ))}
                        </div>
                    )}

                    <div className="overflow-x-auto border border-gray-200 rounded-lg">
                        <table className="w-full text-sm text-left min-w-[560px]">
                            <thead className="bg-gray-50 text-xs text-gray-500">
                                <tr>
                                    <th className="px-3 py-2 font-medium">Ingredient</th>
                                    <th className="px-3 py-2 font-medium text-right">Now</th>
                                    <th className="px-3 py-2 font-medium text-right">Proposed</th>
                                    <th className="px-3 py-2 font-medium">Why</th>
                                </tr>
                            </thead>
                            <tbody>
                                {result.lines.map(line => (
                                    <tr key={line.index} className={`border-t border-gray-100 align-top ${line.changed ? 'bg-[#f6faf5]' : ''}`}>
                                        <td className="px-3 py-2">
                                            <div className="font-medium text-[#1f382a] flex items-center gap-1">
                                                {line.role === 'locked' && <Lock size={12} className="text-gray-400" aria-label="Locked" />}
                                                {names[line.index]}
                                            </div>
                                            <div className="text-[10px] text-gray-500">{ROLE_LABELS[line.role]}</div>
                                        </td>
                                        <td className="px-3 py-2 text-right font-mono text-gray-500 whitespace-nowrap">{fmt(line.before)}</td>
                                        <td className={`px-3 py-2 text-right font-mono whitespace-nowrap ${line.changed ? 'font-bold text-[#1f382a]' : 'text-gray-500'}`}>
                                            {fmt(line.after)}
                                        </td>
                                        <td className="px-3 py-2 text-xs text-gray-600">{line.reason}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="border-t border-gray-200 bg-gray-50 font-bold">
                                    <td className="px-3 py-2">Total</td>
                                    <td className="px-3 py-2 text-right font-mono">{fmt(result.lines.reduce((s, l) => s + l.before, 0))}</td>
                                    <td className={`px-3 py-2 text-right font-mono ${Math.abs(result.total - 100) > 0.01 ? 'text-amber-700' : 'text-[#1f382a]'}`}>{fmt(result.total)}</td>
                                    <td />
                                </tr>
                            </tfoot>
                        </table>
                    </div>

                    <p className="text-xs text-gray-500">
                        These are starting points based on each ingredient's usage range and the product type. Check the live health check and your supplier's datasheets, and make a small test batch.
                    </p>
                </div>

                <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-between items-center gap-3">
                    <span className="text-xs text-gray-500">{changedCount} of {result.lines.length} values change</span>
                    <div className="flex gap-2">
                        <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 rounded hover:bg-gray-100">Cancel</button>
                        <button
                            onClick={onApply}
                            disabled={changedCount === 0}
                            className="px-5 py-2 bg-[#1f382a] text-white text-sm font-bold rounded hover:bg-[#2c4c3b] disabled:opacity-50 transition-colors"
                        >
                            Apply
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
