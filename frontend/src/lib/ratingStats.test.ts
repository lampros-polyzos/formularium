import { describe, expect, it } from 'vitest';
import { rankScore, sortPosts, summarizeRatings, type RatingRow } from './ratingStats';

const rating = (post: string, overall: number, madeIt = false): RatingRow => ({ post_id: post, overall, made_it: madeIt });
const ratings = (post: string, values: number[], madeIt = 0): RatingRow[] =>
    values.map((overall, i) => rating(post, overall, i < madeIt));
const post = (id: string, day: number) => ({ id, created_at: `2026-10-${String(day).padStart(2, '0')}T10:00:00Z` });

describe('summarizeRatings', () => {
    it('gives each recipe its average, number of ratings and made-it count', () => {
        const stats = summarizeRatings([rating('a', 5, true), rating('a', 4, false), rating('a', 3, true), rating('b', 2)]);
        expect(stats.get('a')).toEqual({ count: 3, average: 4, madeIt: 2 });
        expect(stats.get('b')).toEqual({ count: 1, average: 2, madeIt: 0 });
        expect(stats.has('c')).toBe(false);
    });

    it('copes with no ratings and with scores that arrive as strings (numeric columns)', () => {
        expect(summarizeRatings([]).size).toBe(0);
        const stats = summarizeRatings([{ post_id: 'a', overall: '4' as unknown as number, made_it: false }, rating('a', 5)]);
        expect(stats.get('a')?.average).toBe(4.5);
    });
});

describe('rankScore', () => {
    it('puts a recipe with many good ratings above one with a single perfect rating', () => {
        const stats = summarizeRatings([...ratings('one', [5]), ...ratings('many', Array(20).fill(4.8))]);
        expect(rankScore(stats.get('many'))).toBeGreaterThan(rankScore(stats.get('one')));
    });

    it('still lets a recipe with a few ratings rank by quality', () => {
        const stats = summarizeRatings([...ratings('good', [5, 5, 5]), ...ratings('poor', [2, 2, 2])]);
        expect(rankScore(stats.get('good'))).toBeGreaterThan(rankScore(stats.get('poor')));
    });

    it('rises with more ratings of the same quality', () => {
        const stats = summarizeRatings([...ratings('few', [5, 5]), ...ratings('lots', Array(10).fill(5))]);
        expect(rankScore(stats.get('lots'))).toBeGreaterThan(rankScore(stats.get('few')));
        expect(rankScore(stats.get('lots'))).toBeLessThanOrEqual(5);
    });

    it('scores unrated recipes below any rated one', () => {
        expect(rankScore(undefined)).toBe(-1);
        expect(rankScore({ count: 1, average: 1, madeIt: 0 })).toBeGreaterThan(0);
    });
});

describe('sortPosts', () => {
    const posts = [post('old-best', 1), post('new-unrated', 20), post('mid', 10), post('newest-weak', 25)];
    const stats = summarizeRatings([
        ...ratings('old-best', Array(10).fill(5), 6),
        ...ratings('mid', [4, 4, 4], 1),
        ...ratings('newest-weak', [2]),
    ]);
    const ids = (mode: 'newest' | 'top' | 'made') => sortPosts(posts, stats, mode).map(p => p.id);

    it('newest puts the latest first', () => {
        expect(ids('newest')).toEqual(['newest-weak', 'new-unrated', 'mid', 'old-best']);
    });

    it('top rated ranks by fair score, with unrated recipes last (newest first among them)', () => {
        expect(ids('top')).toEqual(['old-best', 'mid', 'newest-weak', 'new-unrated']);
    });

    it('most made ranks by how many people made it', () => {
        expect(ids('made')).toEqual(['old-best', 'mid', 'newest-weak', 'new-unrated']);
        const reversed = summarizeRatings([...ratings('a', [3, 3, 3], 3), ...ratings('b', [5, 5], 1)]);
        expect(sortPosts([post('b', 2), post('a', 1)], reversed, 'made').map(p => p.id)).toEqual(['a', 'b']);
    });

    it('breaks ties by number of ratings, then by date, and never changes the input', () => {
        const tied = summarizeRatings([...ratings('x', [4, 4]), ...ratings('y', [4, 4])]);
        expect(sortPosts([post('x', 1), post('y', 2)], tied, 'top').map(p => p.id)).toEqual(['y', 'x']);
        const input = [post('x', 1), post('y', 2)];
        sortPosts(input, tied, 'top');
        expect(input.map(p => p.id)).toEqual(['x', 'y']);
    });

    it('works with no ratings at all', () => {
        expect(sortPosts(posts, new Map(), 'top').map(p => p.id)).toEqual(['newest-weak', 'new-unrated', 'mid', 'old-best']);
    });
});
