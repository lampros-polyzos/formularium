// Starter templates: a pre-filled, auto-balanced base for the most common beginner products.
//
// A template names the ingredients it needs by what they are (INCI names or brand names), in order of
// preference, not by database id. They are matched against the user's library when the template is used, so it
// still works when the library changes, and prefers the option the user already has in their stash.

import { balanceFormula, inferKind, startingPercentage, type BalanceIngredient, type BalanceProfile, type BalanceResult } from './autoBalance';
import { determinePhase } from './phases';
import type { CatalogFilter } from './catalogFilter';

export interface TemplateLine {
    /** What it does, in plain words, e.g. "Emulsifier". Shown if the ingredient can't be found. */
    label: string;
    /** Acceptable ingredients, best first: INCI names or brand names. */
    options: string[];
    /** Relative share among oils and butters (only their proportions matter); the balancer decides the rest. */
    share?: number;
    /** Forces a phase, e.g. the preservative goes in the cool-down (C). Otherwise it follows from the ingredient. */
    phase?: 'A' | 'B' | 'C';
    /** Left out silently when nothing matches, instead of being reported as missing. */
    optional?: boolean;
}

export type TemplateId = 'light-lotion' | 'toner' | 'body-butter' | 'shampoo';

export interface StarterTemplate {
    id: TemplateId;
    name: string;
    tagline: string;
    level: 'Easiest' | 'Easy' | 'A bit more involved';
    profileId: string;
    projectName: string;
    targetWeightG: number;
    /** A plain-language list of what goes in, for the card. */
    includes: string[];
    /** What to do once it is on screen. */
    nextSteps: string[];
    lines: TemplateLine[];
}

const PRESERVATIVE = ['Phenoxyethanol (and) Ethylhexylglycerin', 'Euxyl PE 9010', 'Benzyl Alcohol (and) Salicylic Acid (and) Sorbic Acid', 'Geogard ECT'];
const CHELATOR = ['Disodium EDTA', 'Sodium Phytate'];
const LIQUID_OIL = ['Simmondsia Chinensis Seed Oil', 'Prunus Amygdalus Dulcis Oil', 'Helianthus Annuus Seed Oil'];

export const STARTER_TEMPLATES: StarterTemplate[] = [
    {
        id: 'light-lotion',
        name: 'Light lotion',
        tagline: 'An everyday moisturiser that sinks in quickly.',
        level: 'Easy',
        profileId: 'ow_lotion',
        projectName: 'My light lotion',
        targetWeightG: 100,
        includes: ['Water', 'Glycerin', 'Emulsifier', 'Fatty alcohol', 'Two light oils', 'Vitamin E', 'Preservative'],
        nextSteps: ['Heat phases A and B to about 70 °C, combine, then cool', 'Stir in phase C (preservative, vitamin E) below 45 °C', 'Check the pH is about 5.5 once it has cooled'],
        lines: [
            { label: 'Water', options: ['Aqua'] },
            { label: 'Humectant', options: ['Glycerin', 'Propanediol'] },
            { label: 'Soothing active', options: ['Panthenol'], optional: true },
            { label: 'Emulsifier', options: ['Olivem 1000', 'Cetearyl Olivate (and) Sorbitan Olivate', 'Montanov 68', 'Cetearyl Alcohol (and) Cetearyl Glucoside'] },
            { label: 'Fatty alcohol', options: ['Cetyl Alcohol', 'Cetearyl Alcohol'] },
            { label: 'Carrier oil', options: LIQUID_OIL, share: 10 },
            { label: 'Light emollient', options: ['Caprylic/Capric Triglyceride', 'Squalane'], share: 8, optional: true },
            { label: 'Antioxidant', options: ['Tocopherol'] },
            { label: 'Chelator', options: CHELATOR, optional: true },
            { label: 'Preservative', options: PRESERVATIVE, phase: 'C' },
        ],
    },
    {
        id: 'toner',
        name: 'Hydrating toner',
        tagline: 'A simple water-based splash for after cleansing.',
        level: 'Easiest',
        profileId: 'toner_mist',
        projectName: 'My hydrating toner',
        targetWeightG: 100,
        includes: ['Water', 'Humectant', 'Panthenol', 'Hyaluronic acid', 'Preservative'],
        nextSteps: ['Aim for a pH of about 5, a little acidic like skin', 'Use distilled water and clean, sanitised bottles', 'A pump or spray bottle keeps wet fingers out'],
        lines: [
            { label: 'Water', options: ['Aqua'] },
            { label: 'Humectant', options: ['Propanediol', 'Glycerin'] },
            { label: 'Soothing active', options: ['Panthenol'] },
            { label: 'Hydrating active', options: ['Sodium Hyaluronate'], optional: true },
            { label: 'Chelator', options: CHELATOR, optional: true },
            { label: 'Preservative', options: PRESERVATIVE, phase: 'C' },
        ],
    },
    {
        id: 'body-butter',
        name: 'Body butter',
        tagline: 'A rich, water-free butter. No preservative needed.',
        level: 'Easiest',
        profileId: 'body_butter',
        projectName: 'My body butter',
        targetWeightG: 100,
        includes: ['Shea butter', 'Cocoa butter', 'A carrier oil', 'Vitamin E'],
        nextSteps: ['Melt the butters gently, then cool until it starts to set', 'Whip it for a lighter texture', 'Keep water out of the jar: it has no preservative'],
        lines: [
            { label: 'Butter', options: ['Butyrospermum Parkii Butter'], share: 55 },
            { label: 'Second butter', options: ['Theobroma Cacao Seed Butter', 'Theobroma Cacao Butter', 'Mangifera Indica Seed Butter'], share: 15, optional: true },
            { label: 'Carrier oil', options: LIQUID_OIL, share: 30 },
            { label: 'Antioxidant', options: ['Tocopherol'] },
        ],
    },
    {
        id: 'shampoo',
        name: 'Gentle shampoo',
        tagline: 'A mild, sulfate-free cleanser for hair and scalp.',
        level: 'A bit more involved',
        profileId: 'shampoo',
        projectName: 'My gentle shampoo',
        targetWeightG: 100,
        includes: ['Water', 'Two gentle cleansers', 'Betaine for foam', 'Salt to thicken', 'Glycerin', 'Preservative'],
        nextSteps: ['Adjust the pH to about 5.5 with citric acid, drop by drop', 'Add the salt slowly: too much makes it thinner again', 'Expect a lighter foam than a supermarket shampoo'],
        lines: [
            { label: 'Water', options: ['Aqua'] },
            { label: 'Main cleanser', options: ['Sodium Lauroyl Methyl Isethionate', 'Sodium Cocoyl Isethionate'] },
            { label: 'Gentle cleanser', options: ['Coco-Glucoside', 'Decyl Glucoside', 'Lauryl Glucoside'], optional: true },
            { label: 'Foam booster', options: ['Cocamidopropyl Betaine'] },
            { label: 'Humectant', options: ['Glycerin', 'Panthenol'], optional: true },
            { label: 'Thickener', options: ['Sodium Chloride'], optional: true },
            { label: 'Chelator', options: CHELATOR, optional: true },
            { label: 'Preservative', options: PRESERVATIVE, phase: 'C' },
        ],
    },
];

export const getTemplate = (id: string | null | undefined): StarterTemplate | undefined =>
    STARTER_TEMPLATES.find(t => t.id === id);

// ---------- Finding the ingredients in the library ----------

/** "Cetearyl Olivate, Sorbitan Olivate" and "Cetearyl Olivate (and) Sorbitan Olivate" are the same ingredient. */
export const normalizeName = (name: string | null | undefined): string =>
    (name ?? '').toLowerCase().replace(/\[[^\]]*\]|\([^)]*\)/g, ' ').replace(/[,&/]/g, ' ').replace(/\s+/g, ' ').trim();

/** What to search the database for: the name up to the first "(and)" or comma. */
const searchKey = (option: string) => option.split(/\s*[(,]/)[0].trim();

/** The library rows that could be any ingredient of a template: names starting like one of its options. */
export function templateFilters(template: StarterTemplate): CatalogFilter[] {
    const keys = [...new Set(template.lines.flatMap(line => line.options.map(searchKey)))];
    return keys.flatMap<CatalogFilter>(key => [
        { column: 'inci_name', op: 'ilike', value: `${key}%` },
        { column: 'trade_name', op: 'ilike', value: `${key}%` },
    ]);
}

export interface TemplateRow {
    id: string;
    inci_name: string;
    trade_name: string;
    function: string | null;
    min_usage_pct: number | null;
    max_usage_pct: number | null;
}

const matches = (row: TemplateRow, option: string) => {
    const wanted = normalizeName(option);
    return normalizeName(row.inci_name) === wanted || normalizeName(row.trade_name) === wanted;
};

/** Among several grades of the same ingredient: the one the user owns, then the plain one, then alphabetical. */
function bestGrade<R extends TemplateRow>(rows: R[], stashIds: Set<string>): R {
    return [...rows].sort((a, b) =>
        Number(stashIds.has(b.id)) - Number(stashIds.has(a.id))
        || Number(/\[/.test(a.inci_name)) - Number(/\[/.test(b.inci_name))
        || (a.trade_name ?? '').localeCompare(b.trade_name ?? ''))[0];
}

export interface ResolvedLine<R extends TemplateRow> { line: TemplateLine; row: R }

/** Picks one ingredient per line: the first option the user owns, else simply the first option that exists. */
export function resolveTemplate<R extends TemplateRow>(template: StarterTemplate, rows: R[], stashIds: Set<string> = new Set()) {
    const resolved: ResolvedLine<R>[] = [];
    const missing: string[] = [];
    const used = new Set<string>();

    for (const line of template.lines) {
        const found = line.options
            .map(option => rows.filter(row => matches(row, option) && !used.has(row.id)))
            .filter(candidates => candidates.length > 0);
        const owned = found.find(candidates => candidates.some(row => stashIds.has(row.id)));
        const candidates = owned ?? found[0];
        if (!candidates) {
            if (!line.optional) missing.push(line.label);
            continue;
        }
        const row = bestGrade(candidates, stashIds);
        used.add(row.id);
        resolved.push({ line, row });
    }
    return { resolved, missing };
}

// ---------- Building the starting formula ----------

export type StarterIngredient<R extends TemplateRow> = R & { phase: 'A' | 'B' | 'C'; percentage: number; isQS: boolean };

export interface StarterFormula<R extends TemplateRow> {
    ingredients: StarterIngredient<R>[];
    balance: BalanceResult;
    /** Required ingredients that are not in the library. */
    missing: string[];
}

/** The template's ingredients with their phases, balanced to 100%. */
export function buildStarterFormula<R extends TemplateRow & Omit<BalanceIngredient, 'percentage'>>(
    template: StarterTemplate,
    rows: R[],
    profile: BalanceProfile | null,
    stashIds: Set<string> = new Set(),
): StarterFormula<R> {
    const { resolved, missing } = resolveTemplate(template, rows, stashIds);
    const kind = inferKind(resolved.map(({ row }) => ({ ...row, percentage: 0 })), profile);

    // Oils and butters keep the proportions the template gives them; everything else is the balancer's decision
    const start = resolved.map(({ line, row }) => ({ ...row, percentage: line.share || startingPercentage({ ...row, percentage: 0 }, kind) }));
    const balance = balanceFormula(start, profile);

    const ingredients = start.map((row, i) => ({
        ...row,
        phase: resolved[i].line.phase ?? determinePhase(row),
        percentage: balance.lines[i].after,
        isQS: balance.fillerIndex === i,
    })) as unknown as StarterIngredient<R>[];
    return { ingredients, balance, missing };
}
