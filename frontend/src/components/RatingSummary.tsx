import StarRating from './StarRating';
import type { RatingStats } from '../lib/ratingStats';

/** Stars, average, number of ratings and "made it" count for a recipe card. */
export default function RatingSummary({ stats }: { stats?: RatingStats }) {
    if (!stats || stats.count === 0) {
        return <p className="text-[11px] text-gray-400 mb-2">Not rated yet</p>;
    }

    const label = `Rated ${stats.average.toFixed(1)} out of 5 by ${stats.count} ${stats.count === 1 ? 'person' : 'people'}`
        + (stats.madeIt > 0 ? `, ${stats.madeIt} made it` : '');

    return (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-600 mb-2" aria-label={label}>
            <span className="flex items-center gap-1.5" aria-hidden>
                <StarRating value={stats.average} size={13} />
                <span className="font-bold text-[#1f382a]">{stats.average.toFixed(1)}</span>
                <span className="text-gray-400">({stats.count})</span>
            </span>
            {stats.madeIt > 0 && (
                <span className="text-green-700 font-medium" aria-hidden>✓ {stats.madeIt} made it</span>
            )}
        </p>
    );
}
