import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteVersion, diffVersions, listVersions, loadCurrent, saveVersion, toVersionLines, versionLabel, type FormulaVersion, type VersionLine } from './formulaVersions';
import { restoreVersion } from './restoreVersion';

// The formula and its history come from the backend
const api = vi.hoisted(() => ({ fetchVersions: vi.fn(), addVersion: vi.fn(), removeVersion: vi.fn(), fetchFormula: vi.fn() }));
vi.mock('./formulasApi', () => api);
const saveFormulation = vi.hoisted(() => vi.fn());
vi.mock('./saveFormulation', () => ({ saveFormulation }));

const line = (id: string, percentage: number, phase = 'A', over: Partial<VersionLine> = {}): VersionLine =>
    ({ ingredient_id: id, inci_name: id.toUpperCase(), trade_name: id, phase, percentage, is_qs: false, ...over });
const version = (n: number | null, lines: VersionLine[], over: Partial<FormulaVersion> = {}): FormulaVersion => ({
    id: n === null ? null : `v${n}`, version_number: n, note: null, name: 'Day Cream', profile_id: 'ow_lotion',
    target_weight_g: 100, target_ph: 5.5, lines, created_at: '2026-11-01T10:00:00Z', ...over,
});

describe('comparing two versions', () => {
    const before = version(1, [line('water', 80), line('shea', 8, 'B'), line('gly', 3), line('pres', 1, 'C')]);

    it('finds what was added, removed and changed, and what stayed', () => {
        const after = version(2, [line('water', 80), line('shea', 5, 'B'), line('gly', 3), line('oil', 4, 'B')]);
        const { lines, counts, identical } = diffVersions(before, after);
        expect(identical).toBe(false);
        expect(counts).toEqual({ changed: 1, added: 1, removed: 1, same: 2 });
        const by = Object.fromEntries(lines.map(l => [l.name, l]));
        expect(by.shea).toMatchObject({ change: 'changed', delta: -3 });
        expect(by.oil).toMatchObject({ change: 'added', before: null });
        expect(by.pres).toMatchObject({ change: 'removed', after: null });
        expect(by.water.change).toBe('same');
    });

    it('treats moving an ingredient to another phase as a change to it, not a removal and an addition', () => {
        const { lines, counts } = diffVersions(before, version(2, [line('water', 80), line('shea', 8, 'A'), line('gly', 3), line('pres', 1, 'C')]));
        expect(counts).toMatchObject({ changed: 1, added: 0, removed: 0 });
        expect(lines[0]).toMatchObject({ name: 'shea', change: 'changed', delta: 0 });
    });

    it('notices q.s. being switched on', () => {
        const { lines } = diffVersions(before, version(2, [line('water', 80, 'A', { is_qs: true }), line('shea', 8, 'B'), line('gly', 3), line('pres', 1, 'C')]));
        expect(lines[0]).toMatchObject({ name: 'water', change: 'changed' });
    });

    it('is not fooled by rounding noise in the percentages', () => {
        expect(diffVersions(before, version(2, [line('water', 80.0000000001), line('shea', 8, 'B'), line('gly', 3), line('pres', 1, 'C')])).identical).toBe(true);
    });

    it('lists the biggest changes first, then additions, removals, and what stayed last', () => {
        const after = version(2, [line('water', 78), line('shea', 4, 'B'), line('gly', 3), line('oil', 4, 'B')]);
        expect(diffVersions(before, after).lines.map(l => `${l.name}:${l.change}`)).toEqual(['shea:changed', 'water:changed', 'oil:added', 'pres:removed', 'gly:same']);
    });

    it('matches an ingredient used twice in order', () => {
        const twice = version(1, [line('oil', 5, 'A'), line('oil', 3, 'B')]);
        const { counts, lines } = diffVersions(twice, version(2, [line('oil', 5, 'A'), line('oil', 2, 'B')]));
        expect(counts).toMatchObject({ changed: 1, same: 1 });
        expect(lines[0].delta).toBe(-1);
    });

    it('reports changes to the details too, and says when nothing differs at all', () => {
        const after = version(2, before.lines, { name: 'Day Cream v2', target_ph: 6, target_weight_g: null });
        const { meta, identical } = diffVersions(before, after);
        expect(meta).toEqual([
            { field: 'name', before: 'Day Cream', after: 'Day Cream v2' },
            { field: 'target weight', before: '100', after: '—' },
            { field: 'target pH', before: '5.5', after: '6' },
        ]);
        expect(identical).toBe(false);
        expect(diffVersions(before, version(2, before.lines)).identical).toBe(true);
    });

    it('names versions', () => {
        expect(versionLabel(version(3, []))).toBe('Version 3');
        expect(versionLabel(version(null, []))).toBe('Current');
    });
});

describe('keeping the lines of a formula', () => {
    it('orders them by phase, then largest first, and tidies the values', () => {
        const lines = toVersionLines([
            { id: 'b', inci_name: 'B', trade_name: 'B', phase: 'B', percentage: 2, isQS: false },
            { id: 'a2', inci_name: 'A2', trade_name: 'A2', phase: 'A', percentage: 5, isQS: false },
            { id: 'a1', inci_name: 'A1', trade_name: 'A1', phase: 'A', percentage: 70, isQS: true },
            { id: 'x', inci_name: 'X', trade_name: undefined as never, phase: 'B', percentage: '3' as never, isQS: undefined as never },
        ]);
        expect(lines.map(l => l.ingredient_id)).toEqual(['a1', 'a2', 'x', 'b']);
        expect(lines[2]).toMatchObject({ trade_name: '', percentage: 3, is_qs: false });
    });
});

const NESTED = {
    id: 'f1', name: 'Day Cream', profile_id: 'ow_lotion', target_weight_g: '100', target_ph: '5.5',
    formulation_phases: [
        { phase_letter: 'B', formulation_ingredients: [{ percentage: '8', is_qs: false, ingredients: { id: 'shea', inci_name: 'Shea', trade_name: null } }, { percentage: 1, is_qs: false, ingredients: null }] },
        { phase_letter: 'A', formulation_ingredients: [{ percentage: '90', is_qs: true, ingredients: { id: 'water', inci_name: 'Aqua', trade_name: 'Water' } }] },
    ],
};

beforeEach(() => {
    api.fetchVersions.mockReset().mockResolvedValue([]);
    api.fetchFormula.mockReset().mockResolvedValue(NESTED);
    api.removeVersion.mockReset().mockResolvedValue(undefined);
    // The backend gives a saved version its number and its time
    api.addVersion.mockReset().mockImplementation(async (_formula: string, body: object) => ({ ...body, id: 'new', version_number: 7, created_at: '2026-11-02T00:00:00Z' }));
});

describe('loading and saving versions', () => {
    it('lists the versions of one formula with numbers converted', async () => {
        api.fetchVersions.mockResolvedValue([{ id: 'v2', version_number: 2, note: 'x', name: 'N', profile_id: null, target_weight_g: '100', target_ph: null, lines: [{ ...line('a', 1), percentage: '12.5' }], created_at: 't' }]);
        const [v] = await listVersions('f1');
        expect(v).toMatchObject({ id: 'v2', version_number: 2, target_weight_g: 100, target_ph: null });
        expect(v.lines[0].percentage).toBe(12.5);
        expect(api.fetchVersions).toHaveBeenCalledWith('f1');
    });

    it('reads the formula as it is now in the same shape, leaving out gaps', async () => {
        const current = await loadCurrent('f1');
        expect(current).toMatchObject({ id: null, version_number: null, name: 'Day Cream', target_weight_g: 100, target_ph: 5.5 });
        expect(current.lines.map(l => [l.ingredient_id, l.phase, l.percentage, l.is_qs])).toEqual([['water', 'A', 90, true], ['shea', 'B', 8, false]]);
    });

    it('saves a version with the note trimmed, or no note at all', async () => {
        const input = { name: 'Day Cream', profileId: 'ow_lotion', targetWeight: 100, targetPh: 5.5, ingredients: [{ id: 'w', inci_name: 'Aqua', trade_name: 'Water', phase: 'A', percentage: 90, isQS: true }] };
        expect((await saveVersion('f1', input, '  less shea  ')).version_number).toBe(7);
        expect(api.addVersion.mock.calls[0]).toMatchObject(['f1', { note: 'less shea', name: 'Day Cream', profile_id: 'ow_lotion' }]);
        expect(api.addVersion.mock.calls[0][1].lines).toEqual([{ ingredient_id: 'w', inci_name: 'Aqua', trade_name: 'Water', phase: 'A', percentage: 90, is_qs: true }]);
        await saveVersion('f1', input, '   ');
        expect(api.addVersion.mock.calls[1][1].note).toBeNull();
    });

    it('deletes a version of a formula', async () => {
        await deleteVersion('f1', 'v1');
        expect(api.removeVersion).toHaveBeenCalledWith('f1', 'v1');
    });

    it('says what could not be done, with the reason', async () => {
        api.fetchVersions.mockRejectedValue(new Error('down'));
        api.removeVersion.mockRejectedValue(new Error('nope'));
        api.addVersion.mockRejectedValue(new Error('full'));
        api.fetchFormula.mockRejectedValue(new Error('gone'));
        await expect(listVersions('f1')).rejects.toThrow('Could not load the history: down');
        await expect(deleteVersion('f1', 'v1')).rejects.toThrow('Could not delete the version: nope');
        await expect(saveVersion('f1', { name: 'x', profileId: null, targetWeight: null, targetPh: null, ingredients: [] }, '')).rejects.toThrow('Could not save the version: full');
        await expect(loadCurrent('f1')).rejects.toThrow('Could not load the formula: gone');
    });
});

describe('going back to a version', () => {
    beforeEach(() => saveFormulation.mockReset().mockResolvedValue('f1'));
    const old = version(2, [line('shea', 4, 'B'), line('water', 90, 'A', { is_qs: true })], { name: 'Day Cream (old)', target_ph: 6 });

    it('keeps what is there now as a new version first, then puts the old one back', async () => {
        await restoreVersion('f1', old);
        const [, kept] = api.addVersion.mock.calls[0];
        expect(kept).toMatchObject({ note: 'Kept before going back to version 2' });
        expect(kept.lines).toHaveLength(2); // the current contents, not the old ones
        expect(saveFormulation).toHaveBeenCalledWith({
            formulaId: 'f1', name: 'Day Cream (old)', profileId: 'ow_lotion', targetWeight: 100, targetPh: 6,
            ingredients: [{ id: 'shea', phase: 'B', percentage: 4, isQS: false }, { id: 'water', phase: 'A', percentage: 90, isQS: true }],
        });
    });

    it('changes nothing if the current formula cannot be kept first', async () => {
        api.addVersion.mockRejectedValue(new Error('full'));
        await expect(restoreVersion('f1', old)).rejects.toThrow('Could not save the version');
        expect(saveFormulation).not.toHaveBeenCalled();
    });

    it('uses the current profile when the old version had none', async () => {
        await restoreVersion('f1', { ...old, profile_id: null });
        expect(saveFormulation.mock.calls[0][0]).toMatchObject({ profileId: 'ow_lotion' });
    });
});
