import { beforeEach, describe, expect, it } from 'vitest';
import { clearDraft, formulaSnapshot, loadDraft, saveDraft } from './draftStore';

const draft = {
    name: 'Lotion', profileId: 'ow_lotion', targetWeight: 100, targetPh: 5.5,
    ingredients: [{ id: 'a', phase: 'A', percentage: 70, isQS: true }],
};

beforeEach(() => localStorage.clear());

describe('draftStore', () => {
    it('round-trips a draft per formula and for the unsaved "new" formula', () => {
        saveDraft('f1', draft);
        saveDraft(null, { ...draft, name: 'Other' });
        expect(loadDraft('f1')?.name).toBe('Lotion');
        expect(loadDraft(null)?.name).toBe('Other');
        clearDraft('f1');
        expect(loadDraft('f1')).toBeNull();
        expect(loadDraft(null)).not.toBeNull();
    });

    it('ignores damaged or foreign data instead of crashing', () => {
        localStorage.setItem('formularium.draft.f1', '{not json');
        expect(loadDraft('f1')).toBeNull();
        localStorage.setItem('formularium.draft.f2', JSON.stringify({ name: 5 }));
        expect(loadDraft('f2')).toBeNull();
    });

    it('survives storage being unavailable', () => {
        const original = Storage.prototype.setItem;
        Storage.prototype.setItem = () => { throw new Error('quota'); };
        expect(() => saveDraft('f1', draft)).not.toThrow();
        Storage.prototype.setItem = original;
    });
});

describe('formulaSnapshot', () => {
    const base = { name: 'L', profileId: 'p', targetWeight: 100, targetPh: 5.5 };
    const a = { id: 'a', phase: 'A', percentage: 70, isQS: true };
    const b = { id: 'b', phase: 'B', percentage: 20, isQS: false };

    it('ignores row order but changes with anything that is saved', () => {
        const s = formulaSnapshot({ ...base, ingredients: [a, b] });
        expect(formulaSnapshot({ ...base, ingredients: [b, a] })).toBe(s);
        expect(formulaSnapshot({ ...base, name: 'Renamed', ingredients: [a, b] })).not.toBe(s);
        expect(formulaSnapshot({ ...base, ingredients: [a, { ...b, percentage: 21 }] })).not.toBe(s);
        expect(formulaSnapshot({ ...base, ingredients: [a, { ...b, phase: 'C' }] })).not.toBe(s);
        expect(formulaSnapshot({ ...base, targetPh: 6, ingredients: [a, b] })).not.toBe(s);
    });
});
