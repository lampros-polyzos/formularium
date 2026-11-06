import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchFormulaSummary, fetchPostSummary, fetchRemixes } from './lineage';

const community = vi.hoisted(() => ({ fetchPost: vi.fn(), fetchRemixes: vi.fn() }));
vi.mock('./communityApi', () => community);
const formulas = vi.hoisted(() => ({ fetchFormula: vi.fn() }));
vi.mock('./formulasApi', () => formulas);

beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('lookups', () => {
    it('finds the original recipe, and gives nothing if it is gone or unreadable', async () => {
        community.fetchPost.mockResolvedValue({ id: 'p1', title: 'Day Cream', author_name: 'Sam', write_up: 'long text' });
        expect(await fetchPostSummary('p1')).toEqual({ id: 'p1', title: 'Day Cream', author_name: 'Sam' });

        community.fetchPost.mockRejectedValue(new Error('That post no longer exists.'));
        expect(await fetchPostSummary('p1')).toBeNull();
    });

    it('finds the formula a copy was made from', async () => {
        formulas.fetchFormula.mockResolvedValue({ id: 'f1', name: 'My Lotion', profile_id: 'ow_lotion', formulation_phases: [] });
        expect(await fetchFormulaSummary('f1')).toEqual({ id: 'f1', name: 'My Lotion' });
        formulas.fetchFormula.mockRejectedValue(new Error('That formula does not exist.')); // someone else's private formula: the backend says it is not there
        expect(await fetchFormulaSummary('f1')).toBeNull();
    });

    it('lists remixes of a recipe, as many as asked for', async () => {
        community.fetchRemixes.mockResolvedValue([{ id: 'r1', title: 'Remix', author_name: 'Kim', created_at: '2026-11-01' }]);
        expect(await fetchRemixes('p1', 5)).toHaveLength(1);
        expect(community.fetchRemixes).toHaveBeenCalledWith('p1', 5);
    });

    it('lists nothing when the lookup fails', async () => {
        community.fetchRemixes.mockRejectedValue(new Error('boom'));
        expect(await fetchRemixes('p1')).toEqual([]);
    });
});
