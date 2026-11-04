// Reads a recipe or an ingredient list pasted as plain text and says, for each line, what the ingredient is called and how much
// of it there is. It does not know the ingredient library: finding the ingredients is ingredientMatcher's job.
//
// It copes with the usual ways people write formulas:
//     Water 70%                 70% Water               Water - 70 %          Water ........ 70
//     Glycerin (5 g)            5 g glycerin            1. Cetyl alcohol 3g   • Panthenol 1%
//     Water q.s. to 100         Phenoxyethanol 0.8-1%   Aqua, Glycerin, Cetyl Alcohol (a plain INCI list, in any order)
//     Phase A: / Oil phase      (a heading: the lines under it get that phase)
// and ignores prose such as a title, a method or notes.

export type AmountUnit = '%' | 'g' | 'ml' | 'oz' | 'tsp' | 'tbsp' | 'drops' | 'parts' | 'number';

export interface Amount {
    value: number;
    unit: AmountUnit;
    /** Set when the text gave a range ("15% - 30%"): value is its middle. */
    range?: [number, number];
}

export interface ParsedLine {
    /** The line as it was pasted (trimmed), shown back to the person. */
    raw: string;
    /** The ingredient as written, without amounts, bullets and notes. */
    name: string;
    /** Other names for it found on the same line, e.g. the "Aqua" in "Water (Aqua)". */
    alternates: string[];
    /** Example ingredients listed for a general line: "Surfactant (e.g., SCI or Coco-Glucoside)" gives both. */
    examples: string[];
    /** Words that describe a general line, such as the "Anionic" in "Surfactant (Anionic)". */
    hint: string;
    amount: Amount | null;
    /** "q.s." / "to 100" / "balance": whatever is needed to reach 100%. */
    qs: boolean;
    /** From a heading above the line, if there was one. */
    phase?: 'A' | 'B' | 'C';
    optional: boolean;
}

export interface ParseResult {
    lines: ParsedLine[];
    /** Lines that were left out because they look like prose, so the person can see nothing was lost silently. */
    ignored: string[];
}

const UNIT_ALIASES: Record<string, AmountUnit> = {
    '%': '%', percent: '%', pct: '%',
    g: 'g', gr: 'g', gm: 'g', gram: 'g', grams: 'g', gramme: 'g', grammes: 'g',
    ml: 'ml', milliliter: 'ml', milliliters: 'ml', millilitre: 'ml', millilitres: 'ml',
    oz: 'oz', ounce: 'oz', ounces: 'oz',
    tsp: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp',
    tbsp: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp',
    drop: 'drops', drops: 'drops',
    part: 'parts', parts: 'parts',
};
const UNIT_WORDS = Object.keys(UNIT_ALIASES).filter(u => u !== '%').sort((a, b) => b.length - a.length).join('|');

const NUM = String.raw`\d+(?:[.,]\d+)?`;
const RANGE = String.raw`(${NUM})(?:(?:\s+to\s+|[-–—])(${NUM}))?`;
const UNIT = String.raw`(%|(?:${UNIT_WORDS})\b)`;

// A number that must come with a unit (or a %), anywhere in the text
const WITH_UNIT = new RegExp(String.raw`(?<![\w.])${RANGE}\s*${UNIT}`, 'i');
// A range with the unit on both ends: "15% - 30%", "5 g to 10 g". Spaces around the dash are fine here because of the units.
const UNIT_RANGE = new RegExp(String.raw`(?<![\w.])(${NUM})\s*${UNIT}\s*(?:[-–—]|\bto\b)\s*(${NUM})\s*${UNIT}`, 'i');
// A bare number: only trusted at the very end after a separator, or at the very start before one
const TRAILING_BARE = new RegExp(String.raw`(?:\s*[:=|\t]\s*|\s+[-–—]\s+|\s*\.{2,}\s*|\s{2,})${RANGE}\s*$`);
const LEADING_BARE = new RegExp(String.raw`^${RANGE}\s*(?:[:=|\t]\s*|\s[-–—]\s)`);

const QS_WORDS = /\bq\.?\s?s\b\.?|\bquantum satis\b|\bad\s*100\s*%?|\bto\s*100\s*%?|\bbalance\b|\bremainder\b|\brest\b|\bto make up\b|\btop up\b/i;

const num = (s: string) => parseFloat(s.replace(',', '.'));
const midpoint = (a: string, b?: string) => (b === undefined ? num(a) : (num(a) + num(b)) / 2);

function toAmount(match: RegExpMatchArray, unitText?: string): Amount | null {
    const value = midpoint(match[1], match[2]);
    if (!Number.isFinite(value) || value < 0) return null;
    const unit: AmountUnit = unitText ? (UNIT_ALIASES[unitText.toLowerCase()] ?? 'number') : 'number';
    const lo = num(match[1]);
    const hi = match[2] === undefined ? lo : num(match[2]);
    return lo === hi ? { value, unit } : { value, unit, range: [Math.min(lo, hi), Math.max(lo, hi)] };
}

/** Splits on commas and semicolons that are not inside brackets: "Cetearyl Alcohol (and) X, Glycerin" is two items. */
function splitTopLevel(text: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let current = '';
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === '(' || ch === '[') depth++;
        if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
        const decimalComma = ch === ',' && /\d/.test(current.slice(-1)) && /\d/.test(text[i + 1] ?? '');
        const beforeExamples = ch === ',' && /^\s*(?:e\.?\s?g\b|i\.e\b|such as|for example|for instance|including)/i.test(text.slice(i + 1));
        if ((ch === ',' || ch === ';') && depth === 0 && !decimalComma && !beforeExamples) { parts.push(current); current = ''; } else current += ch;
    }
    parts.push(current);
    return parts.map(p => p.trim()).filter(Boolean);
}

const PHASE_HEADINGS: [RegExp, 'A' | 'B' | 'C'][] = [
    [/^(?:phase|part|stage|group)\s*[:-]?\s*(?:a|1)\b/i, 'A'],
    [/^(?:phase|part|stage|group)\s*[:-]?\s*(?:b|2)\b/i, 'B'],
    [/^(?:phase|part|stage|group)\s*[:-]?\s*(?:c|3|d|4)\b/i, 'C'],
    [/^(?:water|aqueous|aq\.?)\s*(?:phase|part)\b/i, 'A'],
    [/^(?:oil|oily|lipid|fat)\s*(?:phase|part)\b/i, 'B'],
    [/^(?:cool[\s-]*down|cooldown|cold)\s*(?:phase|part)?\b/i, 'C'],
];
const SECTION_END = /^(?:method|instructions?|directions?|procedure|preparation|how to|steps?|notes?|usage|storage|tips?)\b\s*:?\s*$/i;
const OTHER_HEADING = /^(?:ingredients?|formula|recipe|contents|inci|components?)\s*:?\s*$/i;

function headingPhase(line: string): 'A' | 'B' | 'C' | undefined {
    const text = line.replace(/[:\-–—]+\s*$/, '').trim();
    if (!text || /\d\s*(%|g\b)/i.test(text) || text.length > 40) return undefined;
    // A heading is a short line that names a phase and does not read like an ingredient with an amount
    return PHASE_HEADINGS.find(([re]) => re.test(text))?.[1];
}

/** True for sentences: long, or ending like a sentence with the usual verbs, and no amount. */
function looksLikeProse(line: string, hasAmount: boolean): boolean {
    if (hasAmount) return false;
    const words = line.split(/\s+/);
    if (words.length >= 9) return true;
    return words.length >= 6 && /[.!?]$/.test(line) && /\b(the|and|then|until|add|mix|stir|heat|cool|should|will|your|you)\b/i.test(line);
}

/** Starts an example list: "e.g.", "such as", "for example", "like", "including". Group 1 is what came before, 2 the examples. */
const EXAMPLE_LEAD = /^(.*?)(?:\b(?:e\.?\s?g|i\.e|eg|ex)\b\.?|\b(?:such as|for example|for instance|like|including)\b)[\s:.,]*(.*)$/is;

/** Words that carry no ingredient: left over from notes such as "(Quantum Satis /, roughly)". */
const NOT_A_NAME = new Set(['roughly', 'approx', 'about', 'quantum', 'satis', 'see', 'note', 'notes', 'optional', 'etc', 'and', 'or', 'to']);
function usableName(text: string): boolean {
    const words = text.toLowerCase().split(/[^a-z]+/).filter(w => w.length >= 2);
    return words.some(w => !NOT_A_NAME.has(w));
}

/** "SCI or Coco-Glucoside", "Glycerin / Panthenol", "A, B, etc." -> separate ingredient names. Descriptions ("a broad-spectrum one") are dropped. */
function splitExamples(text: string): string[] {
    return text
        .split(/\s+or\s+|\s+\/\s+|\s*[,;]\s*|\s+and\/or\s+/i)
        .map(part => part.replace(/\b(?:etc|or similar|or similar products?|and others)\b\.?/gi, '').replace(/^[\s.:-]+|[\s.:-]+$/g, '').trim())
        .filter(part => part.length >= 2 && usableName(part) && !/^(?:a|an|any|some|other|similar|your|the)\b/i.test(part))
        .slice(0, 8);
}

function parseItem(rawItem: string, phase?: 'A' | 'B' | 'C'): ParsedLine | null {
    let text = rawItem.trim();
    if (!text) return null;

    // Bullets and numbering: "- ", "• ", "1. ", "2) "
    text = text.replace(/^(?:[-*•·▪◦►>]+|\d+\s*[.)](?=\s+[A-Za-z(]))\s*/, '').trim();

    let optional = false;
    text = text.replace(/\(\s*(?:optional|opt\.?)\s*\)|\boptional\b/gi, () => { optional = true; return ' '; });
    text = text.replace(/[~≈]|\b(?:approx\.?|approximately|about|circa)\b/gi, ' ');

    let qs = false;
    const qsMatch = text.match(QS_WORDS);
    if (qsMatch) {
        qs = true;
        text = text.replace(new RegExp(QS_WORDS.source, 'gi'), ' ');
    }

    // An amount with a unit, in brackets or in the open
    let amount: Amount | null = null;
    const unitRange = text.match(UNIT_RANGE);
    const bracketed = text.match(new RegExp(String.raw`[(\[]\s*${RANGE}\s*${UNIT}\s*[)\]]`, 'i'));
    if (unitRange) {
        amount = toAmount([unitRange[0], unitRange[1], unitRange[3]] as unknown as RegExpMatchArray, unitRange[4] || unitRange[2]);
        text = text.replace(unitRange[0], ' ');
    } else if (bracketed) {
        amount = toAmount(bracketed, bracketed[3]);
        text = text.replace(bracketed[0], ' ');
    } else {
        const withUnit = text.match(WITH_UNIT);
        if (withUnit) {
            amount = toAmount(withUnit, withUnit[3]);
            text = text.replace(withUnit[0], ' ');
        } else {
            const trailing = text.match(TRAILING_BARE);
            const leading = trailing ? null : text.match(LEADING_BARE);
            const bare = trailing ?? leading;
            if (bare) {
                amount = toAmount(bare);
                text = text.replace(bare[0], ' ');
            }
        }
    }

    // What is left over is the name. Brackets hold other names ("Water (Aqua)"), example ingredients
    // ("Surfactant (e.g., SCI or Coco-Glucoside)") or a description ("Surfactant (Anionic)").
    const alternates: string[] = [];
    const examples: string[] = [];
    let hint = '';
    text = text.replace(/\(([^()]*)\)/g, (_whole, inner: string) => {
        const t = inner.trim();
        if (/^(?:and|&|\+)$/i.test(t)) return ` ${t} `;           // INCI connector: "A (and) B"
        const lead = t.match(EXAMPLE_LEAD);
        if (lead) {
            hint = `${hint} ${lead[1]}`.trim();
            examples.push(...splitExamples(lead[2]));
            return ' ';
        }
        if (usableName(t) && !/\d/.test(t) && t.split(/\s+/).length <= 4) alternates.push(t.replace(/^[^A-Za-z]+|[^A-Za-z0-9)]+$/g, ''));
        return ' ';
    });
    text = text.replace(/[:=|]+/g, ' ').replace(/\.{2,}/g, ' ').replace(/^[\s\-–—.]+|[\s\-–—.]+$/g, '').replace(/\s{2,}/g, ' ').trim();
    text = text.replace(/\s+\b(?:of|for|in)\s*$/i, '').trim();
    // "Surfactant, e.g. SCI" written without brackets
    const looseLead = text.match(EXAMPLE_LEAD);
    if (looseLead && looseLead[1].trim()) {
        text = looseLead[1].replace(/[\s,:-]+$/, '').trim();
        examples.push(...splitExamples(looseLead[2]));
    }
    hint = hint.replace(/[\s,:-]+$/, '').replace(/^[\s,:-]+/, '').trim();

    if (!text && !alternates.length && !examples.length) return null;
    if (!text) text = (alternates.shift() ?? examples[0])!;
    if (!/[a-z]/i.test(text)) return null;
    // A fill-the-rest line has no amount of its own: a range such as "roughly 50-70%" was only a hint
    if (qs) amount = null;

    return { raw: rawItem.trim(), name: text, alternates, examples, hint, amount, qs, phase, optional };
}

export function parseRecipeText(input: string): ParseResult {
    const lines: ParsedLine[] = [];
    const ignored: string[] = [];
    let phase: 'A' | 'B' | 'C' | undefined;

    const text = input.replace(/\r/g, '').replace(/\u00a0/g, ' ').replace(/[％﹪]/g, '%');
    outer: for (const rawLine of text.split('\n')) {
        const line = rawLine.trim();
        if (!line) continue;
        if (SECTION_END.test(line)) break outer;           // everything after "Method:" is instructions, not ingredients
        if (OTHER_HEADING.test(line)) continue;

        const heading = headingPhase(line);
        if (heading) { phase = heading; continue; }

        // A list ("Aqua, Glycerin, Cetyl Alcohol") is one line of many items, so judge each item, not the whole line
        const items = splitTopLevel(line);
        if (items.length === 1 && looksLikeProse(line, WITH_UNIT.test(line) || TRAILING_BARE.test(line))) { ignored.push(line); continue; }
        for (const item of items) {
            if (looksLikeProse(item, WITH_UNIT.test(item) || TRAILING_BARE.test(item))) { ignored.push(item); continue; }
            const parsed = parseItem(item, phase);
            if (parsed) lines.push(parsed);
            else if (item.trim()) ignored.push(item.trim());
        }
    }
    return { lines, ignored };
}
