// Proposes logical percentages for a formula:
//   1. keep locked rows,
//   2. give fixed-role ingredients (preservative, chelator, fragrance...) a sensible level from their usage range,
//   3. give actives and humectants their typical level,
//   4. derive the structure (oil load, emulsifier, surfactant split, solubilizer) from the product type,
//   5. fill the rest to 100% with the main solvent.

export interface BalanceIngredient {
    inci_name: string;
    trade_name: string;
    function: string | null;
    percentage: number;
    min_usage_pct: number | null;
    max_usage_pct: number | null;
    default_min_usage?: number | null;
    default_max_usage?: number | null;
    solubility?: string | null;
    ionic_charge?: string | null;
    is_fragrance?: boolean | null;
    isQS?: boolean;
    locked?: boolean;
}

export interface BalanceProfile {
    id?: string | null;
    max_oil_phase_percent?: number | null;
}

export interface BalanceOptions {
    /** Keep the current total of oils & butters instead of using the product type's default. */
    keepLipidLoad?: boolean;
}

export type FormulaKind = 'ow' | 'wo' | 'anhydrous' | 'aqueous' | 'surfactant';

export type Role =
    | 'locked' | 'filler' | 'water' | 'preservative' | 'booster' | 'chelator' | 'ph' | 'antioxidant' | 'fragrance'
    | 'active' | 'humectant' | 'thickener' | 'emulsifier' | 'co-emulsifier' | 'wax' | 'lipid' | 'surfactant'
    | 'co-surfactant' | 'solubilizer' | 'electrolyte' | 'powder' | 'solvent' | 'other';

export interface BalancedLine {
    index: number;
    role: Role;
    before: number;
    after: number;
    reason: string;
    changed: boolean;
}

export interface BalanceResult {
    kind: FormulaKind;
    lines: BalancedLine[];
    fillerIndex: number | null;
    total: number;
    warnings: string[];
}

export const ROLE_LABELS: Record<Role, string> = {
    locked: 'Locked', filler: 'Q.S. filler', water: 'Water phase', preservative: 'Preservative', booster: 'Preservative booster',
    chelator: 'Chelator', ph: 'pH adjuster', antioxidant: 'Antioxidant', fragrance: 'Fragrance', active: 'Active',
    humectant: 'Humectant', thickener: 'Thickener', emulsifier: 'Emulsifier', 'co-emulsifier': 'Co-emulsifier', wax: 'Wax',
    lipid: 'Oil / butter / emollient', surfactant: 'Primary surfactant', 'co-surfactant': 'Co-surfactant',
    solubilizer: 'Solubilizer', electrolyte: 'Salt', powder: 'Powder', solvent: 'Solvent', other: 'Other',
};

const PROFILE_KINDS: Record<string, FormulaKind> = {
    ow_lotion: 'ow', wo_cream: 'wo', body_butter: 'anhydrous', facial_oil: 'anhydrous',
    toner_mist: 'aqueous', water_serum: 'aqueous', body_wash: 'surfactant', shampoo: 'surfactant',
};

// Starting points per product type
const DEFAULT_LIPID_LOAD: Partial<Record<FormulaKind, number>> = { ow: 18, wo: 30 };
const EMULSIFIER_SHARE_OF_LIPIDS: Partial<Record<FormulaKind, number>> = { ow: 0.22, wo: 0.15 };
const CO_EMULSIFIER_TOTAL = 2.5;
const SURFACTANT_TOTAL = 15;
const CO_SURFACTANT_SHARE = 0.25;
const SOLUBILIZER_RATIO = 4;
const HUMECTANT_CAP: Record<FormulaKind, number> = { ow: 5, wo: 5, anhydrous: 0, aqueous: 8, surfactant: 5 };
const FRAGRANCE_CAP = 1;
const MIN_WATER_SHARE = 40;

// ---------- Small helpers ----------

const lower = (s: string | null | undefined) => (s ?? '').toLowerCase().trim();
const isNum = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v);

export function fmt(v: number): string {
    return `${Number(v.toFixed(2))}%`;
}

/** Rounds to amounts you can actually weigh: 0.01 below 0.1%, 0.05 below 1%, 0.1 above. */
export function niceRound(v: number): number {
    if (v <= 0) return 0;
    const step = v < 0.1 ? 0.01 : v < 1 ? 0.05 : 0.1;
    return Number((Math.round(v / step) * step).toFixed(2));
}

interface Range { min: number; max: number; lo: number; hi: number }

/** Allowed range (min/max usage) plus the typical range to aim for (supplier defaults when they look real). */
export function usageRange(i: BalanceIngredient): Range {
    const min = isNum(i.min_usage_pct) ? i.min_usage_pct : 0;
    const max = isNum(i.max_usage_pct) && i.max_usage_pct > 0 ? i.max_usage_pct : Math.max(min, 100);
    const dMin = i.default_min_usage, dMax = i.default_max_usage;
    // Many rows carry 0-100 placeholders; only trust defaults that sit inside the allowed range
    const defaultsLookReal = isNum(dMax) && dMax > 0 && !(dMin === 0 && dMax === 100) && dMax <= max + 1e-9;
    if (defaultsLookReal) {
        const lo = Math.max(isNum(dMin) ? dMin : min, min);
        return { min, max, lo: Math.min(lo, dMax), hi: dMax };
    }
    return { min, max, lo: min, hi: max };
}

const clampTo = (v: number, r: Range) => Math.min(Math.max(v, r.min), r.max);
const point = (r: Range, at: number) => r.lo + (r.hi - r.lo) * at;

export function isWaterBase(i: BalanceIngredient): boolean {
    const inci = lower(i.inci_name), trade = lower(i.trade_name);
    return inci === 'aqua' || inci.startsWith('aqua ') || inci.endsWith(' water') || inci.includes('juice')
        || trade.includes('hydrosol') || trade.includes('distillate');
}

const FATTY_STRUCTURANT = /\b(cetyl|stearyl|cetearyl|behenyl|myristyl) alcohol\b|^stearic acid|^glyceryl stearate$|cetyl palmitate|cetyl esters/;

export function roleOf(i: BalanceIngredient, kind: FormulaKind): Role {
    const f = lower(i.function);
    const inci = lower(i.inci_name);
    const oil = lower(i.solubility) === 'oil';

    if (isWaterBase(i)) return 'water';
    if (f.startsWith('preservative') && !f.includes('booster')) return 'preservative';
    if (f.includes('booster')) return 'booster';
    if (f.includes('chelat')) return 'chelator';
    if (f.startsWith('ph adjuster')) return 'ph';
    if (f.startsWith('antioxidant')) return 'antioxidant';
    if ((i.is_fragrance && oil) || f.startsWith('fragrance')) return 'fragrance';
    if (/^(sodium chloride|magnesium sulfate)/.test(inci)) return 'electrolyte';
    if (f.includes('surfactant') && !f.startsWith('thickener')) {
        return f.includes('amphoteric') || lower(i.ionic_charge) === 'amphoteric' ? 'co-surfactant' : 'surfactant';
    }
    if (f.startsWith('solubilizer')) return kind === 'aqueous' || !f.includes('emulsifier') ? 'solubilizer' : 'emulsifier';
    // A fatty alcohol in the name (Montanov 68 is cetearyl alcohol + glucoside) doesn't make a true emulsifier a co-emulsifier
    const isEmulsifier = /(^|[^-])emulsifier/.test(f);
    if (f.includes('co-emulsifier') || (!isEmulsifier && FATTY_STRUCTURANT.test(inci))) return 'co-emulsifier';
    if (isEmulsifier) return 'emulsifier';
    if (f.includes('wax')) return 'wax';
    if (f.includes('rheology') || f.includes('suspending')) return 'thickener';
    if (f.startsWith('active')) return 'active';
    if (f.startsWith('humectant')) return 'humectant';
    if (oil && /carrier oil|butter|emollient|oil|lipid|skin protectant/.test(f)) return 'lipid';
    if (/absorbent|texture|exfoliant|colorant|bath salt|deodorant|astringent/.test(f)) return 'powder';
    if (f.startsWith('solvent')) return 'solvent';
    if (f.includes('active')) return 'active';
    return 'other';
}

export function inferKind(ingredients: BalanceIngredient[], profile?: BalanceProfile | null): FormulaKind {
    const fromProfile = profile?.id ? PROFILE_KINDS[profile.id] : undefined;
    if (fromProfile) return fromProfile;
    const roles = ingredients.map(i => roleOf(i, 'ow'));
    const hasWater = ingredients.some(isWaterBase);
    if (roles.includes('surfactant')) return 'surfactant';
    if (!hasWater) return 'anhydrous';
    if (roles.includes('emulsifier') && roles.includes('lipid')) return 'ow';
    return 'aqueous';
}

/** Split `total` over items by weight, respecting each item's min/max; returns one value per item. */
export function distribute(total: number, items: { weight: number; min: number; max: number }[]): number[] {
    const out = items.map(() => 0);
    let open = items.map((_, k) => k);
    let remaining = total;
    for (let guard = 0; guard < items.length + 2 && open.length > 0; guard++) {
        const weightSum = open.reduce((s, k) => s + Math.max(items[k].weight, 1e-6), 0);
        let clampedAny = false;
        const next: number[] = [];
        for (const k of open) {
            const share = remaining * Math.max(items[k].weight, 1e-6) / weightSum;
            if (share < items[k].min || share > items[k].max) {
                out[k] = share < items[k].min ? items[k].min : items[k].max;
                clampedAny = true;
            } else {
                next.push(k);
            }
        }
        if (!clampedAny) {
            for (const k of open) out[k] = remaining * Math.max(items[k].weight, 1e-6) / weightSum;
            return out;
        }
        remaining = total - out.reduce((s, v, k) => s + (next.includes(k) ? 0 : v), 0);
        open = next;
        if (remaining <= 0) {
            for (const k of open) out[k] = items[k].min;
            return out;
        }
    }
    return out;
}

/** Starting % for a single newly added ingredient, before any balancing. */
export function startingPercentage(i: BalanceIngredient, kind: FormulaKind = 'ow'): number {
    const r = usageRange(i);
    const role = roleOf(i, kind);
    switch (role) {
        case 'preservative': return niceRound(clampTo(point(r, 0.75), r));
        case 'humectant': case 'thickener': return niceRound(clampTo(point(r, 0.25), r));
        case 'fragrance': return niceRound(clampTo(Math.min(point(r, 0.5), FRAGRANCE_CAP / 2), r));
        case 'ph': return niceRound(r.lo);
        default: return niceRound(clampTo(point(r, 0.5), r));
    }
}

// ---------- The balancer ----------

export function balanceFormula(
    ingredients: BalanceIngredient[],
    profile?: BalanceProfile | null,
    options: BalanceOptions = {},
): BalanceResult {
    const kind = inferKind(ingredients, profile);
    const warnings: string[] = [];
    const n = ingredients.length;
    const after: number[] = ingredients.map(i => i.percentage || 0);
    const reasons: string[] = ingredients.map(() => '');
    const roles: Role[] = ingredients.map(i => (i.locked ? 'locked' : roleOf(i, kind)));
    const ranges = ingredients.map(usageRange);
    // `withinRange: false` for roles whose usual range describes a different use (e.g. Epsom salt as a bath salt)
    const set = (k: number, value: number, reason: string, withinRange = true) => {
        after[k] = niceRound(withinRange ? clampTo(value, ranges[k]) : value);
        reasons[k] = reason;
    };
    const idx = (role: Role) => roles.flatMap((r, k) => (r === role ? [k] : []));
    const sum = (ks: number[]) => ks.reduce((s, k) => s + after[k], 0);
    const rangeText = (k: number) => `${fmt(ranges[k].lo)}-${fmt(ranges[k].hi)}`;

    // 1. Locked rows
    idx('locked').forEach(k => { reasons[k] = 'Locked by you'; });

    // Pick the filler: the Q.S. ingredient, else plain water, else the first water-type ingredient
    let filler: number | null = null;
    if (kind !== 'anhydrous') {
        const unlockedWater = ingredients.map((_, k) => k).filter(k => roles[k] === 'water');
        filler = unlockedWater.find(k => ingredients[k].isQS)
            ?? unlockedWater.find(k => lower(ingredients[k].inci_name).startsWith('aqua'))
            ?? unlockedWater[0]
            ?? null;
        if (filler !== null) roles[filler] = 'filler';
    }

    // 2. Fixed roles
    for (const k of idx('preservative')) set(k, point(ranges[k], 0.75), `Upper part of its typical ${rangeText(k)} range for reliable protection`);
    for (const k of [...idx('booster'), ...idx('chelator'), ...idx('antioxidant')]) set(k, point(ranges[k], 0.5), `Middle of its typical ${rangeText(k)} range`);
    for (const k of idx('ph')) set(k, ranges[k].lo, 'Starting amount; add more drop by drop until you reach the target pH');
    for (const k of idx('fragrance')) set(k, Math.min(point(ranges[k], 0.5), kind === 'surfactant' ? FRAGRANCE_CAP : FRAGRANCE_CAP / 2),
        kind === 'surfactant' ? 'Typical level for a wash-off product' : 'Kept low for a leave-on product (stay under 1%, 0.5% for faces)');
    for (const k of idx('electrolyte')) {
        const isMagnesium = lower(ingredients[k].inci_name).startsWith('magnesium sulfate');
        if (kind === 'wo' && isMagnesium) set(k, 0.7, 'Stabilizes the water-in-oil emulsion', false);
        else if (kind === 'surfactant') set(k, ranges[k].lo, 'Start low; add more slowly while checking the thickness');
        else set(k, point(ranges[k], 0.5), `Middle of its typical ${rangeText(k)} range`);
    }
    for (const k of [...idx('powder'), ...idx('solvent'), ...idx('other')]) set(k, point(ranges[k], 0.5), `Middle of its typical ${rangeText(k)} range`);
    for (const k of idx('water')) set(k, point(ranges[k], 0.5), `Middle of its typical ${rangeText(k)} range`);

    // 3. Actives and humectants
    for (const k of idx('active')) set(k, point(ranges[k], 0.5), `Median of its effective ${rangeText(k)} range`);
    const humectants = idx('humectant');
    for (const k of humectants) set(k, point(ranges[k], 0.25), `Lower part of its ${rangeText(k)} range to avoid stickiness`);
    const humectantCap = HUMECTANT_CAP[kind];
    if (humectants.length && humectantCap > 0 && sum(humectants) > humectantCap) {
        const factor = humectantCap / sum(humectants);
        for (const k of humectants) set(k, after[k] * factor, `Scaled so humectants total about ${humectantCap}% (more feels sticky)`);
    }
    for (const k of idx('thickener')) {
        const at = kind === 'aqueous' ? 0.5 : 0.25;
        set(k, point(ranges[k], at), kind === 'aqueous' ? `Middle of its ${rangeText(k)} range to build the gel` : 'Low level: in an emulsion it only needs to stabilize');
    }

    // 4. Structure
    const lipids = idx('lipid');
    const currentLipidLoad = lipids.reduce((s, k) => s + (ingredients[k].percentage || 0), 0);
    const lipidWeights = (ks: number[]) => {
        const userSet = ks.every(k => (ingredients[k].percentage || 0) > 0);
        return ks.map(k => ({
            weight: userSet ? ingredients[k].percentage : point(ranges[k], 0.5),
            min: ranges[k].min,
            max: ranges[k].max,
        }));
    };

    if (kind === 'ow' || kind === 'wo') {
        const emulsifiers = idx('emulsifier');
        const coEmulsifiers = idx('co-emulsifier');
        const oilBudget = isNum(profile?.max_oil_phase_percent) ? profile!.max_oil_phase_percent! : (kind === 'ow' ? 30 : 45);
        const share = EMULSIFIER_SHARE_OF_LIPIDS[kind]!;
        const coTotal = coEmulsifiers.length ? CO_EMULSIFIER_TOTAL : 0;
        // Leave room for the emulsifier and fatty alcohols inside the oil-phase limit
        const lipidCeiling = Math.max((oilBudget - coTotal) / (1 + (emulsifiers.length ? share : 0)), 0);
        let lipidTarget = options.keepLipidLoad && currentLipidLoad > 0 ? currentLipidLoad : DEFAULT_LIPID_LOAD[kind]!;
        if (lipidTarget > lipidCeiling) {
            warnings.push(`Oils reduced to ${fmt(lipidCeiling)} to stay within the ${fmt(oilBudget)} oil-phase limit for this product type.`);
            lipidTarget = lipidCeiling;
        }
        const lipidLoadReason = options.keepLipidLoad && currentLipidLoad > 0 ? 'your current oil load' : `a ${fmt(lipidTarget)} oil load, typical for this product type`;

        if (lipids.length) {
            distribute(lipidTarget, lipidWeights(lipids)).forEach((v, j) => set(lipids[j], v, `Share of ${lipidLoadReason}`));
        }
        const realLipids = sum(lipids) + sum(idx('fragrance'));
        if (emulsifiers.length) {
            const target = Math.max(realLipids * share, 0);
            distribute(target, emulsifiers.map(k => ({ weight: point(ranges[k], 0.5), min: ranges[k].min, max: ranges[k].max })))
                .forEach((v, j) => set(emulsifiers[j], v, `About ${Math.round(share * 100)}% of the ${fmt(realLipids)} oil phase`));
        } else if (realLipids > 0) {
            warnings.push('There is no emulsifier, so the oils will separate from the water. Add one, e.g. Olivem 1000 or Montanov 68.');
        }
        if (coEmulsifiers.length) {
            distribute(coTotal, coEmulsifiers.map(k => ({ weight: 1, min: ranges[k].min, max: ranges[k].max })))
                .forEach((v, j) => set(coEmulsifiers[j], v, `Fatty alcohols total about ${CO_EMULSIFIER_TOTAL}% for body and stability`));
        }
        for (const k of idx('wax')) set(k, ranges[k].lo, 'Low level: waxes make emulsions heavy');
        for (const k of idx('solubilizer')) set(k, ranges[k].lo, 'Low level: the emulsifier already holds the oils');
    }

    if (kind === 'aqueous') {
        const oilSoluble = ingredients.map((_, k) => k).filter(k =>
            lower(ingredients[k].solubility) === 'oil' && roles[k] !== 'locked' && roles[k] !== 'solubilizer' && roles[k] !== 'emulsifier');
        for (const k of lipids) set(k, Math.min(ranges[k].lo, 1), 'Kept minimal: a water-based product can only carry a little oil');
        const oilLoad = sum(oilSoluble) + idx('locked').filter(k => lower(ingredients[k].solubility) === 'oil').reduce((s, k) => s + after[k], 0);
        const solubilizers = [...idx('solubilizer'), ...idx('emulsifier')];
        if (oilLoad > 0 && solubilizers.length) {
            distribute(oilLoad * SOLUBILIZER_RATIO, solubilizers.map(k => ({ weight: 1, min: ranges[k].min, max: ranges[k].max })))
                .forEach((v, j) => set(solubilizers[j], v, `${SOLUBILIZER_RATIO}x the ${fmt(oilLoad)} of oil-soluble ingredients, so the product stays clear`));
        } else if (oilLoad > 0) {
            warnings.push('Oil-soluble ingredients need a solubilizer (e.g. Polysorbate 20 or Polyglyceryl-4 Caprate) at 3-5x their weight.');
        }
        for (const k of [...idx('co-emulsifier'), ...idx('wax')]) set(k, ranges[k].lo, 'Minimal: not needed in a water-based product');
    }

    if (kind === 'surfactant') {
        const primaries = idx('surfactant'), secondaries = idx('co-surfactant');
        const secondaryTotal = secondaries.length ? SURFACTANT_TOTAL * CO_SURFACTANT_SHARE : 0;
        const primaryTotal = SURFACTANT_TOTAL - secondaryTotal;
        if (primaries.length) {
            distribute(primaryTotal, primaries.map(k => ({ weight: 1, min: ranges[k].min, max: ranges[k].max })))
                .forEach((v, j) => set(primaries[j], v, `Main cleansers share ${fmt(primaryTotal)} of a ${SURFACTANT_TOTAL}% surfactant system`));
        } else {
            warnings.push('There is no primary surfactant; the product will not cleanse or foam.');
        }
        if (secondaries.length) {
            distribute(secondaryTotal, secondaries.map(k => ({ weight: 1, min: ranges[k].min, max: ranges[k].max })))
                .forEach((v, j) => set(secondaries[j], v, 'About 1 part to 3 parts primary surfactant, for mildness and foam'));
        }
        for (const k of lipids) set(k, Math.min(ranges[k].lo, 1), 'Kept low: oils reduce foam');
        for (const k of [...idx('emulsifier'), ...idx('co-emulsifier'), ...idx('solubilizer')]) set(k, ranges[k].lo, 'Low level');
    }

    if (kind === 'anhydrous') {
        for (const k of [...idx('emulsifier'), ...idx('co-emulsifier'), ...idx('solubilizer')]) set(k, ranges[k].lo, 'Low level: no water to emulsify');
        for (const k of idx('wax')) set(k, point(ranges[k], 0.25), 'Enough to give structure; add more for a firmer balm');
        const fixed = ingredients.map((_, k) => k).filter(k => roles[k] !== 'lipid').reduce((s, k) => s + after[k], 0);
        const room = 100 - fixed;
        if (!lipids.length) {
            warnings.push('Add carrier oils or butters: in an anhydrous product they make up the bulk of the formula.');
        } else if (room <= 0) {
            warnings.push('The other ingredients already use up 100%; there is no room left for oils.');
        } else {
            distribute(room, lipidWeights(lipids).map(w => ({ ...w, max: Math.max(w.max, 0) })))
                .forEach((v, j) => {
                    after[lipids[j]] = Number(v.toFixed(2));
                    reasons[lipids[j]] = 'Oils and butters fill the rest of the formula';
                });
        }
        const lipidTotal = sum(lipids);
        if (lipids.length && room > 0 && room - lipidTotal > 0.5) {
            warnings.push(`Your oils can only reach ${fmt(lipidTotal)} within their usage limits. Add a carrier oil that can be used at high levels (e.g. jojoba, sunflower or fractionated coconut oil).`);
        }
    }

    // 5. Fill to 100%
    const others = ingredients.map((_, k) => k).filter(k => k !== filler);
    let othersTotal = sum(others);
    if (filler !== null) {
        if (othersTotal > 100) {
            // Too much: shrink everything except locked rows and preservatives
            const flexible = others.filter(k => !['locked', 'preservative', 'ph', 'chelator'].includes(roles[k]));
            const fixedTotal = sum(others.filter(k => !flexible.includes(k)));
            const factor = Math.max((100 - fixedTotal - MIN_WATER_SHARE) / Math.max(sum(flexible), 1e-6), 0);
            for (const k of flexible) set(k, after[k] * factor, reasons[k] + ' (scaled down to fit in 100%)');
            othersTotal = sum(others);
            warnings.push('The ingredients added up to more than 100%, so the flexible ones were scaled down.');
        }
        after[filler] = Number(Math.max(100 - othersTotal, 0).toFixed(2));
        reasons[filler] = 'Q.S.: fills the formula up to 100%';
        if (kind !== 'surfactant' && after[filler] < MIN_WATER_SHARE) {
            warnings.push(`Only ${fmt(after[filler])} is left for ${ingredients[filler].trade_name}; this is unusually little for a water-based product.`);
        }
    } else if (kind !== 'anhydrous') {
        warnings.push('Add water (or another base liquid) to fill the formula to 100%. It becomes the Q.S. ingredient.');
    }

    // Rounding drift: settle it on the filler, or the largest lipid in anhydrous products
    const total = Number(after.reduce((s, v) => s + v, 0).toFixed(2));
    const absorber = filler ?? (kind === 'anhydrous' && lipids.length ? lipids.reduce((a, b) => (after[a] >= after[b] ? a : b)) : null);
    if (absorber !== null && Math.abs(total - 100) > 0 && Math.abs(total - 100) < 1) {
        after[absorber] = Number((after[absorber] + (100 - total)).toFixed(2));
    }

    const lines: BalancedLine[] = ingredients.map((ing, k) => ({
        index: k,
        role: roles[k],
        before: ing.percentage || 0,
        after: after[k],
        reason: reasons[k] || 'Unchanged',
        changed: Math.abs((ing.percentage || 0) - after[k]) > 0.001,
    }));
    for (let k = 0; k < n; k++) if (lines[k].after < 0) lines[k].after = 0;

    return {
        kind,
        lines,
        fillerIndex: filler,
        total: Number(lines.reduce((s, l) => s + l.after, 0).toFixed(2)),
        warnings,
    };
}
