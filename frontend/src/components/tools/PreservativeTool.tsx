import { useState } from 'react';
import { PRESERVATIVE_PRESETS, doseStatus, fmt, num, preservativeDose, type DoseBasis } from '../../lib/calculators';
import { Big, Card, Field, Result, inputClass } from './Fields';

const CUSTOM = 'custom';

export default function PreservativeTool({ params }: { params: URLSearchParams }) {
    const [batchG, setBatchG] = useState(params.get('batch') ?? '');
    const [waterPct, setWaterPct] = useState(params.get('water') ?? '');
    const [basis, setBasis] = useState<DoseBasis>(params.get('water') ? 'water' : 'total');
    const [presetName, setPresetName] = useState(PRESERVATIVE_PRESETS[0].name);
    const [dose, setDose] = useState(String((PRESERVATIVE_PRESETS[0].min + PRESERVATIVE_PRESETS[0].max) / 2));

    const preset = PRESERVATIVE_PRESETS.find(p => p.name === presetName);
    const pick = (name: string) => {
        setPresetName(name);
        const p = PRESERVATIVE_PRESETS.find(x => x.name === name);
        if (p) setDose(String(Math.round(((p.min + p.max) / 2) * 100) / 100));
    };

    const result = preservativeDose(num(batchG), num(dose), basis, num(waterPct));
    const status = result && preset ? doseStatus(result.pctOfBatch, preset.min, preset.max) : null;

    return (
        <Card title="How much preservative does the batch need?">
            <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Batch size" value={batchG} onChange={setBatchG} suffix="g" />
                <div>
                    <label htmlFor="preservative" className="block text-xs font-bold text-[#3a5a4a] mb-1">Preservative</label>
                    <select id="preservative" value={presetName} onChange={e => pick(e.target.value)} className={inputClass}>
                        {PRESERVATIVE_PRESETS.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                        <option value={CUSTOM}>Other (type the dose)</option>
                    </select>
                </div>
                <Field label="Dose" value={dose} onChange={setDose} suffix="%" hint={preset ? `Typical range: ${preset.min} to ${preset.max}% of the batch.` : 'Use the percentage on your supplier datasheet.'} />
                <div>
                    <span className="block text-xs font-bold text-[#3a5a4a] mb-1">The dose is a share of</span>
                    <div className="flex gap-4 text-sm py-2">
                        <label className="flex items-center gap-2"><input type="radio" name="basis" checked={basis === 'total'} onChange={() => setBasis('total')} /> The whole batch</label>
                        <label className="flex items-center gap-2"><input type="radio" name="basis" checked={basis === 'water'} onChange={() => setBasis('water')} /> Only the water</label>
                    </div>
                </div>
                {basis === 'water' && <Field label="Water in the batch" value={waterPct} onChange={setWaterPct} suffix="%" hint="Water phase, hydrosols and water-based extracts." />}
            </div>

            {result && (
                <Result tone={status === 'ok' || status === null ? 'good' : 'warn'}>
                    <p>Add <Big>{fmt(result.grams)} g</Big> of preservative, which is {fmt(result.pctOfBatch)}% of the whole batch.</p>
                    {status === 'low' && preset && <p className="mt-2">That is below the usual {preset.min} to {preset.max}%. Too little may not protect the product.</p>}
                    {status === 'high' && preset && <p className="mt-2">That is above the usual {preset.min} to {preset.max}%. Check the supplier's maximum.</p>}
                    {preset?.maxPh && <p className="mt-2">Works only up to about pH {preset.maxPh}: check your product pH.</p>}
                    {preset?.note && <p className="mt-2">{preset.note}</p>}
                </Result>
            )}
            <p className="text-xs text-gray-500 mt-4">Any product containing water needs a broad-spectrum preservative, including anything that gets wet in use. Ranges are typical: always follow the datasheet of the product you bought.</p>
        </Card>
    );
}
