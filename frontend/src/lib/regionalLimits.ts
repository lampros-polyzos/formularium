// Regional limits on how much of an ingredient a cosmetic may contain, for people planning to sell. This is guidance
// from the published rules, not legal advice, and the rules change: always check the current text.

import type { AnnexData } from './annexIII/parse';

export type SellingRegion = 'none' | 'eu';

/** What a limit allows in one kind of product. */
export interface LimitScope { label: string; max: number }

export interface RegionalLimit {
    id: string;
    substance: string;
    /** INCI names the limit applies to, lower case. */
    names: string[];
    /** Smallest first. Above the smallest the ingredient is only allowed in some kinds of product. */
    scopes: LimitScope[];
    /** CAS numbers, when the limit is written for a specific substance (helps when a name is spelt differently). */
    cas?: string[];
    /** Share of an ingredient that counts toward the limit, for salts where the limit is stated as the acid. */
    factor?: number;
    note?: string;
}

export interface Region {
    label: string;
    rule: string;
    reference: string;
    limits: RegionalLimit[];
    /** Things that apply to selling there however much of anything is used. */
    reminders: string[];
}

export const REGIONS: Record<Exclude<SellingRegion, 'none'>, Region> = {
    eu: {
        label: 'European Union',
        rule: 'Regulation (EC) No 1223/2009, Annexes III and V',
        reference: 'https://eur-lex.europa.eu/eli/reg/2009/1223/oj',
        reminders: [
            'Every product needs a safety assessment by a qualified person, a Responsible Person based in the EU, and a notification in the CPNP before it is sold.',
        ],
        limits: [
            { id: 'salicylic-acid', substance: 'Salicylic acid', names: ['salicylic acid'],
                scopes: [{ label: 'most products', max: 2 }, { label: 'rinse-off hair products', max: 3 }],
                note: 'As a preservative the limit is 0.5%. Not for children under 3 (except shampoo).' },
            { id: 'alpha-arbutin', substance: 'Alpha-arbutin', names: ['alpha-arbutin'],
                scopes: [{ label: 'body products', max: 0.5 }, { label: 'face creams', max: 2 }],
                note: 'Hydroquinone must stay at unavoidable traces.' },
            { id: 'arbutin', substance: 'Arbutin', names: ['arbutin'],
                scopes: [{ label: 'face creams', max: 7 }],
                note: 'Hydroquinone must stay at unavoidable traces.' },
            { id: 'kojic-acid', substance: 'Kojic acid', names: ['kojic acid'],
                scopes: [{ label: 'face and hand products', max: 1 }] },
            { id: 'retinol', substance: 'Retinol and its esters', names: ['retinol', 'retinyl acetate', 'retinyl palmitate'],
                scopes: [{ label: 'body lotion', max: 0.05 }, { label: 'other products', max: 0.3 }],
                note: 'Counted as retinol equivalent. Labels must say "Contains Vitamin A. Consider your daily intake before use."' },
            { id: 'phenoxyethanol', substance: 'Phenoxyethanol', names: ['phenoxyethanol'], scopes: [{ label: 'all products', max: 1 }] },
            { id: 'benzyl-alcohol', substance: 'Benzyl alcohol', names: ['benzyl alcohol'], scopes: [{ label: 'as a preservative', max: 1 }] },
            { id: 'sorbic-acid', substance: 'Sorbic acid and sorbates', names: ['sorbic acid', 'potassium sorbate'],
                scopes: [{ label: 'all products', max: 0.6 }], note: 'Limit is stated as the acid.' },
            { id: 'benzoic-acid', substance: 'Benzoic acid and benzoates', names: ['benzoic acid', 'sodium benzoate'],
                scopes: [{ label: 'leave-on products', max: 0.5 }, { label: 'rinse-off products', max: 2.5 }], note: 'Limit is stated as the acid.' },
            { id: 'methylparaben', substance: 'Methylparaben', names: ['methylparaben', 'ethylparaben'], scopes: [{ label: 'each ester', max: 0.4 }], note: 'Mixtures of parabens: 0.8% in total.' },
        ],
    },
};

/** Acid content of the salts in the list above, so 0.6% limits stated as the acid are not over-reported. */
const ACID_SHARE: Record<string, number> = { 'potassium sorbate': 0.746, 'sodium benzoate': 0.847 };

export interface LimitWarning {
    id: string;
    substance: string;
    /**
     * over: more than any product may have. depends: allowed only in some products. blend: could be over, depending on the
     * blend. declare: must be named on the label at this amount. note: a condition of use worth knowing, with no number to check.
     */
    level: 'over' | 'depends' | 'blend' | 'declare' | 'note';
    percentage: number;
    message: string;
    note?: string;
}

const normalise = (inci: string) => inci.toLowerCase().replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
const parts = (inci: string) => normalise(inci).split(/\(and\)|\band\b|\//).map(p => p.trim()).filter(Boolean);
const fmt = (n: number) => `${Number(n.toFixed(3))}%`;

export const regionFrom = (value: unknown): SellingRegion => (value === 'eu' ? 'eu' : 'none');

/** One line of a formula, as far as the limits need to know. `cas_number` helps find an ingredient whose name is written differently. */
export interface LimitLine { inci_name: string; percentage: number; cas_number?: string | null }

const casOf = (line: LimitLine) => (line.cas_number ?? '').replace(/\s+/g, '');

/** "1% in A, 2% in B" for a few limits; for many, the smallest two and the highest. */
function describeScopes(scopes: LimitScope[]): string {
    const one = (s: LimitScope) => `${fmt(s.max)} in ${s.label}`;
    if (scopes.length <= 3) return scopes.map(one).join(', ');
    return `${scopes.slice(0, 2).map(one).join(', ')}, and up to ${one(scopes[scopes.length - 1])} (${scopes.length} kinds of product in all)`;
}

/** The official Annex III entries that have clear numeric limits, as limits like the hand-written ones. Hand-written ones win. */
function annexLimits(data: AnnexData, handWritten: RegionalLimit[]): RegionalLimit[] {
    const taken = new Set(handWritten.flatMap(l => l.names));
    return data.entries
        .filter(e => e.scopes.length > 0 && !e.names.some(n => taken.has(n)))
        .map(e => ({ id: `annex3-${e.id}`, substance: e.title, names: e.names, cas: e.cas, scopes: e.scopes, note: e.note || undefined }));
}

/** Label thresholds and conditions of use from the official entries, for ingredients in the formula. */
function annexNotices(data: AnnexData, handWritten: RegionalLimit[], lines: LimitLine[]): LimitWarning[] {
    const taken = new Set(handWritten.flatMap(l => l.names));
    const warnings: LimitWarning[] = [];
    for (const entry of data.entries) {
        if (entry.names.some(n => taken.has(n))) continue;
        if (entry.scopes.length > 0 && !entry.declare) continue; // a number to check, nothing more to say
        const covered = new Set([...entry.names, ...entry.alsoCovers]);
        let amount = 0;
        let present = false;
        for (const line of lines) {
            if (!(line.percentage > 0)) continue;
            const names = parts(line.inci_name);
            const byCas = entry.cas.length > 0 && entry.cas.includes(casOf(line));
            if (byCas || (names.length === 1 && covered.has(names[0]))) { amount += line.percentage; present = true; }
        }
        if (!present) continue;

        if (entry.declare) {
            const { leaveOn, rinseOff } = entry.declare;
            if (amount <= leaveOn) continue;
            warnings.push({
                id: `annex3-declare-${entry.id}`, substance: entry.title, level: 'declare', percentage: amount,
                message: `${entry.title} is at ${fmt(amount)}. It has to be named in the ingredient list on the label when it is above ${fmt(leaveOn)} in leave-on products or ${fmt(rinseOff)} in rinse-off products, including when it comes from a fragrance or essential oil.`,
            });
        } else if (entry.note) {
            warnings.push({ id: `annex3-note-${entry.id}`, substance: entry.title, level: 'note', percentage: amount, message: entry.note });
        }
    }
    return warnings;
}

const RANK: Record<LimitWarning['level'], number> = { over: 0, depends: 1, blend: 2, declare: 3, note: 4 };

/**
 * Checks a formula against the limits where you plan to sell. Several lines of the same substance are added together.
 * The hand-written limits always apply; `annex` adds the official Annex III entries on top (see lib/annexIII).
 */
export function checkRegionalLimits(region: SellingRegion, lines: LimitLine[], annex?: AnnexData): LimitWarning[] {
    if (region === 'none') return [];
    const warnings: LimitWarning[] = [];
    const handWritten = REGIONS[region].limits;
    const limits = [...handWritten, ...(annex && region === 'eu' ? annexLimits(annex, handWritten) : [])];

    for (const limit of limits) {
        const lowest = limit.scopes[0].max;
        const highest = limit.scopes[limit.scopes.length - 1].max;
        let direct = 0;
        let blended = 0;

        for (const line of lines) {
            const { inci_name, percentage } = line;
            if (!(percentage > 0)) continue;
            const names = parts(inci_name);
            if (limit.cas && limit.cas.includes(casOf(line))) { direct += percentage; continue; }
            const hit = names.find(n => limit.names.includes(n));
            if (!hit) continue;
            if (names.length === 1) direct += percentage * (ACID_SHARE[hit] ?? 1);
            else blended += percentage;
        }

        const where = describeScopes(limit.scopes);
        if (direct > highest) {
            warnings.push({ id: limit.id, substance: limit.substance, level: 'over', percentage: direct, note: limit.note,
                message: `${limit.substance} is at ${fmt(direct)}, above the EU maximum (${where}). It could not be sold there as it is.` });
        } else if (direct > lowest) {
            warnings.push({ id: limit.id, substance: limit.substance, level: 'depends', percentage: direct, note: limit.note,
                message: `${limit.substance} is at ${fmt(direct)}. The EU allows ${where}, so this is only fine for the products that allow it.` });
        } else if (direct + blended > lowest && blended > 0) {
            warnings.push({ id: limit.id, substance: limit.substance, level: 'blend', percentage: direct + blended, note: limit.note,
                message: `A blend containing ${limit.substance.toLowerCase()} is used at ${fmt(blended)}. Ask the supplier how much ${limit.substance.toLowerCase()} it holds: the EU allows ${where}.` });
        }
    }
    if (annex && region === 'eu') warnings.push(...annexNotices(annex, handWritten, lines));
    return warnings.sort((a, b) => RANK[a.level] - RANK[b.level]);
}
