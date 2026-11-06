import { createFormula, saveFormula, type FormulaInput } from './formulasApi';

export interface SaveItem {
    id: string;
    phase: string;
    percentage: number;
    isQS: boolean;
}

export interface SaveInput {
    formulaId: string | null;
    name: string;
    profileId: string;
    targetWeight: number;
    targetPh: number | null;
    ingredients: SaveItem[];
}

/** What the backend takes for a formula: by phase, largest first, the way a formula is kept. */
export function toFormulaBody(input: Omit<SaveInput, 'formulaId'>): FormulaInput {
    return {
        name: input.name,
        profile_id: input.profileId,
        target_weight_g: input.targetWeight,
        target_ph: input.targetPh,
        ingredients: [...input.ingredients]
            .sort((a, b) => (a.phase < b.phase ? -1 : a.phase > b.phase ? 1 : (b.percentage || 0) - (a.percentage || 0)))
            .map(i => ({ ingredient_id: i.id, phase_letter: i.phase, percentage: i.percentage || 0, is_qs: i.isQS })),
    };
}

/**
 * Writes the formula and returns its id. Creates it first when it has none. The backend saves the details and the contents together, so a
 * formula is never left half-saved, and a saved formula keeps its status and where it was copied from.
 */
export async function saveFormulation(input: SaveInput): Promise<string> {
    const body = toFormulaBody(input);
    if (input.formulaId) {
        await saveFormula(input.formulaId, body);
        return input.formulaId;
    }
    return (await createFormula(body)).id;
}
