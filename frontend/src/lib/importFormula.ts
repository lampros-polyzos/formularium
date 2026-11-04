// Turns pasted lines that have been matched to library ingredients into a formula: percentages that add up, phases, and a
// guess at the product type. Pure.
//
//   - Percentages are used as written.
//   - Weights (grams, ml, ounces, spoons, "parts") become percentages of the total weight.
//   - A bare number (Water 70) is a percentage if the numbers add up to about 100, otherwise a weight.
//   - "q.s." takes whatever is left to reach 100%.
//   - Lines with no amount at all get a sensible amount from the balancer, around the amounts that were given.

import { balanceFormula, inferKind, type BalanceIngredient, type FormulaKind } from './autoBalance';
import { determinePhase } from './phases';
import type { Amount, ParsedLine } from './recipeParser';
import type { MatchableRow } from './ingredientMatcher';

export type ImportRow = MatchableRow & Omit<BalanceIngredient, 'percentage'> & { max_heating_temp_c?: number | null };

export interface ImportLine<R extends ImportRow> {
    parsed: ParsedLine;
    /** The library ingredient chosen for this line, or null if it was skipped / not found. */
    row: R | null;
    /** A percentage the person typed in the review, which beats whatever was pasted. */
    overridePct?: number | null;
    /** A phase the person chose in the review. */
    overridePhase?: 'A' | 'B' | 'C';
}

export type ImportedIngredient<R extends ImportRow> = R & { phase: 'A' | 'B' | 'C'; percentage: number; isQS: boolean };

export interface ImportedFormula<R extends ImportRow> {
    /** One entry per matched line, in the order pasted. */
    ingredients: ImportedIngredient<R>[];
    /** Which pasted line each ingredient came from (an index into the lines given). */
    lineIndexes: number[];
    /** Where each ingredient's percentage came from, for the review screen. */
    sources: ('pasted' | 'weight' | 'range' | 'remainder' | 'suggested' | 'edited')[];
    warnings: string[];
    profileId: string;
    kind: FormulaKind;
}

const GRAMS_PER: Record<Amount['unit'], number | null> = { '%': null, g: 1, ml: 1, oz: 28.35, tsp: 5, tbsp: 15, drops: 0.05, parts: 1, number: null };

const round = (v: number, places = 2) => Math.round(v * 10 ** places) / 10 ** places;

const PROFILE_FOR_KIND: Record<FormulaKind, string> = { ow: 'ow_lotion', wo: 'wo_cream', anhydrous: 'facial_oil', aqueous: 'toner_mist', surfactant: 'body_wash' };

/** The product type that fits what is in the formula. The person can change it. */
export function guessProfileId(rows: ImportRow[]): { profileId: string; kind: FormulaKind } {
    const kind = inferKind(rows.map(r => ({ ...r, percentage: 0 })));
    if (kind === 'anhydrous' && rows.some(r => /butter|wax/i.test(`${r.function ?? ''} ${r.inci_name}`))) return { profileId: 'body_butter', kind };
    if (kind === 'aqueous' && rows.some(r => /rheology|thicken|gel/i.test(r.function ?? ''))) return { profileId: 'water_serum', kind };
    if (kind === 'surfactant' && rows.some(r => /shampoo/i.test(r.function ?? ''))) return { profileId: 'shampoo', kind };
    return { profileId: PROFILE_FOR_KIND[kind], kind };
}

export function buildImportedFormula<R extends ImportRow>(lines: ImportLine<R>[], profileId?: string | null): ImportedFormula<R> {
    const warnings: string[] = [];
    const picked = lines.flatMap((line, lineIndex) => (line.row ? [{ ...line, row: line.row, lineIndex }] : []));
    const guess = guessProfileId(picked.map(p => p.row));
    const finalProfileId = profileId || guess.profileId;

    // ---- Decide what each number means ----
    const all = lines.filter(l => l.parsed.amount || l.overridePct != null);
    const hasPct = all.some(l => l.overridePct != null || l.parsed.amount?.unit === '%');
    const bare = all.filter(l => l.overridePct == null && l.parsed.amount?.unit === 'number');
    const bareSum = bare.reduce((s, l) => s + (l.parsed.amount?.value ?? 0), 0);
    const bareArePercent = hasPct || (bare.length > 0 && Math.abs(bareSum - 100) <= 5);

    const kindOf = (l: ImportLine<R>): { pct?: number; mass?: number } => {
        if (l.overridePct != null) return { pct: l.overridePct };
        const a = l.parsed.amount;
        if (!a) return {};
        if (a.unit === '%') return { pct: a.value };
        if (a.unit === 'number') return bareArePercent ? { pct: a.value } : { mass: a.value };
        return { mass: a.value * (GRAMS_PER[a.unit] ?? 1) };
    };
    const kinds = lines.map(kindOf);

    // Weights: a share of the total weight of everything written down (even lines that could not be matched)
    const totalMass = kinds.reduce((s, k) => s + (k.mass ?? 0), 0);
    const pctWritten = kinds.reduce((s, k) => s + (k.pct ?? 0), 0);
    const massShare = totalMass > 0 ? Math.max(100 - pctWritten, 0) : 0;
    if (totalMass > 0 && hasPct) warnings.push('Some amounts were percentages and some were weights; the weights were scaled to fill the remaining percentage.');

    const percentOf = (i: number): number | null => {
        const k = kinds[i];
        if (k.pct != null) return k.pct;
        if (k.mass != null && totalMass > 0) return (k.mass / totalMass) * massShare;
        return null;
    };

    // ---- Build the balancer's view of the matched lines ----
    const known = picked.map(p => percentOf(p.lineIndex));
    const qsIndex = picked.findIndex(p => p.parsed.qs);
    const anyKnown = known.some(v => v != null);
    const unknownExists = known.some((v, i) => v == null && i !== qsIndex);
    const sourceOf = (p: (typeof picked)[number], i: number): ImportedFormula<R>['sources'][number] =>
        p.overridePct != null ? 'edited' : known[i] == null ? 'suggested' : p.parsed.amount?.range ? 'range' : (p.parsed.amount?.unit === '%' || (bareArePercent && p.parsed.amount?.unit === 'number')) ? 'pasted' : 'weight';

    let percentages = known.map(v => (v == null ? 0 : round(v)));
    let fillerIndex: number | null = qsIndex >= 0 ? qsIndex : null;
    const sources = picked.map(sourceOf);

    if (picked.length === 0) {
        return { ingredients: [], lineIndexes: [], sources: [], warnings: ['None of the pasted lines matched an ingredient in your library.'], profileId: finalProfileId, kind: guess.kind };
    }

    if (qsIndex >= 0 && !unknownExists) {
        // Every other amount is known: the q.s. line is simply what is left
        const others = percentages.reduce((sum, v, i) => (i === qsIndex ? sum : sum + v), 0);
        percentages[qsIndex] = round(Math.max(100 - others, 0));
        sources[qsIndex] = 'remainder';
        if (others > 100) warnings.push(`The other amounts already add up to ${round(others, 1)}%, so there is nothing left for ${picked[qsIndex].parsed.name}.`);
    } else if (!anyKnown || unknownExists) {
        // Locked: whatever the person gave. Everything else: the balancer decides, with the q.s. line as the filler.
        const forBalance: BalanceIngredient[] = picked.map((p, i) => ({
            ...p.row,
            percentage: known[i] ?? 0,
            locked: known[i] != null && i !== qsIndex,
            isQS: i === qsIndex,
        }));
        const result = balanceFormula(forBalance, { id: finalProfileId });
        const allSuggested = !anyKnown;
        percentages = result.lines.map((l, i) => (known[i] != null && i !== qsIndex ? percentages[i] : l.after));
        if (result.fillerIndex !== null) fillerIndex = result.fillerIndex;
        result.lines.forEach((_line, i) => {
            if (known[i] == null) sources[i] = i === qsIndex || i === result.fillerIndex ? 'remainder' : 'suggested';
            else if (i === qsIndex) sources[i] = 'remainder';
        });
        if (allSuggested) warnings.push('No amounts were given, so amounts were suggested. Check each one.');
        else if (unknownExists) warnings.push('Some lines had no amount, so amounts were suggested for them.');
        warnings.push(...result.warnings);
    } else {
        const total = percentages.reduce((s, v) => s + v, 0);
        if (Math.abs(total - 100) > 0.5) warnings.push(`The amounts add up to ${round(total, 1)}%, not 100%. Adjust them in the Studio.`);
    }

    // Anything that was written but not matched
    const skippedWithAmount = lines.filter(l => !l.row && (l.parsed.amount || l.overridePct != null));
    if (skippedWithAmount.length) warnings.push(`Skipped with an amount: ${skippedWithAmount.map(l => l.parsed.name).join(', ')}. The formula may not add up to 100%.`);

    const ingredients = picked.map((p, i) => ({
        ...p.row,
        phase: p.overridePhase ?? p.parsed.phase ?? determinePhase(p.row),
        percentage: percentages[i],
        isQS: fillerIndex === i,
    })) as unknown as ImportedIngredient<R>[];

    return { ingredients, lineIndexes: picked.map(p => p.lineIndex), sources, warnings, profileId: finalProfileId, kind: guess.kind };
}
