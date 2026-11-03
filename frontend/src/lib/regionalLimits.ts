// Regional limits on how much of an ingredient a cosmetic may contain, for people planning to sell. This is guidance
// from the published rules, not legal advice, and the rules change: always check the current text.

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
    /** over: more than any product may have. depends: allowed only in some products. blend: could be over, depending on the blend. */
    level: 'over' | 'depends' | 'blend';
    percentage: number;
    message: string;
    note?: string;
}

const normalise = (inci: string) => inci.toLowerCase().replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
const parts = (inci: string) => normalise(inci).split(/\(and\)|\band\b|\//).map(p => p.trim()).filter(Boolean);
const fmt = (n: number) => `${Number(n.toFixed(3))}%`;

export const regionFrom = (value: unknown): SellingRegion => (value === 'eu' ? 'eu' : 'none');

/** Checks a formula against the limits where you plan to sell. Several lines of the same substance are added together. */
export function checkRegionalLimits(region: SellingRegion, lines: { inci_name: string; percentage: number }[]): LimitWarning[] {
    if (region === 'none') return [];
    const warnings: LimitWarning[] = [];

    for (const limit of REGIONS[region].limits) {
        const lowest = limit.scopes[0].max;
        const highest = limit.scopes[limit.scopes.length - 1].max;
        let direct = 0;
        let blended = 0;

        for (const { inci_name, percentage } of lines) {
            if (!(percentage > 0)) continue;
            const names = parts(inci_name);
            const hit = names.find(n => limit.names.includes(n));
            if (!hit) continue;
            if (names.length === 1) direct += percentage * (ACID_SHARE[hit] ?? 1);
            else blended += percentage;
        }

        const where = limit.scopes.map(s => `${fmt(s.max)} in ${s.label}`).join(', ');
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
    const rank = { over: 0, depends: 1, blend: 2 };
    return warnings.sort((a, b) => rank[a.level] - rank[b.level]);
}
