import { Link } from 'react-router-dom';
import { OBSERVATIONS } from '../types/batches';

/** "Why does this happen?" links into the Learn hub for what was noticed, so a bad result points at what to do. */
export default function ObservationHelp({ observations }: { observations: string[] }) {
    const items = OBSERVATIONS.filter(o => observations.includes(o.id));
    if (items.length === 0) return null;
    return (
        <ul aria-label="Why this happens" className="text-xs space-y-0.5">
            {items.map(o => (
                <li key={o.id}>
                    <Link to={`/learn?q=${encodeURIComponent(o.learn)}`} className="font-medium text-[#2c4c3b] hover:underline">
                        Why: {o.label.toLowerCase()}? What to try →
                    </Link>
                </li>
            ))}
        </ul>
    );
}
