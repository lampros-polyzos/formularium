export interface RatingRow {
    post_id: string;
    overall: number;
    made_it: boolean;
}

export interface RatingStats {
    count: number;
    average: number;
    /** How many raters said they actually made the recipe. */
    madeIt: number;
}

export type SortMode = 'newest' | 'top' | 'made';

/** Groups raw rating rows into one summary per recipe. */
export function summarizeRatings(rows: RatingRow[]): Map<string, RatingStats> {
    const sums = new Map<string, { total: number; count: number; madeIt: number }>();
    for (const row of rows) {
        const entry = sums.get(row.post_id) ?? { total: 0, count: 0, madeIt: 0 };
        entry.total += Number(row.overall);
        entry.count += 1;
        if (row.made_it) entry.madeIt += 1;
        sums.set(row.post_id, entry);
    }
    return new Map([...sums].map(([id, s]) => [id, { count: s.count, average: s.total / s.count, madeIt: s.madeIt }]));
}

/**
 * A recipe starts out counting as this many ratings of a cautious middling score, and its real ratings are
 * weighed in on top. So one 5-star rating scores about 3.6, while ten 5-star ratings score 4.5: it takes a
 * good number of ratings to reach the top, and few ratings can't outrank many.
 */
const PRIOR_SCORE = 3.5;
const PRIOR_RATINGS = 5;

/** A fair ranking score for "top rated". Unrated recipes score below everything. */
export function rankScore(stats: RatingStats | undefined): number {
    if (!stats || stats.count === 0) return -1;
    return (stats.count * stats.average + PRIOR_RATINGS * PRIOR_SCORE) / (stats.count + PRIOR_RATINGS);
}

export function sortPosts<T extends { id: string; created_at: string }>(posts: T[], stats: Map<string, RatingStats>, mode: SortMode): T[] {
    const newest = (a: T, b: T) => Date.parse(b.created_at) - Date.parse(a.created_at);
    if (mode === 'newest') return [...posts].sort(newest);

    if (mode === 'top') {
        return [...posts].sort((a, b) =>
            rankScore(stats.get(b.id)) - rankScore(stats.get(a.id))
            || (stats.get(b.id)?.count ?? 0) - (stats.get(a.id)?.count ?? 0)
            || newest(a, b));
    }
    return [...posts].sort((a, b) =>
        (stats.get(b.id)?.madeIt ?? 0) - (stats.get(a.id)?.madeIt ?? 0)
        || rankScore(stats.get(b.id)) - rankScore(stats.get(a.id))
        || newest(a, b));
}
