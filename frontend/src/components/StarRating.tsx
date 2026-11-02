import { useState } from 'react';
import { Star } from 'lucide-react';

interface StarRatingProps {
    value: number;
    onChange?: (value: number) => void; // Omit for a read-only display
    size?: number;
    label?: string;
}

const STARS = [1, 2, 3, 4, 5];

export default function StarRating({ value, onChange, size = 18, label }: StarRatingProps) {
    const [hovered, setHovered] = useState<number | null>(null);

    // Read-only: draw a gold layer clipped to the exact average so 4.3 shows 4.3 stars
    if (!onChange) {
        const fillPercent = (Math.max(0, Math.min(5, value)) / 5) * 100;
        return (
            <span className="relative inline-flex whitespace-nowrap" role="img" aria-label={`${value.toFixed(1)} out of 5 stars`}>
                <span className="flex text-gray-300">
                    {STARS.map(n => <Star key={n} size={size} className="shrink-0" />)}
                </span>
                <span className="absolute inset-0 flex overflow-hidden text-amber-400" style={{ width: `${fillPercent}%` }}>
                    {STARS.map(n => <Star key={n} size={size} className="shrink-0 fill-current" />)}
                </span>
            </span>
        );
    }

    const shown = hovered ?? value;

    return (
        <div role="radiogroup" aria-label={label} className="inline-flex" onMouseLeave={() => setHovered(null)}>
            {STARS.map(n => (
                <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={value === n}
                    aria-label={`${n} star${n > 1 ? 's' : ''}`}
                    onClick={() => onChange(n)}
                    onMouseEnter={() => setHovered(n)}
                    className="p-0.5 rounded transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2c4c3b]"
                >
                    <Star size={size} className={n <= shown ? 'fill-amber-400 text-amber-400' : 'text-gray-300'} />
                </button>
            ))}
        </div>
    );
}
