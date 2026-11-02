// A local copy of unsaved work, so a crash, a lost connection or a closed tab never costs the user their formula.
// It exists only while there are unsaved changes: it is written when the formula changes and removed once saved.

export interface DraftIngredient {
    id: string;
    phase: string;
    percentage: number;
    isQS: boolean;
    [key: string]: unknown;
}

export interface FormulaDraft {
    savedAt: number;
    name: string;
    profileId: string;
    targetWeight: number;
    targetPh: number | null;
    ingredients: DraftIngredient[];
}

type SnapshotInput = Pick<FormulaDraft, 'name' | 'profileId' | 'targetWeight' | 'targetPh'> & {
    ingredients: Pick<DraftIngredient, 'id' | 'phase' | 'percentage' | 'isQS'>[];
};

/** A string that changes exactly when something worth saving changes. Row order doesn't matter. */
export function formulaSnapshot(f: SnapshotInput): string {
    const rows = f.ingredients
        .map(i => [i.id, i.phase, i.percentage, i.isQS])
        .sort((a, b) => String(a[1]).localeCompare(String(b[1])) || String(a[0]).localeCompare(String(b[0])));
    return JSON.stringify([f.name, f.profileId, f.targetWeight, f.targetPh, rows]);
}

const keyFor = (formulaId: string | null) => `formularium.draft.${formulaId ?? 'new'}`;

export function saveDraft(formulaId: string | null, draft: Omit<FormulaDraft, 'savedAt'>): void {
    try {
        localStorage.setItem(keyFor(formulaId), JSON.stringify({ ...draft, savedAt: Date.now() }));
    } catch {
        // storage full or blocked: autosave to the database still works
    }
}

export function clearDraft(formulaId: string | null): void {
    try {
        localStorage.removeItem(keyFor(formulaId));
    } catch {
        // ignore
    }
}

export function loadDraft(formulaId: string | null): FormulaDraft | null {
    try {
        const raw = localStorage.getItem(keyFor(formulaId));
        if (!raw) return null;
        const d = JSON.parse(raw);
        const valid = d && typeof d === 'object' && Array.isArray(d.ingredients) && typeof d.name === 'string'
            && typeof d.profileId === 'string' && typeof d.targetWeight === 'number' && typeof d.savedAt === 'number'
            && d.ingredients.every((i: unknown) => i && typeof i === 'object' && typeof (i as DraftIngredient).id === 'string');
        return valid ? (d as FormulaDraft) : null;
    } catch {
        return null;
    }
}
