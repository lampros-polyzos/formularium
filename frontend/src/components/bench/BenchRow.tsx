import { Check } from 'lucide-react';
import { gramsText, type BenchLine } from '../../lib/benchSession';


interface BenchRowProps {
    line: BenchLine;
    checked: boolean;
    /** Cannot be ticked yet; `note` says why. */
    disabled?: boolean;
    note?: string;
    onToggle: () => void;
}

/** One ingredient: the whole row is the tick box, and the amount is the biggest thing on it. */
export default function BenchRow({ line, checked, disabled = false, note, onToggle }: BenchRowProps) {
    return (
        <button
            type="button"
            role="checkbox"
            aria-checked={checked}
            aria-label={`${line.name}, ${gramsText(line.grams)} grams`}
            disabled={disabled}
            onClick={onToggle}
            className={`w-full min-h-[5.5rem] flex items-center gap-4 px-4 py-3 rounded-2xl border-2 text-left transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-[#2c4c3b]/40 ${
                checked
                    ? 'bg-green-50 border-green-600'
                    : disabled
                        ? 'bg-gray-100 border-gray-200 opacity-60 cursor-not-allowed'
                        : 'bg-white border-[#c1d1b9] active:bg-[#e9eee7]'
            }`}
        >
            <span
                aria-hidden
                className={`shrink-0 w-12 h-12 rounded-full border-2 flex items-center justify-center ${checked ? 'bg-green-600 border-green-600 text-white' : 'border-gray-300 text-transparent'}`}
            >
                <Check size={28} strokeWidth={3} />
            </span>
            <span className="min-w-0 flex-1">
                <span className={`block text-xl font-semibold leading-tight ${checked ? 'text-green-900' : 'text-[#1f382a]'}`}>{line.name}</span>
                {(note || line.inciName) && <span className="block text-sm text-gray-500 truncate">{note ?? line.inciName}</span>}
            </span>
            <span className={`shrink-0 text-4xl font-bold tabular-nums ${checked ? 'text-green-800' : 'text-[#1f382a]'}`}>
                {gramsText(line.grams)}<span className="text-xl font-semibold text-gray-500 ml-1">g</span>
            </span>
        </button>
    );
}
