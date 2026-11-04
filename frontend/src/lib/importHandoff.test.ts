import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveImport, takeImport, type ImportedDraft } from './importHandoff';

const draft = (over: Partial<ImportedDraft> = {}): ImportedDraft => ({ name: 'X', profileId: 'ow_lotion', profile: null, targetWeight: 100, ingredients: [{ id: 'a' }], warnings: [], skipped: [], ...over });

afterEach(() => { vi.unstubAllGlobals(); sessionStorage.clear(); });

describe('handing an imported formula to the editor', () => {
    it('gives it back once, then it is gone', () => {
        expect(saveImport(draft())).toBe(true);
        expect(takeImport()).toMatchObject({ name: 'X', ingredients: [{ id: 'a' }] });
        expect(takeImport()).toBeNull();
    });

    it('returns nothing when nothing was saved, or when what was saved is empty or damaged', () => {
        expect(takeImport()).toBeNull();
        saveImport(draft({ ingredients: [] }));
        expect(takeImport()).toBeNull();
        sessionStorage.setItem('formularium:importedFormula', '{not json');
        expect(takeImport()).toBeNull();
    });

    it('says so when the browser will not store it', () => {
        vi.stubGlobal('sessionStorage', { setItem: () => { throw new Error('quota'); }, getItem: () => null, removeItem: () => undefined, clear: () => undefined });
        expect(saveImport(draft())).toBe(false);
    });
});
