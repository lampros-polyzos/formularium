// Passes an imported formula from the import page to the formula editor. It lives in session storage for the few moments
// between the two screens (and is removed as soon as the editor reads it), so a refresh later never recreates it.

import type { ProfileConfig } from '../types/formulation';

const KEY = 'formularium:importedFormula';

export interface ImportedDraft {
    name: string;
    profileId: string;
    profile: ProfileConfig | null;
    targetWeight: number;
    /** Library rows with phase, percentage and isQS, ready for the editor. */
    ingredients: Record<string, unknown>[];
    warnings: string[];
    /** Pasted lines that were left out, shown so nothing disappears silently. */
    skipped: string[];
}

export function saveImport(draft: ImportedDraft): boolean {
    try {
        sessionStorage.setItem(KEY, JSON.stringify(draft));
        return true;
    } catch {
        return false;
    }
}

/** Reads the imported formula and removes it, so it is only ever used once. */
export function takeImport(): ImportedDraft | null {
    try {
        const raw = sessionStorage.getItem(KEY);
        if (!raw) return null;
        sessionStorage.removeItem(KEY);
        const draft = JSON.parse(raw) as ImportedDraft;
        return Array.isArray(draft.ingredients) && draft.ingredients.length > 0 ? draft : null;
    } catch {
        return null;
    }
}
