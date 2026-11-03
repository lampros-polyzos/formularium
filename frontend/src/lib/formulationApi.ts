import type { FormulaIngredient } from '../types/formulation';

// Shape the backend expects for validation and PDF exports
export const toApiIngredient = (i: FormulaIngredient) => ({
    id: i.id,
    name: `${i.inci_name || ''} ${i.trade_name || ''}`.trim() || "Unknown",
    inciName: i.inci_name || null,
    tradeName: i.trade_name || null,
    casNumber: i.cas_number || null,
    function: i.function || "None",
    phase: i.phase || "A",
    percentage: i.percentage || 0,
    solubility: i.solubility || "water",
    maxHeatingTempC: i.max_heating_temp_c ?? null,
    minPercentage: i.min_usage_pct ?? i.min_percentage ?? null,
    maxPercentage: i.max_usage_pct ?? i.max_percentage ?? null,
    isVegan: i.is_vegan ?? null,
    isSulfate: i.is_sulfate ?? null,
    isSilicone: i.is_silicone ?? null,
    isParaben: i.is_paraben ?? null,
    isFragrance: i.is_fragrance ?? null,
    cosmosCompliant: i.cosmos_compliant ?? null,
    comedogenicRating: i.comedogenic_rating ?? null,
    ionicCharge: i.ionic_charge ?? null,
    optimalPhMin: i.optimal_ph_min ?? null,
    optimalPhMax: i.optimal_ph_max ?? null
});

interface ExportPayloadInput {
    projectName: string;
    targetWeight: number;
    profileId: string;
    activeProfile: unknown;
    targetPh: number | null;
    targetClaims: unknown;
    formulaIngredients: FormulaIngredient[];
}

const sumPct = (list: FormulaIngredient[]) => list.reduce((sum, item) => sum + (item.percentage || 0), 0);

/** What the PDF export endpoints expect for a formula. */
export function buildExportPayload({ projectName, targetWeight, profileId, activeProfile, targetPh, targetClaims, formulaIngredients }: ExportPayloadInput) {
    return {
        projectName: projectName || "Untitled Project",
        targetWeight: targetWeight || 100,
        profileId: profileId || "Unassigned",
        profile: activeProfile || null,
        targetPh: targetPh ?? null,
        targetClaims,
        ingredients: formulaIngredients.map(toApiIngredient),
        totalPercentage: sumPct(formulaIngredients),
        oilPhasePercentage: sumPct(formulaIngredients.filter(i => i.phase === 'B' || i.solubility === 'oil')),
        waterPhasePercentage: sumPct(formulaIngredients.filter(i => i.phase === 'A' || i.solubility === 'water')),
    };
}
