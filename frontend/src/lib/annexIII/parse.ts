// Reads the European Commission's CosIng export of Annex III of the Cosmetics Regulation (substances cosmetic products may
// contain only within limits) into a small list of entries the app can check formulas against. Pure: it is given the text.
//
// The export is awkward: cells hold several lines, the limit is free text ("(a) 3.0% (b) 2.0% (c) 0.5%") that lines up with
// a product-type column ("(a) Rinse-off hair products (b) Other products ..."), and some characters are damaged. So it is
// careful: a numeric limit is read only when every number in the text is accounted for. Anything less certain stays as a
// plain note for the person to read, never as a number the app could get wrong.

export interface AnnexScope {
    /** Which products the limit is for, in plain words: "rinse-off hair products". */
    label: string;
    /** Highest allowed share of the finished product, in percent. */
    max: number;
}

export interface AnnexEntry {
    /** Unique within the file (a reference number can appear on more than one row). */
    id: string;
    /** The reference number in Annex III. */
    ref: string;
    title: string;
    /** Lower-case INCI names the limit is written for. */
    names: string[];
    /** Other names covered by the entry (salts, extracts): only used for notes, not for numeric limits. */
    alsoCovers: string[];
    cas: string[];
    /** Clear numeric limits, for products a home formulator could make. Empty when the limit is not a plain number. */
    scopes: AnnexScope[];
    /** The ingredient must be named on the label above these shares (percent), for leave-on and for rinse-off products. */
    declare?: { leaveOn: number; rinseOff: number };
    /** The conditions of use in the regulation's own words (cleaned, shortened), for the person to read. */
    note: string;
}

export interface AnnexData {
    /** The "Last update" date the export states, as written (dd/mm/yyyy). */
    updated: string;
    entries: AnnexEntry[];
}

// ---------- Reading the file ----------

/** Comma-separated values with quoted cells that may contain commas, quotes ("") and line breaks. */
export function parseCsv(text: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = '';
    let quoted = false;
    const source = text.replace(/^\uFEFF/, '');
    for (let i = 0; i < source.length; i++) {
        const ch = source[i];
        if (quoted) {
            if (ch === '"' && source[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch;
        } else if (ch === '"') quoted = true;
        else if (ch === ',') { row.push(cell); cell = ''; } else if (ch === '\n' || ch === '\r') {
            if (ch === '\r' && source[i + 1] === '\n') i++;
            row.push(cell);
            rows.push(row);
            row = [];
            cell = '';
        } else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows;
}

/**
 * The export has lost some characters (they arrive as U+FFFD): bullets and quotation marks. A lone one between spaces was a
 * bullet, one touching a word was a quotation mark. Line breaks and runs of spaces become single spaces.
 */
export function cleanText(text: string): string {
    let out = '';
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch !== '�') { out += ch; continue; }
        const before = text[i - 1] === undefined || /\s/.test(text[i - 1]);
        const after = text[i + 1] === undefined || /\s/.test(text[i + 1]);
        out += before && after ? '•' : before || after ? '"' : "'";
    }
    // Footnote markers such as "(15 )" or "(1)" after names and sentences
    return out.replace(/\(\s*\d{1,3}\s*\)/g, ' ').replace(/\s+/g, ' ').trim();
}

const EMPTY = new Set(['', '-', '–', 'n/a', 'none']);
const isEmpty = (text: string) => EMPTY.has(text.trim().toLowerCase());

/** An INCI-style name for comparing: lower case, without brackets or stray punctuation. */
export function normaliseName(name: string): string {
    return name.toLowerCase().replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').replace(/^[\s.,;:]+|[\s.,;:]+$/g, '');
}

function splitNames(text: string, separators: RegExp): string[] {
    const names = text.split(separators).map(normaliseName).filter(n => n.length >= 3 && !isEmpty(n));
    return [...new Set(names)];
}

/** CAS registry numbers in a cell, whatever the separators and stray spaces ("100209- 50-5"). */
export function parseCas(text: string): string[] {
    const joined = text.replace(/(\d)\s*-\s*(\d)/g, '$1-$2');
    return [...new Set(joined.match(/\b\d{2,7}-\d{2}-\d\b/g) ?? [])];
}

// ---------- Numeric limits ----------

/** Uses of a substance that have nothing to do with skin care at home: dentistry, nails, hair dyes, straighteners, depilatories. */
const OTHER_USES = /\b(oral|toothpaste|mouth|dental|nail|artificial|hair dye|hair[- ]colou?r|oxidative|colou?ring|eyelash|eyebrow|straighten|waving|permanent wave|depilator|denaturant|rust|inhibitor|stabili[sz]er for)/i;

const NUMBER = String.raw`\d+(?:[.,]\d+)?`;
const num = (s: string) => parseFloat(s.replace(',', '.'));

/** Splits "(a) Face cream (b) Body lotion" into { a: "Face cream", b: "Body lotion" }. Null when there are no lettered parts. */
function lettered(text: string): Record<string, string> | null {
    const marks = [...text.matchAll(/(?:^|\s)\(?([a-z])\)\s*/g)];
    if (!marks.length) return null;
    const parts: Record<string, string> = {};
    marks.forEach((m, i) => {
        const start = (m.index ?? 0) + m[0].length;
        const end = i + 1 < marks.length ? (marks[i + 1].index ?? text.length) : text.length;
        parts[m[1]] = text.slice(start, end).trim();
    });
    return parts;
}

/** A product type in words, not a stray bracket or conjunction left over from a badly lined-up cell. */
const isLabel = (label: string) => /[a-z]{4}/i.test(label);

function shorten(text: string, max = 80): string {
    let label = text.replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, '');
    if (/^[A-Z][a-z]/.test(label)) label = label[0].toLowerCase() + label.slice(1);
    if (label.length <= max) return label;
    const cut = label.slice(0, max);
    return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 20))}…`;
}

/**
 * The numeric limits in "Maximum concentration", matched to the product types they are for. Null unless it is certain:
 * every number accounted for as "N%", each lettered limit with its own product type, and no "as zinc" / "calculated as"
 * style conditions (those change what the percentage is a percentage of).
 */
export function parseScopes(concentration: string, products: string): AnnexScope[] | null {
    const text = concentration;
    if (!text) return null;
    if (/\b(as|calculated|equivalent|after mixing|present or released|per|ppm|mg)\b|\bRE\b/i.test(text)) return null;

    const matches = [...text.matchAll(new RegExp(String.raw`(${NUMBER})\s*%`, 'g'))];
    if (!matches.length) return null;
    // Anything numeric left over once the percentages and the (a)/(b) markers are taken out is something we do not understand
    const rest = text.replace(new RegExp(String.raw`${NUMBER}\s*%`, 'g'), ' ').replace(/\(?\b[a-z]\)/gi, ' ');
    if (/\d/.test(rest)) return null;

    // Each percentage belongs to the letter just before it, if there is one
    const found: { letter: string | null; max: number }[] = [];
    let previousEnd = 0;
    for (const m of matches) {
        const between = text.slice(previousEnd, m.index);
        const letters = [...between.matchAll(/\(?\b([a-z])\)/gi)];
        found.push({ letter: letters.length ? letters[letters.length - 1][1].toLowerCase() : null, max: num(m[1]) });
        previousEnd = (m.index ?? 0) + m[0].length;
    }
    if (found.some(f => !(f.max >= 0))) return null;

    const labels = lettered(products);
    if (found.length === 1 && !found[0].letter) {
        const label = labels ? shorten(Object.values(labels).join(' / ')) : shorten(products);
        if (label && !isLabel(label)) return null;
        return [{ label: label || 'all products', max: found[0].max }];
    }
    // Several limits: every one needs its letter, each letter once, and a product type to go with it
    const letters = found.map(f => f.letter);
    if (letters.some(l => l === null) || new Set(letters).size !== letters.length) return null;
    const scopes = found.map(f => ({ label: shorten(labels?.[f.letter!] ?? ''), max: f.max }));
    return scopes.every(s => isLabel(s.label)) ? scopes : null;
}

/** "The presence of the substance must be indicated ... when its concentration exceeds 0.001% in leave-on products, 0.01% in rinse-off". */
export function parseDeclaration(text: string): { leaveOn: number; rinseOff: number } | undefined {
    const m = text.match(new RegExp(String.raw`exceeds\W{0,6}(?:•\W*)?(${NUMBER})\s*%\s*in\s*leave-on[^\d]{0,40}(${NUMBER})\s*%\s*in\s*rinse-off`, 'i'));
    return m ? { leaveOn: num(m[1]), rinseOff: num(m[2]) } : undefined;
}

// ---------- Putting it together ----------

/** ALL-CAPS names from the export become Title Case; names already in mixed case are left as written. */
function displayName(text: string): string {
    const t = text.trim();
    if (!(t === t.toUpperCase() && /[A-Z]{3}/.test(t))) return t;
    return t.toLowerCase().replace(/(^|[ (/-])([a-z])/g, (_m, lead: string, letter: string) => lead + letter.toUpperCase());
}

/** The first real name in a cell of names, as written. */
const firstName = (cell: string) => cell.split(/\s*[;,]\s*|\s+\/\s+/).map(n => n.trim()).find(n => n.length >= 3 && !isEmpty(n)) ?? '';

export function buildAnnexData(csvText: string): AnnexData {
    const rows = parseCsv(csvText);
    const headerAt = rows.findIndex(r => r[0]?.trim() === 'Reference Number');
    if (headerAt < 0) throw new Error('This does not look like the CosIng Annex III export: no "Reference Number" column.');
    const header = rows[headerAt].map(h => h.trim());
    const col = (row: string[], name: string) => cleanText(row[header.indexOf(name)] ?? '');
    for (const needed of ['Name of Common Ingredients Glossary', 'CAS Number', 'Maximum concentration in ready for use preparation']) {
        if (!header.includes(needed)) throw new Error(`The CosIng export has no "${needed}" column.`);
    }
    const updated = rows.slice(0, headerAt).flat().map(c => c.match(/Last update:\s*([\d/]+)/i)?.[1]).find(Boolean) ?? '';

    const seen = new Map<string, number>();
    const entries: AnnexEntry[] = [];
    for (const row of rows.slice(headerAt + 1)) {
        if (!row.some(c => c.trim())) continue;
        const ref = col(row, 'Reference Number');
        if (!ref) continue;

        const glossary = col(row, 'Name of Common Ingredients Glossary');
        const chemical = col(row, 'Chemical name / INN');
        const glossaryNames = splitNames(glossary, /\s*;\s*|\s+\/\s+/);
        const identifiedText = col(row, 'Identified INGREDIENTS or substances e.g.');
        const identified = splitNames(identifiedText, /\s*[,;]\s*/);
        // Some entries have no common name of their own; the substances they identify are then the ones the limit is for
        const names = glossaryNames.length ? glossaryNames : identified;
        const alsoCovers = identified.filter(n => !names.includes(n));
        const products = col(row, 'Product Type, body parts');
        const concentration = col(row, 'Maximum concentration in ready for use preparation');
        const other = col(row, 'Other');
        const conditions = col(row, 'Wording of conditions of use and warnings');

        const parsed = parseScopes(concentration, products);
        const scopes = (parsed ?? []).filter(s => !OTHER_USES.test(s.label));
        const declare = parseDeclaration(`${other} ${conditions}`);
        // A text-only entry matters only if it could concern a skin-care product
        const otherUseOnly = (parsed !== null && scopes.length === 0) || (parsed === null && OTHER_USES.test(`${products} ${concentration}`));
        const note = shorten(`${other} ${conditions}`.trim() || (concentration && parsed === null ? `Limit: ${concentration}` : ''), 320).replace(/^./, c => c.toUpperCase());

        const useful = scopes.length > 0 || declare || (!otherUseOnly && note && !isEmpty(note));
        if (!useful || (names.length === 0 && alsoCovers.length === 0)) continue;

        const count = (seen.get(ref) ?? 0) + 1;
        seen.set(ref, count);
        entries.push({
            id: count === 1 ? ref : `${ref}#${count}`,
            ref,
            title: displayName(firstName(glossary) || firstName(identifiedText) || chemical),
            names,
            alsoCovers,
            cas: parseCas(col(row, 'CAS Number')),
            scopes: scopes.sort((a, b) => a.max - b.max),
            ...(declare ? { declare } : {}),
            note,
        });
    }
    return { updated, entries };
}
