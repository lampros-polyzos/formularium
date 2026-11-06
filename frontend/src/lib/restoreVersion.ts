import { loadCurrent, saveVersion, versionLabel, type FormulaVersion, type VersionInput } from './formulaVersions';
import { saveFormulation } from './saveFormulation';

const asInput = (v: FormulaVersion): VersionInput => ({
    name: v.name,
    profileId: v.profile_id,
    targetWeight: v.target_weight_g,
    targetPh: v.target_ph,
    ingredients: v.lines.map(l => ({ id: l.ingredient_id, inci_name: l.inci_name, trade_name: l.trade_name, phase: l.phase, percentage: l.percentage, isQS: l.is_qs })),
});

/**
 * Puts an earlier version back as the formula. What is there now is kept first as a new version, so going back is
 * never a loss and can itself be undone. Nothing is changed if keeping the current one fails.
 */
export async function restoreVersion(formulaId: string, version: FormulaVersion): Promise<void> {
    const current = await loadCurrent(formulaId);
    await saveVersion(formulaId, asInput(current), `Kept before going back to ${versionLabel(version).toLowerCase()}`);

    const profileId = version.profile_id ?? current.profile_id;
    if (!profileId) throw new Error('This version has no product profile, so it cannot be put back.');
    await saveFormulation({
        formulaId,
        name: version.name,
        profileId,
        targetWeight: version.target_weight_g ?? current.target_weight_g ?? 100,
        targetPh: version.target_ph,
        ingredients: version.lines.map(l => ({ id: l.ingredient_id, phase: l.phase, percentage: l.percentage, isQS: l.is_qs })),
    });
}
