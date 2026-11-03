// Stash check & substitution engine.
// Pure functions so the editor table and the printed sourcing guide always agree.
// Strings are kept plain ASCII because they are also rendered into PDFs (Helvetica).

import { fnHas, inci, type CatalogFilter } from './catalogFilter';

export interface CatalogIngredient {
    id: string;
    inci_name: string;
    trade_name: string;
    function: string | null;
    min_usage_pct: number | null;
    max_usage_pct: number | null;
    cas_number?: string | null;
    solubility?: string | null;
    ionic_charge?: string | null;
    physical_state?: string | null;
    optimal_ph_min?: number | null;
    optimal_ph_max?: number | null;
    max_heating_temp_c?: number | null;
    is_vegan?: boolean | null;
    is_cosmos?: boolean | null;
    cosmos_compliant?: boolean | null;
    cost_category?: string | null;
    is_sulfate?: boolean | null;
    is_silicone?: boolean | null;
    is_paraben?: boolean | null;
    comedogenic_rating?: number | null;
}

export interface FormulaLine {
    ingredient: CatalogIngredient;
    phase: 'A' | 'B' | 'C';
    percentage: number;
    isQS?: boolean;
}

export interface StashEntry {
    ingredient_id: string;
    amount_left_g: number | null;
}

export type StockStatus = 'have' | 'low' | 'missing' | 'assumed';

export interface SubstituteOption {
    ingredient: CatalogIngredient;
    score: number;             // 0-100
    matchLabel: string;
    percentage: number;        // suggested usage, clamped to the substitute's range
    neededG: number;
    buyG: number;              // with overage, for shopping lists
    inStash: boolean;
    stashG: number | null;     // null = in stash but amount unknown
    notes: string[];
    warnings: string[];
}

export interface SourcingItem {
    line: FormulaLine;
    neededG: number;
    haveG: number | null;      // null = unknown amount (or nothing in stash)
    status: StockStatus;
    buyG: number;              // shortfall incl. overage; 0 when covered
    stashOptions: SubstituteOption[];
    marketOptions: SubstituteOption[];
}

export const PURCHASE_OVERAGE = 0.15; // beaker transfer loss, matches the shopping list tip
const MIN_SCORE = 40;
const MAX_STASH_OPTIONS = 3;
const MAX_MARKET_OPTIONS = 4;

// ---------- Function parsing ----------

// Ordered: more specific patterns first
export const ROLE_PATTERNS: [string, RegExp][] = [
    ['uv_filter', /uv filter/],
    ['preservative_booster', /preservative booster/],
    ['preservative', /preservative/],
    ['ph_base', /ph adjuster \(base\)/],
    ['ph_acid', /ph adjuster(?! \(base\))/], // unqualified adjusters (e.g. Lactic Acid) are acids
    ['surfactant', /surfactant/],
    ['co_emulsifier', /co-emulsifier/],
    ['emulsifier', /emulsifier/],
    ['solubilizer', /solubilizer/],
    ['rheology', /rheology|suspending/],
    ['wax', /wax/],
    ['thickener', /thickener/],
    ['lipid', /carrier oil|butter|emollient|active lipid/],
    ['humectant', /humectant|osmolyte/],
    ['chelator', /chelat/],
    ['antioxidant', /antioxidant/],
    ['conditioning', /conditioning/],
    ['colorant', /colorant/],
    ['absorbent', /absorbent/],
    ['texture', /texture enhancer/],
    ['fragrance', /fragrance/],
    ['solvent', /solvent/],
    ['astringent', /astringent/],
    ['buffer', /buffer/],
    ['film_former', /film former/],
    ['protectant', /protectant/],
    ['active', /active/],
];

// The words the database can search for to find ingredients with each role. Every word in a role's regex must
// be here, so a search never misses something the regex would have matched (a test checks they stay in step).
export const ROLE_KEYWORDS: Record<string, string[]> = {
    uv_filter: ['uv filter'],
    preservative_booster: ['preservative booster'],
    preservative: ['preservative'],
    ph_base: ['ph adjuster'],
    ph_acid: ['ph adjuster'],
    surfactant: ['surfactant'],
    co_emulsifier: ['co-emulsifier'],
    emulsifier: ['emulsifier'],
    solubilizer: ['solubilizer'],
    rheology: ['rheology', 'suspending'],
    wax: ['wax'],
    thickener: ['thickener'],
    lipid: ['carrier oil', 'butter', 'emollient', 'active lipid'],
    humectant: ['humectant', 'osmolyte'],
    chelator: ['chelat'],
    antioxidant: ['antioxidant'],
    conditioning: ['conditioning'],
    colorant: ['colorant'],
    absorbent: ['absorbent'],
    texture: ['texture enhancer'],
    fragrance: ['fragrance'],
    solvent: ['solvent'],
    astringent: ['astringent'],
    buffer: ['buffer'],
    film_former: ['film former'],
    protectant: ['protectant'],
    active: ['active'],
};

// Roles that say little about interchangeability on their own
const GENERIC_ROLES = new Set(['active', 'solvent', 'protectant']);

interface ParsedFunction {
    primary: Set<string>;
    all: Set<string>;
    qualifiers: Set<string>;
}

const rolesOf = (text: string) => {
    const roles = new Set<string>();
    for (const [role, pattern] of ROLE_PATTERNS) {
        if (pattern.test(text)) roles.add(role);
    }
    // "preservative booster" shouldn't also count as a full preservative
    if (roles.has('preservative_booster')) roles.delete('preservative');
    if (roles.has('co_emulsifier')) roles.delete('emulsifier');
    return roles;
};

export function parseFunction(fn: string | null | undefined): ParsedFunction {
    const text = (fn ?? '').toLowerCase();
    const segments = text.split('/').map(s => s.trim()).filter(Boolean);
    const qualifiers = new Set<string>();
    for (const match of text.matchAll(/\(([^)]+)\)/g)) {
        match[1].split(/[/,]/).map(q => q.trim()).filter(Boolean).forEach(q => qualifiers.add(q));
    }
    const all = rolesOf(text);
    const primary = segments.length ? rolesOf(segments[0]) : new Set<string>();
    return { primary, all, qualifiers };
}

const intersects = <T>(a: Set<T>, b: Set<T>) => [...a].some(x => b.has(x));
const intersection = <T>(a: Set<T>, b: Set<T>) => new Set([...a].filter(x => b.has(x)));

// ---------- Identity helpers ----------

const casSet = (cas: string | null | undefined) =>
    new Set((cas ?? '').split(/[,;]/).map(c => c.trim()).filter(c => c && c.toLowerCase() !== 'n/a'));

// "Argania Spinosa Kernel Oil [Raw]" -> "argania spinosa kernel oil"
const inciBase = (inci: string | null | undefined) => (inci ?? '').replace(/\[[^\]]*\]/g, '').trim().toLowerCase();

// Words that appear in many unrelated INCI names
const INCI_STOPWORDS = new Set(['oil', 'seed', 'butter', 'extract', 'leaf', 'flower', 'fruit', 'kernel', 'root', 'water', 'and', 'acid', 'sodium']);
const inciWords = (inci: string) =>
    new Set(inciBase(inci).split(/[^a-z0-9-]+/).filter(w => w.length > 2 && !INCI_STOPWORDS.has(w)));

const isWater = (ing: CatalogIngredient) => inciBase(ing.inci_name) === 'aqua';

const isCosmos = (ing: CatalogIngredient) => !!(ing.cosmos_compliant || ing.is_cosmos);

export const displayName = (ing: CatalogIngredient) => ing.trade_name || ing.inci_name;

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
export const withOverage = (grams: number) => Math.ceil(grams * (1 + PURCHASE_OVERAGE) * 10) / 10;

// ---------- Stash ----------

export interface StashIndex {
    has: (id: string) => boolean;
    grams: (id: string) => number | null; // null = present but untracked, or absent
    isEmpty: boolean;
}

export function indexStash(entries: StashEntry[]): StashIndex {
    const totals = new Map<string, number | null>();
    for (const e of entries) {
        const prev = totals.get(e.ingredient_id);
        if (e.amount_left_g == null) totals.set(e.ingredient_id, prev ?? null);
        else totals.set(e.ingredient_id, (prev ?? 0) + Number(e.amount_left_g));
    }
    return {
        has: id => totals.has(id),
        grams: id => totals.get(id) ?? null,
        isEmpty: totals.size === 0,
    };
}

// ---------- Scoring ----------

interface Context {
    line: FormulaLine;
    formula: FormulaLine[];
    targetPh: number | null;
    targetWeight: number;
    stash: StashIndex;
}

function scoreCandidate(candidate: CatalogIngredient, ctx: Context): SubstituteOption | null {
    const original = ctx.line.ingredient;
    if (candidate.id === original.id) return null;
    if (ctx.formula.some(l => l.ingredient.id === candidate.id)) return null; // already in the formula

    const notes: string[] = [];
    const warnings: string[] = [];
    const fnA = parseFunction(original.function);
    const fnB = parseFunction(candidate.function);

    const sameInci = inciBase(original.inci_name) === inciBase(candidate.inci_name);
    const sameCas = intersects(casSet(original.cas_number), casSet(candidate.cas_number)) && intersects(fnA.all, fnB.all);
    let score: number;
    let matchLabel: string;

    if (sameInci || sameCas) {
        score = sameInci ? 98 : 94;
        matchLabel = 'Same ingredient, different grade';
    } else {
        const shared = intersection(fnA.all, fnB.all);
        const meaningful = [...shared].filter(r => !GENERIC_ROLES.has(r));
        const sharedQualifiers = intersection(fnA.qualifiers, fnB.qualifiers);

        // Actives only swap when they do the same job (soothing for soothing, AHA for AHA...)
        if (meaningful.length === 0 && (shared.size === 0 || sharedQualifiers.size === 0)) return null;
        // pH adjusters must push in the same direction
        if ((fnA.all.has('ph_acid') && fnB.all.has('ph_base')) || (fnA.all.has('ph_base') && fnB.all.has('ph_acid'))) return null;

        score = intersects(fnA.primary, fnB.primary) ? 45 : intersects(fnA.primary, fnB.all) ? 40 : 22;
        score += Math.min(sharedQualifiers.size * 10, 20);

        // Related chemistry, e.g. Cetyl Alcohol vs Cetearyl Alcohol
        const wordsA = inciWords(original.inci_name), wordsB = inciWords(candidate.inci_name);
        const union = new Set([...wordsA, ...wordsB]).size;
        if (union) score += Math.round(12 * intersection(wordsA, wordsB).size / union);
        if (fnA.qualifiers.size > 0 && sharedQualifiers.size === 0) score -= 8;

        const solA = original.solubility, solB = candidate.solubility;
        if (solA && solB) {
            if (solA === solB) score += 10;
            else if (solA !== 'dispersible' && solB !== 'dispersible') {
                score -= 25;
                warnings.push(`${solB}-soluble (original is ${solA}-soluble): may need a different phase or a solubilizer`);
            }
        }

        if (original.physical_state && candidate.physical_state) {
            if (original.physical_state === candidate.physical_state) score += 5;
            else if (['lipid', 'wax', 'thickener', 'rheology'].some(r => fnA.all.has(r))) {
                score -= 4;
                notes.push(`${candidate.physical_state} instead of ${original.physical_state}: texture will differ`);
            }
        }

        if (original.ionic_charge && candidate.ionic_charge) {
            if (original.ionic_charge === candidate.ionic_charge) score += 5;
            else if ([original.ionic_charge, candidate.ionic_charge].every(c => c === 'cationic' || c === 'anionic')) {
                score -= 20;
                warnings.push(`Opposite charge (${candidate.ionic_charge} vs ${original.ionic_charge})`);
            }
        }

        if (fnA.all.has('fragrance') && fnB.all.has('fragrance')) notes.push('Different scent profile');
        matchLabel = ''; // set after penalties below
    }

    // Usage rate: keep the recipe's % if the substitute allows it, otherwise clamp
    const pct = ctx.line.percentage;
    const min = candidate.min_usage_pct, max = candidate.max_usage_pct;
    let percentage = pct;
    if (min != null && pct < min) percentage = min;
    if (max != null && pct > max) percentage = max;
    percentage = round2(percentage);
    if (percentage !== pct) {
        score -= 5;
        notes.push(`Use ${percentage}% instead of ${pct}% (its range is ${min ?? 0}-${max ?? 100}%); rebalance the formula`);
    }

    // pH
    const ph = ctx.targetPh;
    if (ph != null && candidate.optimal_ph_min != null && candidate.optimal_ph_max != null
        && (ph < candidate.optimal_ph_min || ph > candidate.optimal_ph_max)) {
        score -= 12;
        warnings.push(`Works at pH ${candidate.optimal_ph_min}-${candidate.optimal_ph_max}, formula targets pH ${ph}`);
    }

    // Heat: heated phases are processed around 70-75C
    const heated = ctx.line.phase !== 'C';
    if (heated && candidate.max_heating_temp_c != null && candidate.max_heating_temp_c < 70
        && (original.max_heating_temp_c == null || original.max_heating_temp_c >= 70)) {
        score -= 5;
        warnings.push(`Heat-sensitive (max ${candidate.max_heating_temp_c}C): add it in the cool-down phase`);
    }

    // Claims the original satisfied that the substitute would break
    if (original.is_vegan && candidate.is_vegan === false) { score -= 10; warnings.push('Not vegan'); }
    if (!original.is_silicone && candidate.is_silicone) { score -= 10; warnings.push('Contains silicone'); }
    if (!original.is_sulfate && candidate.is_sulfate) { score -= 10; warnings.push('Contains sulfates'); }
    if (!original.is_paraben && candidate.is_paraben) { score -= 10; warnings.push('Contains parabens'); }
    if (isCosmos(original) && !isCosmos(candidate)) { score -= 4; notes.push('Not COSMOS compliant'); }

    const comedoA = original.comedogenic_rating ?? 0, comedoB = candidate.comedogenic_rating ?? 0;
    if (comedoB - comedoA >= 2) { score -= 6; warnings.push(`More pore-clogging (comedogenic ${comedoB} vs ${comedoA})`); }

    // Charge clashes with the rest of the formula
    const others = ctx.formula.filter(l => l !== ctx.line).map(l => l.ingredient);
    if (candidate.ionic_charge === 'cationic' && original.ionic_charge !== 'cationic') {
        const clash = others.find(o => o.ionic_charge === 'anionic' && /surfactant|rheology|emulsifier/i.test(o.function ?? ''));
        if (clash) { score -= 15; warnings.push(`Cationic: may clash with ${displayName(clash)} (anionic)`); }
    }
    if (candidate.ionic_charge === 'anionic' && original.ionic_charge !== 'anionic') {
        const clash = others.find(o => o.ionic_charge === 'cationic' && /emulsifier|conditioning/i.test(o.function ?? ''));
        if (clash) { score -= 15; warnings.push(`Anionic: may clash with ${displayName(clash)} (cationic)`); }
    }

    // Swaps that always need extra care
    if (fnA.all.has('uv_filter')) warnings.push('SPF cannot be assumed after swapping UV filters; it needs lab testing');
    if (fnA.all.has('preservative') || fnA.all.has('preservative_booster')) {
        warnings.push('Check it covers bacteria, yeast and mold at your pH');
    }

    score = Math.max(0, Math.min(100, Math.round(score)));
    if (!matchLabel) {
        if (score >= 70) matchLabel = 'Close match';
        else if (score >= 55) matchLabel = 'Good alternative';
        else matchLabel = 'Partial match';
    }
    if (score < MIN_SCORE) return null;

    const neededG = round2((percentage / 100) * ctx.targetWeight);
    const inStash = ctx.stash.has(candidate.id);
    return {
        ingredient: candidate,
        score,
        matchLabel,
        percentage,
        neededG,
        buyG: withOverage(neededG),
        inStash,
        stashG: inStash ? ctx.stash.grams(candidate.id) : null,
        notes,
        warnings,
    };
}

export function findSubstitutes(
    line: FormulaLine,
    formula: FormulaLine[],
    catalog: CatalogIngredient[],
    stash: StashIndex,
    targetWeight: number,
    targetPh: number | null,
): { stashOptions: SubstituteOption[]; marketOptions: SubstituteOption[] } {
    const ctx: Context = { line, formula, targetPh, targetWeight, stash };
    const scored = catalog
        .map(c => scoreCandidate(c, ctx))
        .filter((o): o is SubstituteOption => o !== null)
        .sort((a, b) => b.score - a.score);

    // A stash option only helps if there's enough of it (unknown amounts get the benefit of the doubt)
    const stashOptions = scored
        .filter(o => o.inStash && (o.stashG == null || o.stashG >= o.neededG))
        .slice(0, MAX_STASH_OPTIONS);

    // Markets differ, so offer several purchasable options, one per product name
    const seen = new Set<string>();
    const marketOptions = scored
        .filter(o => !o.inStash)
        .filter(o => {
            const key = displayName(o.ingredient).toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .slice(0, MAX_MARKET_OPTIONS);

    return { stashOptions, marketOptions };
}

// ---------- Whole-formula analysis ----------

function stockOf(line: FormulaLine, stash: StashIndex, targetWeight: number) {
    const neededG = round2((line.percentage / 100) * targetWeight);
    const inStash = stash.has(line.ingredient.id);
    const haveG = inStash ? stash.grams(line.ingredient.id) : null;
    const status: StockStatus = isWater(line.ingredient) ? 'assumed' : !inStash ? 'missing' : haveG != null && haveG < neededG ? 'low' : 'have';
    const shortfall = status === 'missing' ? neededG : status === 'low' ? neededG - (haveG ?? 0) : 0;
    return { neededG, haveG, status, shortfall };
}

/** The lines the user is missing or short on, which are the only ones that need substitutes looked up. */
export function linesNeedingSubstitutes(formula: FormulaLine[], stashEntries: StashEntry[], targetWeight: number): FormulaLine[] {
    const stash = indexStash(stashEntries);
    return formula.filter(line => {
        const { status } = stockOf(line, stash, targetWeight);
        return status === 'missing' || status === 'low';
    });
}

/**
 * Which catalog rows could possibly be a substitute for an ingredient: anything sharing one of its roles, anything
 * sharing a qualifier like "(Soothing)" when its roles are generic, and other grades of the same ingredient.
 * Matches every candidate `findSubstitutes` would accept, and as little else as it can, so the catalog can be
 * narrowed on the server instead of downloaded whole.
 */
export function substituteFilters(original: CatalogIngredient): CatalogFilter[] {
    const { all, qualifiers } = parseFunction(original.function);
    const filters: CatalogFilter[] = [];
    for (const role of all) {
        if (GENERIC_ROLES.has(role)) continue;
        for (const word of ROLE_KEYWORDS[role] ?? []) filters.push(fnHas(word));
    }
    // "Active (Soothing)" only swaps with another soothing ingredient, not with every active
    if ([...all].some(role => GENERIC_ROLES.has(role))) {
        for (const qualifier of qualifiers) filters.push(fnHas(qualifier));
    }
    const base = inciBase(original.inci_name);
    if (base) filters.push(inci(base));
    return filters;
}

export function analyzeFormula(
    formula: FormulaLine[],
    catalog: CatalogIngredient[],
    stashEntries: StashEntry[],
    targetWeight: number,
    targetPh: number | null,
): SourcingItem[] {
    const stash = indexStash(stashEntries);

    return formula.map(line => {
        const { neededG, haveG, status, shortfall } = stockOf(line, stash, targetWeight);

        if (status === 'assumed') {
            return { line, neededG, haveG: null, status: 'assumed' as const, buyG: 0, stashOptions: [], marketOptions: [] };
        }

        if (status === 'have') {
            return { line, neededG, haveG, status, buyG: 0, stashOptions: [], marketOptions: [] };
        }
        const { stashOptions, marketOptions } = findSubstitutes(line, formula, catalog, stash, targetWeight, targetPh);
        return { line, neededG, haveG, status, buyG: withOverage(shortfall), stashOptions, marketOptions };
    });
}

// ---------- Print payload ----------

const optionPayload = (o: SubstituteOption) => ({
    name: displayName(o.ingredient),
    inci: o.ingredient.inci_name,
    matchLabel: o.matchLabel,
    score: o.score,
    percentage: o.percentage,
    neededG: o.neededG,
    buyG: o.buyG,
    costCategory: o.ingredient.cost_category ?? null,
    notes: o.notes,
    warnings: o.warnings,
});

export function buildSourcingPayload(projectName: string, targetWeight: number, targetPh: number | null, items: SourcingItem[]) {
    return {
        projectName,
        targetWeight,
        targetPh,
        overagePercent: PURCHASE_OVERAGE * 100,
        items: items.map(i => ({
            name: displayName(i.line.ingredient),
            inci: i.line.ingredient.inci_name,
            function: i.line.ingredient.function ?? '',
            phase: i.line.phase,
            percentage: i.line.percentage,
            neededG: i.neededG,
            haveG: i.haveG,
            status: i.status,
            buyG: i.buyG,
            stashOptions: i.stashOptions.map(optionPayload),
            marketOptions: i.marketOptions.map(optionPayload),
        })),
    };
}

export const formatGrams = (g: number) => (g >= 10 ? `${round1(g)} g` : `${round2(g)} g`);
