import { useState } from 'react';
import { GRAMS_PER_DROP, fmt, num, scaleTitration, stockSolution, toGrams, type AdjusterUnit } from '../../lib/calculators';
import { Big, Card, Field, Result, inputClass } from './Fields';

const PROBLEMS = {
    invalid: 'Fill in every number to see the dose.',
    'no-change': 'The pH did not move in your test, so the dose cannot be worked out. Add a little more in the test and measure again.',
    'wrong-direction': 'Your test moved the pH away from the target. You need the opposite adjuster (acid to lower, base to raise).',
    'no-move-needed': 'The pH is already at the target.',
} as const;

export default function PhDoseTool({ params }: { params: URLSearchParams }) {
    const [stockTotal, setStockTotal] = useState('20');
    const [stockPct, setStockPct] = useState('10');
    const [sampleG, setSampleG] = useState('20');
    const [used, setUsed] = useState('');
    const [unit, setUnit] = useState<AdjusterUnit>('drops');
    const [startPh, setStartPh] = useState('');
    const [endPh, setEndPh] = useState('');
    const [targetPh, setTargetPh] = useState(params.get('target') ?? '');
    const [batchG, setBatchG] = useState(params.get('batch') ?? '');

    const stock = stockSolution(num(stockTotal), num(stockPct));
    const usedG = toGrams(num(used), unit);
    const result = scaleTitration({ sampleG: num(sampleG), usedG, startPh: num(startPh), endPh: num(endPh), targetPh: num(targetPh), batchG: num(batchG) });
    const touched = [used, startPh, endPh].some(v => v.trim() !== '');

    return (
        <>
            <Card title="1. Make a diluted adjuster">
                <p className="text-sm text-gray-600 mb-4">Strong citric acid or lye is hard to dose by the drop. A 10% solution (10 g in 90 g of water) is easier to control. Always add the powder to the water, never the other way round, and wear gloves and eye protection.</p>
                <div className="grid sm:grid-cols-2 gap-4">
                    <Field label="How much solution" value={stockTotal} onChange={setStockTotal} suffix="g" />
                    <Field label="Strength" value={stockPct} onChange={setStockPct} suffix="%" />
                </div>
                {stock && <Result>Dissolve <Big>{fmt(stock.soluteG)} g</Big> of citric acid / sodium hydroxide in <Big>{fmt(stock.waterG)} g</Big> of distilled water.</Result>}
            </Card>

            <Card title="2. Test on a small sample">
                <p className="text-sm text-gray-600 mb-4">How far a drop moves the pH depends on how buffered your product is, so no formula can predict it. Take a small sample of your finished (cooled) batch, add a little of the adjuster, stir, and measure.</p>
                <div className="grid sm:grid-cols-2 gap-4">
                    <Field label="Sample size" value={sampleG} onChange={setSampleG} suffix="g" />
                    <div>
                        <span className="block text-xs font-bold text-[#3a5a4a] mb-1">Adjuster added to the sample</span>
                        <span className="flex gap-2">
                            <input type="text" inputMode="decimal" aria-label="Amount added" value={used} onChange={e => setUsed(e.target.value)} className={inputClass} />
                            <select aria-label="Unit added" value={unit} onChange={e => setUnit(e.target.value as AdjusterUnit)} className={`${inputClass} w-28`}>
                                <option value="drops">drops</option>
                                <option value="g">grams</option>
                                <option value="ml">ml</option>
                            </select>
                        </span>
                    </div>
                    <Field label="pH before" value={startPh} onChange={setStartPh} />
                    <Field label="pH after" value={endPh} onChange={setEndPh} />
                </div>
            </Card>

            <Card title="3. Scale up to your batch">
                <div className="grid sm:grid-cols-2 gap-4">
                    <Field label="Target pH" value={targetPh} onChange={setTargetPh} />
                    <Field label="Batch size" value={batchG} onChange={setBatchG} suffix="g" />
                </div>
                {touched && typeof result === 'string' && <Result tone={result === 'no-move-needed' ? 'good' : 'warn'}>{PROBLEMS[result]}</Result>}
                {typeof result === 'object' && (
                    <Result tone={result.extrapolated ? 'warn' : 'good'}>
                        <p>You need about <Big>{fmt(result.totalG)} g</Big> of this solution (roughly {fmt(result.totalG / GRAMS_PER_DROP)} drops).</p>
                        <p className="mt-2">Start with <Big>{fmt(result.firstAddG)} g</Big> (about three quarters), stir well, measure, and add the rest in small steps.</p>
                        {result.extrapolated && <p className="mt-2">Your target is well beyond what the test covered, so this is a rough guide. Repeat the test with a bigger addition for a better estimate.</p>}
                    </Result>
                )}
            </Card>
            <p className="text-xs text-gray-500">Measure with a calibrated meter or good strips, after the batch has cooled to room temperature. About 20 drops make 1 ml, and 1 ml of a dilute solution weighs about 1 g.</p>
        </>
    );
}
