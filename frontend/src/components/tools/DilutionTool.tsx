import { useState } from 'react';
import { dilution, fmt, num } from '../../lib/calculators';
import { Big, Card, Field, Result } from './Fields';

export default function DilutionTool() {
    const [targetG, setTargetG] = useState('');
    const [stockPct, setStockPct] = useState('50');
    const [targetPct, setTargetPct] = useState('10');

    const result = dilution(num(targetG), num(stockPct), num(targetPct));
    const touched = targetG.trim() !== '';

    return (
        <Card title="Make a weaker solution from a stronger one">
            <p className="text-sm text-gray-600 mb-4">For example, a 10% solution from a 50% one. Use 100% if you are starting from the pure powder or liquid.</p>
            <div className="grid sm:grid-cols-3 gap-4">
                <Field label="Stock strength (what you have)" value={stockPct} onChange={setStockPct} suffix="%" />
                <Field label="Wanted strength" value={targetPct} onChange={setTargetPct} suffix="%" />
                <Field label="How much to make" value={targetG} onChange={setTargetG} suffix="g" />
            </div>
            {typeof result === 'object' && (
                <Result>Mix <Big>{fmt(result.stockG)} g</Big> of the {fmt(num(stockPct))}% stock with <Big>{fmt(result.diluentG)} g</Big> of water (or other diluent) to get {fmt(num(targetG))} g of {fmt(num(targetPct))}% solution.</Result>
            )}
            {touched && result === 'too-strong' && <Result tone="warn">You cannot make a solution stronger than the stock by adding water.</Result>}
            {touched && result === 'invalid' && <Result tone="warn">Enter positive numbers, with strengths up to 100%.</Result>}
            <p className="text-xs text-gray-500 mt-4">Strengths are by weight. Weigh both parts on a scale instead of measuring millilitres.</p>
        </Card>
    );
}
