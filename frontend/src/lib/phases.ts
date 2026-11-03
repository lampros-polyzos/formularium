/** Which phase a new ingredient goes in: heat-sensitive ones cool down last (C), oils are phase B, the rest A. */
export function determinePhase(ingredient: { max_heating_temp_c?: number | null; solubility?: string | null }): 'A' | 'B' | 'C' {
    if (ingredient.max_heating_temp_c != null && ingredient.max_heating_temp_c <= 50) return 'C';
    if (ingredient.solubility === 'oil') return 'B';
    return 'A';
}
