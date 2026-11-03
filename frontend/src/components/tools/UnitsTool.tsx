import { useState } from 'react';
import { DENSITY_PRESETS, UNITS, celsiusToFahrenheit, convert, fahrenheitToCelsius, fmt, gramsToMl, mlToGrams, num, type Quantity } from '../../lib/calculators';
import { Big, Card, Field, Result, inputClass } from './Fields';

function UnitSelect({ quantity, value, onChange, label }: { quantity: Quantity; value: string; onChange: (v: string) => void; label: string }) {
    return (
        <select aria-label={label} value={value} onChange={e => onChange(e.target.value)} className={inputClass}>
            {Object.entries(UNITS[quantity]).map(([id, u]) => <option key={id} value={id}>{u.label}</option>)}
        </select>
    );
}

function Converter({ quantity, title, defaultFrom, defaultTo }: { quantity: Quantity; title: string; defaultFrom: string; defaultTo: string }) {
    const [value, setValue] = useState('');
    const [from, setFrom] = useState(defaultFrom);
    const [to, setTo] = useState(defaultTo);
    const result = convert(num(value), from, to, quantity);
    return (
        <Card title={title}>
            <div className="grid sm:grid-cols-3 gap-4 items-end">
                <Field label="Amount" value={value} onChange={setValue} />
                <UnitSelect quantity={quantity} value={from} onChange={setFrom} label={`${title} from`} />
                <UnitSelect quantity={quantity} value={to} onChange={setTo} label={`${title} to`} />
            </div>
            {Number.isFinite(result) && <Result><Big>{fmt(num(value))} {from}</Big> = <Big>{fmt(result)} {to}</Big></Result>}
        </Card>
    );
}

export default function UnitsTool() {
    const [amount, setAmount] = useState('');
    const [densityName, setDensityName] = useState(DENSITY_PRESETS[0].name);
    const [customDensity, setCustomDensity] = useState('');
    const [direction, setDirection] = useState<'g' | 'ml'>('g');
    const [celsius, setCelsius] = useState('');
    const [fahrenheit, setFahrenheit] = useState('');

    const density = densityName === 'custom' ? num(customDensity) : DENSITY_PRESETS.find(d => d.name === densityName)?.density ?? NaN;
    const weightResult = direction === 'g' ? gramsToMl(num(amount), density) : mlToGrams(num(amount), density);

    return (
        <>
            <Converter quantity="mass" title="Weight" defaultFrom="oz" defaultTo="g" />
            <Converter quantity="volume" title="Volume" defaultFrom="floz" defaultTo="ml" />

            <Card title="Weight to volume (and back)">
                <p className="text-sm text-gray-600 mb-4">A millilitre of oil weighs less than a millilitre of glycerin. Pick the ingredient to convert properly.</p>
                <div className="grid sm:grid-cols-3 gap-4 items-end">
                    <Field label="Amount" value={amount} onChange={setAmount} />
                    <select aria-label="Weight or volume" value={direction} onChange={e => setDirection(e.target.value as 'g' | 'ml')} className={inputClass}>
                        <option value="g">grams to millilitres</option>
                        <option value="ml">millilitres to grams</option>
                    </select>
                    <select aria-label="Ingredient density" value={densityName} onChange={e => setDensityName(e.target.value)} className={inputClass}>
                        {DENSITY_PRESETS.map(d => <option key={d.name} value={d.name}>{d.name} ({d.density} g/ml)</option>)}
                        <option value="custom">Other (type the density)</option>
                    </select>
                </div>
                {densityName === 'custom' && <div className="mt-3 max-w-xs"><Field label="Density" value={customDensity} onChange={setCustomDensity} suffix="g/ml" /></div>}
                {Number.isFinite(weightResult) && <Result><Big>{fmt(num(amount))} {direction}</Big> = <Big>{fmt(weightResult)} {direction === 'g' ? 'ml' : 'g'}</Big></Result>}
            </Card>

            <Card title="Temperature">
                <div className="grid sm:grid-cols-2 gap-4">
                    <Field label="Celsius" value={celsius} onChange={v => { setCelsius(v); setFahrenheit(Number.isFinite(num(v)) ? fmt(celsiusToFahrenheit(num(v))) : ''); }} suffix="°C" />
                    <Field label="Fahrenheit" value={fahrenheit} onChange={v => { setFahrenheit(v); setCelsius(Number.isFinite(num(v)) ? fmt(fahrenheitToCelsius(num(v))) : ''); }} suffix="°F" />
                </div>
                <p className="text-xs text-gray-500 mt-3">Typical heating: 70 to 75 °C (158 to 167 °F) for the oil and water phases. Most preservatives go in below 45 °C (113 °F).</p>
            </Card>
        </>
    );
}
