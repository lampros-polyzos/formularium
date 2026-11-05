import React, { useState, useMemo, useEffect } from 'react';
import { fetchContainers, fetchStash } from '../lib/libraryApi';

export interface FormulaIngredientInput {
    ingredient_id: string;
    name: string;
    percentage: number;
}

interface FormulationCostCalculatorProps {
    formulaIngredients?: FormulaIngredientInput[];
    currencySymbol?: string;
    initialBatchSize?: number;
}

type StashItem = {
    id: string;
    ingredient_id: string;
    ingredient_name: string;
    price_per_g: number;
    amount_left_g: number;
};

type ContainerItem = {
    id: string;
    name: string;
    price_per_unit: number;
    quantity: number;
};

type FormulaRow = {
    id: string;
    stashId: string;
    customName: string;
    percentage: number;
};

export default function FormulationCostCalculator({
    formulaIngredients = [],
    currencySymbol = '$',
    initialBatchSize = 200
}: FormulationCostCalculatorProps) {
    const [isExpanded, setIsExpanded] = useState<boolean>(false);
    const [batchSizeGrams, setBatchSizeGrams] = useState<number>(initialBatchSize);
    const [rows, setRows] = useState<FormulaRow[]>([]);

    const [stash, setStash] = useState<StashItem[]>([]);
    const [containers, setContainers] = useState<ContainerItem[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);

    const [selectedContainerId, setSelectedContainerId] = useState<string>('');
    const [containersUsed, setContainersUsed] = useState<number>(1);

    useEffect(() => {
        if (initialBatchSize) {
            setBatchSizeGrams(initialBatchSize);
        }
    }, [initialBatchSize]);

    useEffect(() => {
        const fetchInventoryData = async () => {
            setIsLoading(true);
            try {
                const [stashData, containerData] = await Promise.all([fetchStash(), fetchContainers()]);

                const formattedStash = (stashData || []).map((item: any) => ({
                    id: item.id,
                    ingredient_id: item.ingredient_id,
                    ingredient_name: item.ingredients?.trade_name || item.ingredients?.inci_name || 'Unknown Ingredient',
                    price_per_g: item.price_per_g || 0,
                    amount_left_g: item.amount_left_g || 0
                }));

                setStash(formattedStash);
                setContainers(containerData || []);
            } catch (error) {
                console.error('Error fetching inventory:', error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchInventoryData();
    }, []);

    useEffect(() => {
        if (formulaIngredients.length > 0 && stash.length > 0) {
            const syncedRows = formulaIngredients.map((fi, index) => {
                const matchingStash = stash.find(s => s.ingredient_id === fi.ingredient_id);
                return {
                    id: `auto-${index}-${fi.ingredient_id}`,
                    stashId: matchingStash ? matchingStash.id : '',
                    customName: fi.name,
                    percentage: fi.percentage
                };
            });
            setRows(syncedRows);
        } else if (formulaIngredients.length === 0 && rows.length > 0 && rows[0].id.startsWith('auto-')) {
            setRows([]);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [formulaIngredients, stash]);

    const { calculatedRows, totalIngredientCost, totalPercentage } = useMemo(() => {
        let costAccumulator = 0;
        let percentAccumulator = 0;

        const calculated = rows.map(row => {
            const stashItem = stash.find(s => s.id === row.stashId);
            const gramsNeeded = (row.percentage / 100) * batchSizeGrams;

            let rowCost = 0;
            if (stashItem && stashItem.price_per_g > 0) {
                rowCost = gramsNeeded * stashItem.price_per_g;
            }

            costAccumulator += rowCost;
            percentAccumulator += row.percentage;

            return {
                ...row,
                stashItem,
                gramsNeeded,
                rowCost
            };
        });

        return {
            calculatedRows: calculated,
            totalIngredientCost: costAccumulator,
            totalPercentage: percentAccumulator
        };
    }, [rows, batchSizeGrams, stash]);

    const containerCost = useMemo(() => {
        const container = containers.find(c => c.id === selectedContainerId);
        if (!container || container.quantity === 0) return 0;
        return container.price_per_unit * containersUsed;
    }, [selectedContainerId, containersUsed, containers]);

    const totalBatchCost = totalIngredientCost + containerCost;

    const addEmptyRow = () => {
        setRows([...rows, { id: Date.now().toString(), stashId: '', customName: '', percentage: 0 }]);
    };

    const updateRow = (id: string, field: keyof FormulaRow, value: string | number) => {
        setRows(rows.map(row => row.id === id ? { ...row, [field]: value } : row));
    };

    const removeRow = (id: string) => {
        setRows(rows.filter(row => row.id !== id));
    };

    if (isLoading) {
        return <div className="p-6 text-gray-500 animate-pulse bg-white rounded-2xl border border-gray-100 shadow-sm">Loading inventory data...</div>;
    }

    return (
        <div className="max-w-4xl bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div
                className="p-6 pb-4 flex justify-between items-center cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div>
                    <h2 className="text-2xl font-bold text-[#1f382a] flex items-center gap-2">
                        Inventory Cost Calculator
                        <svg
                            className={`w-6 h-6 text-gray-400 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">Live calculation based on your current stash and containers.</p>
                </div>

                <div className="flex items-center gap-3" onClick={e => e.stopPropagation()}>
                    <label className="text-sm font-semibold text-gray-700">Batch Size (g):</label>
                    <input
                        type="number"
                        min="0"
                        value={batchSizeGrams}
                        onChange={(e) => setBatchSizeGrams(parseFloat(e.target.value) || 0)}
                        className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2c4c3b] outline-none font-mono text-right"
                    />
                </div>
            </div>

            {isExpanded && (
                <div className="p-6 pt-2 border-t border-gray-100">
                    <div className="overflow-x-auto mb-6">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-[#e8f0e5] text-[#1f382a] text-sm">
                                    <th className="p-3 rounded-tl-lg font-bold">Formula Ingredient</th>
                                    <th className="p-3 font-bold">Stash Match</th>
                                    <th className="p-3 font-bold w-20 text-right">%</th>
                                    <th className="p-3 font-bold w-28 text-right">Cost / g</th>
                                    <th className="p-3 font-bold w-24 text-right">Req. (g)</th>
                                    <th className="p-3 font-bold w-28 text-right">Row Cost</th>
                                    <th className="p-3 rounded-tr-lg w-10 text-center"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {calculatedRows.map((row) => (
                                    <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="p-2 text-sm text-gray-700 font-medium">
                                            {row.customName || 'Custom Row'}
                                        </td>
                                        <td className="p-2">
                                            <select
                                                value={row.stashId}
                                                onChange={(e) => updateRow(row.id, 'stashId', e.target.value)}
                                                className="w-full bg-transparent p-1 border border-transparent hover:border-gray-300 rounded outline-none text-sm text-gray-700 cursor-pointer"
                                            >
                                                <option value="">No stash match...</option>
                                                {stash.map(s => (
                                                    <option key={s.id} value={s.id}>{s.ingredient_name}</option>
                                                ))}
                                            </select>
                                        </td>
                                        <td className="p-2 text-right">
                                            <input
                                                type="number"
                                                min="0"
                                                step="0.1"
                                                value={row.percentage}
                                                onChange={(e) => updateRow(row.id, 'percentage', parseFloat(e.target.value) || 0)}
                                                className="w-full bg-transparent p-1 outline-none text-sm text-right font-mono border border-transparent hover:border-gray-300 rounded"
                                            />
                                        </td>
                                        <td className="p-2 text-right font-mono text-sm text-gray-500 bg-gray-50/50">
                                            {row.stashItem ? `${currencySymbol}${row.stashItem.price_per_g.toFixed(4)}` : '-'}
                                        </td>
                                        <td className="p-2 text-right font-mono text-sm text-gray-600 bg-gray-50/50">
                                            {row.gramsNeeded.toFixed(2)}g
                                            {row.stashItem && row.stashItem.amount_left_g < row.gramsNeeded && (
                                                <span className="block text-[10px] text-red-500 font-bold leading-tight mt-0.5">LOW STOCK</span>
                                            )}
                                        </td>
                                        <td className="p-2 text-right font-mono text-sm font-semibold text-[#1f382a] bg-gray-50/50">
                                            {currencySymbol}{row.rowCost.toFixed(3)}
                                        </td>
                                        <td className="p-2 text-center">
                                            <button onClick={() => removeRow(row.id)} className="text-red-400 hover:text-red-600 font-bold p-1">
                                                ×
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <button
                        onClick={addEmptyRow}
                        className="text-sm font-bold text-[#2c4c3b] hover:text-[#1f382a] bg-[#e8f0e5] px-4 py-2 rounded-lg transition-colors mb-6"
                    >
                        + Add Custom Row
                    </button>

                    <div className="grid grid-cols-2 gap-6 p-4 border border-gray-200 rounded-xl bg-gray-50 mb-6">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Packaging / Container</label>
                            <select
                                value={selectedContainerId}
                                onChange={(e) => setSelectedContainerId(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2c4c3b] outline-none text-sm bg-white"
                            >
                                <option value="">No packaging (Bulk)</option>
                                {containers.map(c => (
                                    <option key={c.id} value={c.id}>
                                        {c.name} ({currencySymbol}{c.price_per_unit.toFixed(2)} ea)
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Containers Used</label>
                            <input
                                type="number"
                                min="1"
                                value={containersUsed}
                                onChange={(e) => setContainersUsed(parseInt(e.target.value) || 1)}
                                disabled={!selectedContainerId}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2c4c3b] outline-none text-sm disabled:opacity-50 bg-white"
                            />
                        </div>
                    </div>

                    <div className="flex justify-end mt-6">
                        <div className="bg-[#1f382a] text-white p-6 rounded-xl min-w-[320px] shadow-lg">
                            <div className="flex justify-between items-center mb-2 text-sm">
                                <span className="text-gray-300">Total Formula %</span>
                                <span className={`font-mono font-bold ${totalPercentage !== 100 ? 'text-amber-400' : 'text-green-400'}`}>
                                    {totalPercentage.toFixed(2)}%
                                </span>
                            </div>
                            <div className="flex justify-between items-center mb-2 text-sm">
                                <span className="text-gray-300">Raw Ingredients Cost</span>
                                <span className="font-mono">{currencySymbol}{totalIngredientCost.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between items-center mb-3 text-sm">
                                <span className="text-gray-300">Packaging Cost</span>
                                <span className="font-mono">{currencySymbol}{containerCost.toFixed(2)}</span>
                            </div>

                            <div className="h-px bg-white/20 my-3"></div>

                            <div className="flex justify-between items-center text-xl mb-1">
                                <span className="font-bold">Total Batch Cost</span>
                                <span className="font-mono font-bold text-green-400">{currencySymbol}{totalBatchCost.toFixed(2)}</span>
                            </div>

                            {selectedContainerId && containersUsed > 0 && (
                                <div className="flex justify-between items-center mt-2 text-sm text-green-200">
                                    <span>Cost per Packaged Unit</span>
                                    <span className="font-mono font-bold">{currencySymbol}{(totalBatchCost / containersUsed).toFixed(2)}</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}