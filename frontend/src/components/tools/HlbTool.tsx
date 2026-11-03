import { useState } from 'react';
import { EMULSIFIER_PRESETS, OIL_PRESETS, fmt, hlbMeaning, num, requiredHlb, twoEmulsifierMix } from '../../lib/calculators';
import { Big, Card, Field, Result, inputClass } from './Fields';

interface OilRow { preset: string; required: string; grams: string }

const CUSTOM = 'custom';
const emptyRow = (): OilRow => ({ preset: CUSTOM, required: '', grams: '' });

export default function HlbTool({ params }: { params: URLSearchParams }) {
    const [oils, setOils] = useState<OilRow[]>([{ preset: 'Jojoba oil', required: '6.5', grams: '' }, emptyRow()]);
    const [targetInput, setTargetInput] = useState(params.get('hlb') ?? '');
    const [lowName, setLowName] = useState('Steareth-2');
    const [highName, setHighName] = useState('Steareth-20');
    const [lowCustom, setLowCustom] = useState('');
    const [highCustom, setHighCustom] = useState('');
    const [totalG, setTotalG] = useState('');

    const setOil = (i: number, patch: Partial<OilRow>) => setOils(rows => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    const pickOil = (i: number, name: string) => {
        const preset = OIL_PRESETS.find(o => o.name === name);
        setOil(i, { preset: name, required: preset ? String(preset.requiredHlb) : '' });
    };

    const needed = requiredHlb(oils.map(o => ({ requiredHlb: num(o.required), grams: num(o.grams) })));
    const target = targetInput.trim() !== '' ? num(targetInput) : needed ?? NaN;

    const hlbOf = (name: string, custom: string) => (name === CUSTOM ? num(custom) : EMULSIFIER_PRESETS.find(e => e.name === name)?.hlb ?? NaN);
    const lowHlb = hlbOf(lowName, lowCustom);
    const highHlb = hlbOf(highName, highCustom);
    const mix = twoEmulsifierMix(lowHlb, highHlb, target);
    const total = num(totalG);

    const emulsifierSelect = (label: string, value: string, setValue: (v: string) => void, custom: string, setCustom: (v: string) => void) => (
        <div>
            <label className="block text-xs font-bold text-[#3a5a4a] mb-1" htmlFor={`em-${label}`}>{label}</label>
            <select id={`em-${label}`} value={value} onChange={e => setValue(e.target.value)} className={inputClass}>
                {EMULSIFIER_PRESETS.map(e => <option key={e.name} value={e.name}>{e.name} (HLB {e.hlb})</option>)}
                <option value={CUSTOM}>Other (type the HLB)</option>
            </select>
            {value === CUSTOM && <div className="mt-2"><Field label="HLB" value={custom} onChange={setCustom} /></div>}
        </div>
    );

    return (
        <>
            <Card title="1. What HLB does your oil phase need?">
                <p className="text-sm text-gray-600 mb-4">List the oils, butters and waxes in the oil phase with how much of each. Each has a "required HLB" for an oil-in-water emulsion.</p>
                <div className="space-y-3">
                    {oils.map((o, i) => (
                        <div key={i} className="grid grid-cols-12 gap-2 items-end">
                            <div className="col-span-6">
                                <label className="block text-xs font-bold text-[#3a5a4a] mb-1" htmlFor={`oil-${i}`}>Ingredient</label>
                                <select id={`oil-${i}`} value={o.preset} onChange={e => pickOil(i, e.target.value)} className={inputClass}>
                                    <option value={CUSTOM}>Other (type the HLB)</option>
                                    {OIL_PRESETS.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                                </select>
                            </div>
                            <div className="col-span-2"><Field label="Req. HLB" value={o.required} onChange={v => setOil(i, { required: v, preset: CUSTOM })} /></div>
                            <div className="col-span-3"><Field label="Grams" value={o.grams} onChange={v => setOil(i, { grams: v })} /></div>
                            <button type="button" aria-label={`Remove row ${i + 1}`} onClick={() => setOils(rows => rows.filter((_, j) => j !== i))} disabled={oils.length === 1} className="col-span-1 pb-2 text-gray-400 hover:text-red-600 disabled:opacity-30">✕</button>
                        </div>
                    ))}
                </div>
                <button type="button" onClick={() => setOils(rows => [...rows, emptyRow()])} className="mt-3 text-sm font-bold text-[#2c4c3b] hover:underline">+ Add an ingredient</button>
                {needed !== null && <Result>Your oil phase needs an HLB of about <Big>{fmt(needed)}</Big>.</Result>}
            </Card>

            <Card title="2. Mix two emulsifiers to reach it">
                <div className="grid sm:grid-cols-2 gap-4 mb-4">
                    {emulsifierSelect('Low-HLB emulsifier', lowName, setLowName, lowCustom, setLowCustom)}
                    {emulsifierSelect('High-HLB emulsifier', highName, setHighName, highCustom, setHighCustom)}
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                    <Field label="Target HLB" value={targetInput} onChange={setTargetInput} placeholder={needed !== null ? fmt(needed) : 'e.g. 9'} hint="Leave empty to use the HLB from step 1." />
                    <Field label="Total emulsifier (optional)" value={totalG} onChange={setTotalG} suffix="g" hint="To get grams of each." />
                </div>
                {mix === null && Number.isFinite(lowHlb) && Number.isFinite(highHlb) && lowHlb >= highHlb && (
                    <Result tone="warn">The "low" emulsifier needs a lower HLB than the "high" one.</Result>
                )}
                {mix && (
                    <Result tone={mix.reachable ? 'good' : 'warn'}>
                        {!mix.reachable && <p className="mb-2">These two cannot reach an HLB of {fmt(target)}. The closest blend is {fmt(mix.achievedHlb)}; pick an emulsifier with a {target < lowHlb ? 'lower' : 'higher'} HLB.</p>}
                        <p>
                            Use <Big>{fmt(mix.lowPct)}%</Big> {lowName === CUSTOM ? 'low-HLB emulsifier' : lowName} and <Big>{fmt(mix.highPct)}%</Big> {highName === CUSTOM ? 'high-HLB emulsifier' : highName}
                            {' '}for an HLB of {fmt(mix.achievedHlb)}.
                        </p>
                        {total > 0 && <p className="mt-2">For {fmt(total)} g of emulsifier: <Big>{fmt((total * mix.lowPct) / 100)} g</Big> and <Big>{fmt((total * mix.highPct) / 100)} g</Big>.</p>}
                        <p className="mt-2 text-xs opacity-80">{hlbMeaning(mix.achievedHlb)}.</p>
                    </Result>
                )}
            </Card>
            <p className="text-xs text-gray-500">HLB values are typical published figures and vary a little by supplier: check your datasheet. Most creams use 3 to 5% of emulsifier in total.</p>
        </>
    );
}
