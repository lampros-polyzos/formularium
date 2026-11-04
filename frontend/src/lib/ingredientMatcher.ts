// Finds the ingredient-library entry that a pasted name means. Pure: it is given the candidate rows.
//
// People write "shea butter", "vitamin E", "distilled water" or "Butyrospermum Parkii (Shea) Butter"; the library lists
// INCI names and trade names. Matching works in layers, strongest first:
//   1. the same name once punctuation, capitals and brackets are ignored,
//   2. a well-known everyday name for it ("vitamin E" -> Tocopherol),
//   3. the same words (ignoring words like "pure" or "cold pressed") in any order, or one name containing the other,
//   4. a small spelling mistake ("glycerine", "panthenoll").
// Each answer comes with how sure it is, so the person is asked to look at the uncertain ones.

export interface MatchableRow {
    id: string;
    inci_name: string;
    trade_name: string | null;
}

export type Confidence = 'exact' | 'likely' | 'possible';

export interface MatchCandidate<R extends MatchableRow> {
    row: R;
    /** 0 to 1. */
    score: number;
    confidence: Confidence;
}

/** Everyday names and spellings mapped to the name the library is likely to use. First match wins; all are tried. */
export const COMMON_NAMES: Record<string, string[]> = {
    water: ['aqua'], 'distilled water': ['aqua'], 'deionized water': ['aqua'], 'deionised water': ['aqua'], 'purified water': ['aqua'],
    'demineralized water': ['aqua'], 'di water': ['aqua'], 'dm water': ['aqua'], 'filtered water': ['aqua'], 'spring water': ['aqua'], 'hot water': ['aqua'],
    glycerine: ['glycerin'], 'vegetable glycerin': ['glycerin'], 'vegetable glycerine': ['glycerin'], 'glycerol': ['glycerin'],
    'vitamin e': ['tocopherol'], 'vit e': ['tocopherol'], 'vitamin e oil': ['tocopherol'], 'tocopheryl acetate': ['tocopheryl acetate'],
    'vitamin b5': ['panthenol'], 'pro vitamin b5': ['panthenol'], 'provitamin b5': ['panthenol'], 'dl panthenol': ['panthenol'], 'd panthenol': ['panthenol'],
    'vitamin b3': ['niacinamide'], 'vitamin c': ['ascorbic acid'], 'l ascorbic acid': ['ascorbic acid'], 'vitamin a': ['retinol'],
    'hyaluronic acid': ['sodium hyaluronate'], 'ha': ['sodium hyaluronate'],
    'aloe vera': ['aloe barbadensis'], 'aloe vera gel': ['aloe barbadensis'], 'aloe': ['aloe barbadensis'], 'aloe vera juice': ['aloe barbadensis'],
    'shea butter': ['butyrospermum parkii'], 'shea': ['butyrospermum parkii'], 'cocoa butter': ['theobroma cacao'], 'cacao butter': ['theobroma cacao'],
    'mango butter': ['mangifera indica'], 'kokum butter': ['garcinia indica'],
    'jojoba oil': ['simmondsia chinensis'], 'jojoba': ['simmondsia chinensis'], 'sweet almond oil': ['prunus amygdalus dulcis'], 'almond oil': ['prunus amygdalus dulcis'],
    'coconut oil': ['cocos nucifera'], 'olive oil': ['olea europaea'], 'sunflower oil': ['helianthus annuus'], 'argan oil': ['argania spinosa'],
    'rosehip oil': ['rosa canina'], 'rose hip oil': ['rosa canina'], 'castor oil': ['ricinus communis'], 'avocado oil': ['persea gratissima'],
    'grapeseed oil': ['vitis vinifera'], 'grape seed oil': ['vitis vinifera'], 'apricot kernel oil': ['prunus armeniaca'], 'hemp oil': ['cannabis sativa'],
    'hemp seed oil': ['cannabis sativa'], 'safflower oil': ['carthamus tinctorius'], 'sesame oil': ['sesamum indicum'], 'macadamia oil': ['macadamia'],
    'fractionated coconut oil': ['caprylic capric triglyceride'], 'mct oil': ['caprylic capric triglyceride'], 'mct': ['caprylic capric triglyceride'],
    beeswax: ['cera alba'], 'bees wax': ['cera alba'], 'candelilla wax': ['euphorbia cerifera'], 'carnauba wax': ['copernicia cerifera'],
    'baking soda': ['sodium bicarbonate'], salt: ['sodium chloride'], 'table salt': ['sodium chloride'], 'sea salt': ['sodium chloride'],
    'emulsifying wax': ['cetearyl alcohol polysorbate'], 'ewax': ['cetearyl alcohol polysorbate'],
    'cetearyl alcohol': ['cetearyl alcohol'], 'cetyl alcohol': ['cetyl alcohol'], 'stearic acid': ['stearic acid'],
    'lecithin': ['lecithin'], 'soy lecithin': ['lecithin'], 'xanthan': ['xanthan gum'],
    'sls': ['sodium lauryl sulfate'], 'sles': ['sodium laureth sulfate'], 'capb': ['cocamidopropyl betaine'], 'cab': ['cocamidopropyl betaine'],
    'sci': ['sodium cocoyl isethionate'], 'slmi': ['sodium lauroyl methyl isethionate'], 'edta': ['disodium edta'],
    'zinc': ['zinc oxide'], 'lactic acid': ['lactic acid'], 'citric acid': ['citric acid'], 'sodium hydroxide': ['sodium hydroxide'], 'lye': ['sodium hydroxide'],
    'squalene': ['squalane'], 'vitamin k': ['phytonadione'],
};

/** Words that describe a grade or a state rather than what the ingredient is: ignored when comparing. */
const DESCRIPTORS = new Set([
    'pure', 'organic', 'natural', 'raw', 'refined', 'unrefined', 'cold', 'pressed', 'virgin', 'extra', 'high', 'low', 'oleic', 'mw', 'hmw', 'lmw',
    'food', 'grade', 'cosmetic', 'usp', 'bp', 'ep', 'powder', 'liquid', 'solution', 'fresh', 'dried', 'dry', 'filtered', 'certified', 'vegan',
    'vegetable', 'plant', 'derived', 'based', 'and', 'of', 'the', 'a', 'in', 'with', 'from', 'active', 'actives', 'mixed', 'dl', 'l', 'd', 'nf', 'ph', 'eur',
]);

/** Words that are part of a name but say little about which ingredient it is: used when sorting out near-ties. */
const GENERIC = new Set(['oil', 'extract', 'butter', 'seed', 'leaf', 'fruit', 'kernel', 'root', 'wax']);

function fold(text: string): string {
    return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** The words of a name: lower case, no accents, no punctuation or percentages, plurals reduced. */
export function nameTokens(name: string | null | undefined): string[] {
    return fold(name ?? '')
        .replace(/\[[^\]]*\]/g, ' ')                       // [grade] markers in library names
        .replace(/\d+(?:[.,]\d+)?\s*%/g, ' ')              // "99.5%" purity figures
        .replace(/[^a-z0-9]+/g, ' ')
        .split(' ')
        .filter(Boolean)
        .map(singular);
}

function singular(token: string): string {
    if (token.length > 4 && token.endsWith('ies')) return token.slice(0, -3) + 'y';
    if (token.length > 4 && token.endsWith('s') && !token.endsWith('ss') && !token.endsWith('us') && !token.endsWith('is')) return token.slice(0, -1);
    return token;
}

const core = (tokens: string[]) => {
    const kept = tokens.filter(t => !DESCRIPTORS.has(t));
    return kept.length ? kept : tokens;
};

const key = (tokens: string[]) => tokens.join(' ');

function editDistance(a: string, b: string): number {
    if (a === b) return 0;
    const row = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
        let prev = row[0];
        row[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const tmp = row[j];
            row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
            prev = tmp;
        }
    }
    return row[b.length];
}

/** How well one written name fits one library name, 0 to 1. */
export function nameScore(written: string, libraryName: string | null | undefined, viaCommonName = false): number {
    const w = nameTokens(written);
    const l = nameTokens(libraryName);
    if (!w.length || !l.length) return 0;

    // 1. The same name, ignoring order of nothing: punctuation and case only
    if (key(w) === key(l)) return viaCommonName ? 0.97 : 1;

    const wc = core(w);
    const lc = core(l);
    if (key(wc) === key(lc)) return viaCommonName ? 0.95 : 0.93;

    const wSet = new Set(wc);
    const lSet = new Set(lc);
    const wInL = wc.filter(t => lSet.has(t)).length;
    const lInW = lc.filter(t => wSet.has(t)).length;

    // 3. Same words in another order
    if (wInL === wc.length && lInW === lc.length) return viaCommonName ? 0.92 : 0.9;
    // Everything written is in the library name ("shea butter" in "Butyrospermum Parkii (Shea) Butter"), with some extra
    if (wInL === wc.length) {
        const extra = lc.length - wc.length;
        const base = viaCommonName ? 0.88 : 0.84;
        // A single generic word ("oil") is not enough to claim a match
        if (wc.every(t => GENERIC.has(t))) return 0;
        return Math.max(base - 0.03 * extra, 0.62);
    }
    // The library name is entirely inside what was written ("Cetearyl Alcohol NF Grade" -> cetearyl alcohol)
    if (lInW === lc.length && !lc.every(t => GENERIC.has(t))) {
        const extra = wc.length - lc.length;
        return Math.max(0.8 - 0.04 * extra, 0.6);
    }

    // 4. A spelling mistake in a short name
    const a = key(wc);
    const b = key(lc);
    if (a.length >= 5 && Math.abs(a.length - b.length) <= 2) {
        const d = editDistance(a, b);
        const limit = a.length >= 9 ? 2 : 1;
        if (d <= limit) return 0.78 - 0.04 * (d - 1);
    }

    // Partly overlapping words: weak, only worth showing as an alternative
    const shared = wc.filter(t => lSet.has(t) && !GENERIC.has(t)).length;
    if (shared > 0) return Math.min(0.55, 0.3 + 0.25 * (shared / Math.max(wc.length, lc.length)));
    return 0;
}

const confidenceOf = (score: number): Confidence => (score >= 0.95 ? 'exact' : score >= 0.78 ? 'likely' : 'possible');

export interface MatchOptions {
    /** Library ids the person owns: preferred between equally good grades. */
    stashIds?: Set<string>;
    /** Below this, a row is not offered at all. */
    minScore?: number;
    maxCandidates?: number;
}

/** The names a written ingredient could go by: as written, other names on the line, and everyday-name expansions. */
export function nameForms(name: string, alternates: string[] = []): { text: string; common: boolean }[] {
    const forms: { text: string; common: boolean }[] = [];
    const seen = new Set<string>();
    const add = (text: string, common: boolean) => {
        const k = key(nameTokens(text));
        if (!k || seen.has(k)) return;
        seen.add(k);
        forms.push({ text, common });
    };
    for (const written of [name, ...alternates]) {
        add(written, false);
        const lookup = key(nameTokens(written).filter(t => t !== 'pure'));
        for (const expansion of COMMON_NAMES[lookup] ?? []) add(expansion, true);
        // "Sweet Almond Oil (cold pressed)" -> try without descriptors too
        const without = key(core(nameTokens(written)));
        if (without !== lookup) for (const expansion of COMMON_NAMES[without] ?? []) add(expansion, true);
    }
    return forms;
}

/** Library rows that could be what was written, best first. */
export function findMatches<R extends MatchableRow>(
    name: string,
    alternates: string[],
    rows: R[],
    options: MatchOptions = {},
): MatchCandidate<R>[] {
    const { stashIds = new Set<string>(), minScore = 0.5, maxCandidates = 6 } = options;
    const forms = nameForms(name, alternates);

    const scored = rows.map(row => {
        let best = 0;
        let bestForm = 0;   // which of the names tried fitted best: the one written first wins a tie
        forms.forEach((form, f) => {
            for (const field of [row.inci_name, row.trade_name]) {
                const score = nameScore(form.text, field, form.common);
                if (score > best) { best = score; bestForm = f; }
            }
        });
        return { row, score: best, bestForm };
    }).filter(c => c.score >= minScore);

    // A pure ingredient beats a blend containing it; owned beats not owned; a plain grade beats a bracketed variant
    const blend = (r: MatchableRow) => /\(\s*and\s*\)|,/i.test(r.inci_name);
    scored.sort((a, b) =>
        b.score - a.score
        || a.bestForm - b.bestForm
        || Number(stashIds.has(b.row.id)) - Number(stashIds.has(a.row.id))
        || Number(blend(a.row)) - Number(blend(b.row))
        || Number(/\[/.test(a.row.inci_name)) - Number(/\[/.test(b.row.inci_name))
        || (a.row.trade_name ?? a.row.inci_name).length - (b.row.trade_name ?? b.row.inci_name).length);

    return scored.slice(0, maxCandidates).map(({ row, score }) => ({ row, score, confidence: confidenceOf(score) }));
}

/**
 * Words to search the library for, to fetch the rows `findMatches` should look at. Only the most telling word of each
 * name is used ("hyaluronate" for Sodium Hyaluronate): a common word such as "sodium" would match half the library.
 */
export function searchTerms(name: string, alternates: string[] = []): string[] {
    const terms = new Set<string>();
    for (const form of nameForms(name, alternates)) {
        const tokens = core(nameTokens(form.text));
        const pool = tokens.filter(t => !GENERIC.has(t));
        const longest = [...(pool.length ? pool : tokens)].sort((a, b) => b.length - a.length)[0];
        if (!longest || longest.length < 3) continue;
        terms.add(longest);
        // The start of a long word also finds a misspelling of its end ("glycerine" finds Glycerin)
        if (longest.length >= 6) terms.add(longest.slice(0, longest.length - 2));
    }
    return [...terms];
}
