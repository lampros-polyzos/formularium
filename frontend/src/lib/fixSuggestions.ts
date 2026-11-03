import { isWaterBase, roleOf } from './autoBalance';
import { fnHas, fnStart, inci, inciEnds, inciHas, trade, type CatalogFilter } from './catalogFilter';
import type { CatalogIngredient } from './substitutions';
import type { FixCategory } from '../types/fixes';

export interface SuggestionContext {
    targetPh: number | null;
    /** Marketing claims the formula targets, e.g. VEGAN, COSMOS. */
    claims: string[];
    /** Ingredients already in the formula; they are never suggested again. */
    inFormulaIds: Set<string>;
    stashIds: Set<string>;
}

export interface Suggestion {
    ingredient: CatalogIngredient;
    reasons: string[];
}

export const CATEGORY_INFO: Record<FixCategory, { title: string; hint: string; search: string }> = {
    preservative: { title: 'Add a preservative', hint: 'Pick a broad-spectrum preservative that works at your target pH, and follow its usage range.', search: 'preservative' },
    emulsifier: { title: 'Add an emulsifier', hint: 'An emulsifier lets the oil and water phases stay together.', search: 'emulsifier' },
    chelator: { title: 'Add a chelator', hint: 'Chelators bind metal ions that weaken preservatives and discolor products.', search: 'chelat' },
    antioxidant: { title: 'Add an antioxidant', hint: 'Antioxidants slow rancidity in oils and protect sensitive actives.', search: 'antioxidant' },
    ferulic: { title: 'Add ferulic acid', hint: 'Ferulic acid stabilizes vitamin C. Dissolve it in propanediol or alcohol first.', search: 'ferulic' },
    soother: { title: 'Add a soothing ingredient', hint: 'Soothers calm the skin and offset irritation from strong actives.', search: 'soothing' },
    neutralizer: { title: 'Add a neutralizer', hint: 'Raises the pH so carbomer thickens. Add it drop by drop.', search: 'hydroxide' },
    photostabilizer: { title: 'Add a UV filter stabilizer', hint: 'Keeps avobenzone from breaking down in sunlight.', search: 'UV filter' },
    water: { title: 'Add water', hint: 'Water is the base of most skincare products.', search: 'aqua' },
    oil: { title: 'Add an oil', hint: 'Oils and butters make up the oil phase.', search: 'carrier oil' },
};

const lower = (s: string | null | undefined) => (s ?? '').toLowerCase();

// Preservatives that only cover one side (mold and yeast, or bacteria) are not a complete system on their own
function isBroadPreservative(i: CatalogIngredient): boolean {
    const fn = lower(i.function), inci = lower(i.inci_name);
    if (!fn.startsWith('preservative') || fn.includes('booster')) return false;
    const sorbateAlone = /sorbate|sorbic/.test(inci) && !/benzo|benzyl alcohol|phenoxy|hydroxamic/.test(inci);
    const dehydroacetateAlone = inci.includes('dehydroacet') && !inci.includes('benzyl alcohol');
    return !(sorbateAlone || dehydroacetateAlone || /anisate|levulinate|leuconostoc/.test(inci));
}

const MATCHERS: Record<FixCategory, (i: CatalogIngredient) => boolean> = {
    preservative: isBroadPreservative,
    emulsifier: i => lower(i.function).includes('emulsifier') && !lower(i.function).includes('co-emulsifier') && lower(i.ionic_charge) !== 'cationic',
    chelator: i => lower(i.function).includes('chelat'),
    antioxidant: i => lower(i.function).startsWith('antioxidant') && !lower(i.inci_name).includes('acetate'),
    ferulic: i => lower(i.inci_name).startsWith('ferulic'),
    soother: i => /soothing/.test(lower(i.function)) || /panthenol|allantoin|bisabolol/.test(lower(i.inci_name)),
    neutralizer: i => /sodium hydroxide|arginine|triethanolamine/.test(lower(i.inci_name)),
    photostabilizer: i => /octocrylene|bis-ethylhexyloxyphenol|methylene bis-benzotriazolyl/.test(lower(i.inci_name)),
    water: i => isWaterBase({ ...i, function: i.function ?? null, percentage: 0 }),
    oil: i => roleOf({ ...i, function: i.function ?? null, percentage: 0 }, 'ow') === 'lipid',
};

// What to ask the database for so the matchers above have something to choose from. Each list must cover every
// ingredient its matcher accepts (a test checks this); being a little wider is fine, since the matcher decides.
export const CATEGORY_FILTERS: Record<FixCategory, CatalogFilter[]> = {
    preservative: [fnStart('preservative')],
    emulsifier: [fnHas('emulsifier')],
    chelator: [fnHas('chelat')],
    antioxidant: [fnStart('antioxidant')],
    ferulic: [inci('ferulic')],
    soother: [fnHas('soothing'), inciHas('panthenol'), inciHas('allantoin'), inciHas('bisabolol')],
    neutralizer: [inciHas('sodium hydroxide'), inciHas('arginine'), inciHas('triethanolamine')],
    photostabilizer: [inciHas('octocrylene'), inciHas('bis-ethylhexyloxyphenol'), inciHas('methylene bis-benzotriazolyl')],
    water: [inci('aqua'), inciEnds(' water'), inciHas('juice'), trade('hydrosol'), trade('distillate')],
    oil: [fnHas('oil'), fnHas('butter'), fnHas('emollient'), fnHas('lipid'), fnHas('skin protectant')],
};

const COST_RANK: Record<string, number> = { low: 0, medium: 1, high: 2 };

function meetsClaims(i: CatalogIngredient, claims: string[]): { ok: boolean; matched: string[] } {
    const matched: string[] = [];
    const check = (claim: string, passes: boolean, label: string) => {
        if (!claims.includes(claim)) return true;
        if (passes) matched.push(label);
        return passes;
    };
    const ok = [
        check('VEGAN', i.is_vegan === true, 'Vegan'),
        check('COSMOS', Boolean(i.cosmos_compliant || i.is_cosmos), 'COSMOS compliant'),
        check('SILICONE_FREE', !i.is_silicone, 'Silicone-free'),
        check('SULFATE_FREE', !i.is_sulfate, 'Sulfate-free'),
        check('PARABEN_FREE', !i.is_paraben, 'Paraben-free'),
        check('NON_COMEDOGENIC', (i.comedogenic_rating ?? 0) <= 2, 'Non-comedogenic'),
    ].every(Boolean);
    return { ok, matched };
}

/** True when the ingredient has a pH window that excludes the target pH. Wide or missing windows never exclude. */
function missesPh(i: CatalogIngredient, targetPh: number | null): boolean {
    const lo = i.optimal_ph_min, hi = i.optimal_ph_max;
    if (targetPh === null || lo == null || hi == null || hi - lo >= 10) return false;
    return targetPh < lo || targetPh > hi;
}

/** Ingredients that would fix the problem, best first: your stash, then a fit with your pH and claims, then price. */
export function suggestIngredients(category: FixCategory, catalog: CatalogIngredient[], ctx: SuggestionContext, limit = 5): Suggestion[] {
    const matches = MATCHERS[category];
    const seen = new Set<string>();

    return catalog
        .filter(i => matches(i) && !ctx.inFormulaIds.has(i.id) && !missesPh(i, ctx.targetPh))
        .filter(i => {
            const key = lower(i.inci_name);
            if (seen.has(key)) return false; // several grades of the same ingredient: one is enough
            seen.add(key);
            return true;
        })
        .map(i => ({ ingredient: i, claim: meetsClaims(i, ctx.claims) }))
        .filter(x => x.claim.ok)
        .map(({ ingredient, claim }) => {
            const reasons: string[] = [];
            if (ctx.stashIds.has(ingredient.id)) reasons.push('In your stash');
            reasons.push(...claim.matched);
            const hasWindow = ingredient.optimal_ph_min != null && ingredient.optimal_ph_max != null && ingredient.optimal_ph_max - ingredient.optimal_ph_min < 10;
            if (ctx.targetPh !== null && hasWindow) reasons.push(`Works at pH ${ctx.targetPh}`);
            if (ingredient.min_usage_pct != null && ingredient.max_usage_pct != null && ingredient.max_usage_pct < 100) {
                reasons.push(`Usually ${ingredient.min_usage_pct}-${ingredient.max_usage_pct}%`);
            }
            if (ingredient.cost_category) reasons.push(`${ingredient.cost_category} cost`);
            return { ingredient, reasons: reasons.slice(0, 4) };
        })
        .sort((a, b) =>
            Number(ctx.stashIds.has(b.ingredient.id)) - Number(ctx.stashIds.has(a.ingredient.id))
            || (COST_RANK[a.ingredient.cost_category ?? ''] ?? 1) - (COST_RANK[b.ingredient.cost_category ?? ''] ?? 1)
            || (a.ingredient.trade_name ?? '').localeCompare(b.ingredient.trade_name ?? ''))
        .slice(0, limit);
}
