import type { Fix } from '../types/fixes';

export interface FixRow {
    id: string;
    trade_name?: string | null;
    inci_name?: string | null;
    phase: 'A' | 'B' | 'C';
    percentage: number;
    isQS: boolean;
    locked?: boolean;
}

export interface FixState<T extends FixRow> {
    ingredients: T[];
    targetPh: number | null;
}

export interface FixResult<T extends FixRow> {
    state: FixState<T>;
    /** What happened, in plain words, e.g. "Moved Vitamin E to Phase C". */
    message: string;
}

const nameOf = (row: FixRow) => row.trade_name || row.inci_name || 'ingredient';

function joinNames(rows: FixRow[]): string {
    const names = [...new Set(rows.map(nameOf))];
    if (names.length <= 2) return names.join(' and ');
    return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

const trim = (value: number) => String(Number(value.toFixed(2)));

/**
 * Carries out a fix that changes the formula directly (moving, setting, removing).
 * Returns null when there is nothing to change, e.g. it was already fixed, so the button can be hidden.
 * `balance` and `add-ingredient` need the user's input and are handled by the editor.
 */
export function applyImmediateFix<T extends FixRow>(
    fix: Fix,
    state: FixState<T>,
    options: { lockEdited?: boolean } = {},
): FixResult<T> | null {
    const ids = new Set(fix.ingredientIds ?? []);

    switch (fix.kind) {
        case 'move-phase': {
            if (!fix.phase) return null;
            const moving = state.ingredients.filter(i => ids.has(i.id) && i.phase !== fix.phase);
            if (moving.length === 0) return null;
            return {
                state: { ...state, ingredients: state.ingredients.map(i => (moving.includes(i) ? { ...i, phase: fix.phase! } : i)) },
                message: `Moved ${joinNames(moving)} to Phase ${fix.phase}`,
            };
        }
        case 'set-percentage': {
            if (fix.value === undefined) return null;
            const value = fix.value;
            // The Q.S. ingredient is calculated from everything else, so its value can't be set by hand
            const rows = state.ingredients.filter(i => ids.has(i.id) && !i.isQS && Math.abs(i.percentage - value) > 0.001);
            if (rows.length === 0) return null;
            return {
                state: {
                    ...state,
                    ingredients: state.ingredients.map(i => (rows.includes(i)
                        ? { ...i, percentage: value, locked: options.lockEdited ? true : i.locked }
                        : i)),
                },
                message: `${joinNames(rows)} set to ${trim(value)}%`,
            };
        }
        case 'set-ph': {
            if (fix.value === undefined || state.targetPh === fix.value) return null;
            return { state: { ...state, targetPh: fix.value }, message: `Target pH set to ${trim(fix.value)}` };
        }
        case 'remove-ingredient': {
            const removing = state.ingredients.filter(i => ids.has(i.id));
            if (removing.length === 0) return null;
            return {
                state: { ...state, ingredients: state.ingredients.filter(i => !removing.includes(i)) },
                message: `Removed ${joinNames(removing)}`,
            };
        }
        default:
            return null;
    }
}

/** Whether the fix's button should be shown for the formula as it is now. */
export function isFixApplicable<T extends FixRow>(fix: Fix, state: FixState<T>): boolean {
    switch (fix.kind) {
        case 'balance': return state.ingredients.length > 0;
        case 'add-ingredient': return Boolean(fix.category);
        default: return applyImmediateFix(fix, state) !== null;
    }
}
