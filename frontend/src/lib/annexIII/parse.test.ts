import { describe, expect, it } from 'vitest';
import { buildAnnexData, cleanText, normaliseName, parseCas, parseCsv, parseDeclaration, parseScopes } from './parse';
import { ANNEX_III } from './entries.generated';
import { REGIONS } from '../regionalLimits';

const FFFD = String.fromCharCode(0xfffd);

describe('reading the export', () => {
    it('reads quoted cells with commas, doubled quotes and line breaks, and both kinds of line ending', () => {
        const rows = parseCsv('a,"b, c","d ""quoted""",e\r\n1,"two\nlines",3,4\n');
        expect(rows).toEqual([['a', 'b, c', 'd "quoted"', 'e'], ['1', 'two\nlines', '3', '4']]);
    });

    it('repairs the damaged bullets and quotation marks the export contains', () => {
        expect(cleanText(`exceeds: ${FFFD} 0,001 % in leave-on ${FFFD} 0,01 % in rinse-off`)).toBe('exceeds: • 0,001 % in leave-on • 0,01 % in rinse-off');
        expect(cleanText(`indicated as ${FFFD}Lemongrass Oil${FFFD} in the list`)).toBe('indicated as "Lemongrass Oil" in the list');
        expect(cleanText(`children${FFFD}s skin`)).toBe("children's skin");
    });

    it('drops footnote markers and tidies white space', () => {
        expect(cleanText('Cetrimonium chloride (1)')).toBe('Cetrimonium chloride');
        expect(cleanText('Peroxide value (15 )  less\nthan 10')).toBe('Peroxide value less than 10');
        expect(cleanText('(a) Hair (b) Skin')).toBe('(a) Hair (b) Skin');
    });

    it('compares names without capitals, brackets or stray punctuation, and finds CAS numbers however they are written', () => {
        expect(normaliseName(' SALICYLIC Acid [x]. ')).toBe('salicylic acid');
        expect(parseCas('11103-57-4/ 68-26-8; 127-47-9, 100209- 50-5')).toEqual(['11103-57-4', '68-26-8', '127-47-9', '100209-50-5']);
        expect(parseCas('-')).toEqual([]);
    });
});

describe('numeric limits', () => {
    it('reads a single limit', () => {
        expect(parseScopes('1 %', 'Face and hand products')).toEqual([{ label: 'face and hand products', max: 1 }]);
        expect(parseScopes('0,003%', '')).toEqual([{ label: 'all products', max: 0.003 }]);
    });

    it('lines up lettered limits with their product types', () => {
        expect(parseScopes('(a) 2 % (b) 0,5 %', '(a) Face cream (b) Body lotion')).toEqual([{ label: 'face cream', max: 2 }, { label: 'body lotion', max: 0.5 }]);
        expect(parseScopes('b) 0,02 %', '(a) Oral products (b) Other products')).toEqual([{ label: 'other products', max: 0.02 }]);
    });

    it('is not fooled by "as" conditions that change what the percentage is of', () => {
        for (const text of ['0,15 % calculated as F.', '6% (as NH3)', '(a) 1 % (as zinc) (b) 0,1 % (as zinc)', '0,05 % Retinol Equivalent (RE)', '12 % of H2O2 present or released']) {
            expect(parseScopes(text, 'Oral products'), text).toBeNull();
        }
    });

    it('gives up rather than guess when a number is not accounted for', () => {
        expect(parseScopes('(a) 5% (b) 2% (General use) and 4.5% (Professional use) Entry 15d: 1,5%', '(a) x (b) y (c) z')).toBeNull();
        expect(parseScopes('(a) 1. 2% (6) 2. 4.5% (6)', '(a) Hair (b) Other')).toBeNull();
        expect(parseScopes('(b) As from 3 September 2017: 1,5 %', '(a) Dye (b) Hair')).toBeNull();
    });

    it('gives up when several limits do not each have a letter and a product type', () => {
        expect(parseScopes('(a) 5% 3%', '(a) Toothpaste (b) Other')).toBeNull();
        expect(parseScopes('(a) 8% (b) 5%', '(a) Hair products')).toBeNull();
        expect(parseScopes('(a) 0.5% (b) 0.4%', '(a) ) (b) and')).toBeNull();
    });

    it('shortens a very long product list instead of cutting it mid-word', () => {
        const [scope] = parseScopes('2%', 'Other products except body lotion, eye shadow, mascara, eyeliner, lipstick, roll-on deodorant and many more products')!;
        expect(scope.label.length).toBeLessThanOrEqual(81);
        expect(scope.label.endsWith('…')).toBe(true);
        expect(scope.label).not.toMatch(/\s…$/);
    });
});

describe('label thresholds', () => {
    it('reads the amounts above which an ingredient must be named on the label', () => {
        expect(parseDeclaration('The presence of the substance must be indicated in the list of ingredients when its concentration exceeds: - 0.001% in leave-on products - 0.01% in rinse-off products'))
            .toEqual({ leaveOn: 0.001, rinseOff: 0.01 });
        expect(parseDeclaration('when the concentration of the substance exceeds: • 0,001 % in leave-on products • 0,01 % in rinse-off products')).toEqual({ leaveOn: 0.001, rinseOff: 0.01 });
        expect(parseDeclaration('Avoid contact with eyes')).toBeUndefined();
    });
});

const HEADER = '"Reference Number","Chemical name / INN","Name of Common Ingredients Glossary","CAS Number","EC Number","Product Type, body parts","Maximum concentration in ready for use preparation",Other,"Wording of conditions of use and warnings",Regulation,"Other Directives/Regulations","SCCS opinions","Chemical/IUPAC Name","Identified INGREDIENTS or substances e.g.",CMR,"Update Date"';
const csv = (...rows: string[]) => `"File creation date: 04/11/2026"\n"ANNEX III","Last update: 13/10/2026"\n"LIST"\n"Substance identification",Restrictions\n${HEADER}\n${rows.join('\n')}\n`;
const row = (f: { ref: string; chem?: string; name?: string; cas?: string; products?: string; max?: string; other?: string; conditions?: string; identified?: string }) =>
    [f.ref, f.chem ?? '', f.name ?? '', f.cas ?? '', '', f.products ?? '', f.max ?? '', f.other ?? '', f.conditions ?? '', '', '', '', '', f.identified ?? '', '', ''].map(c => `"${c.replace(/"/g, '""')}"`).join(',');

describe('building the entries', () => {
  it('keeps entries with a clear limit, a label threshold or conditions worth reading, and says when the file was updated', () => {
        const data = buildAnnexData(csv(
            row({ ref: '1', name: 'KOJIC ACID', cas: '501-30-4', products: 'Face and hand products', max: '1 %', other: 'Not to be used in some products.' }),
            row({ ref: '2', name: 'Linalool', other: 'must be indicated when its concentration exceeds: 0.001% in leave-on products 0.01% in rinse-off products' }),
            row({ ref: '3', name: 'Hydrolyzed wheat protein', other: 'Maximum molecular weight 3,5 kDa' }),
        ));
        expect(data.updated).toBe('13/10/2026');
        expect(data.entries.map(e => [e.ref, e.title, e.scopes.length, !!e.declare])).toEqual([['1', 'Kojic Acid', 1, false], ['2', 'Linalool', 0, true], ['3', 'Hydrolyzed wheat protein', 0, false]]);
        expect(data.entries[0]).toMatchObject({ names: ['kojic acid'], cas: ['501-30-4'], scopes: [{ label: 'face and hand products', max: 1 }] });
    });

    it('leaves out substances that only matter for other uses (oral care, nails, hair dye, depilatories)', () => {
        const data = buildAnnexData(csv(
            row({ ref: '1', name: 'Sodium fluoride', products: 'Oral products', max: '0,15 % calculated as F.' }),
            row({ ref: '2', name: 'Some dye', products: '(a) Hair dye substance in oxidative hair dye products', max: '2 %', other: 'Hair dye warnings' }),
            row({ ref: '3', name: 'Hydroquinone', products: 'Artificial nail systems', max: '0.02%' }),
        ));
        expect(data.entries).toEqual([]);
    });

    it('keeps only the limits for products that could be made at home when an entry has several', () => {
        const data = buildAnnexData(csv(row({ ref: '1', name: 'Quinine thing', products: '(a) Toothpaste (b) Face cream', max: '(a) 5% (b) 0,5%' })));
        expect(data.entries[0].scopes).toEqual([{ label: 'face cream', max: 0.5 }]);
    });

    it('gives a row with no common name the substances it identifies', () => {
        const data = buildAnnexData(csv(row({ ref: '60', chem: 'Fatty acid amides', name: '-', max: '0,5 %', identified: 'ALMONDAMIDE DEA, AVOCADAMIDE DEA' })));
        expect(data.entries[0]).toMatchObject({ title: 'Almondamide Dea', names: ['almondamide dea', 'avocadamide dea'], scopes: [{ max: 0.5 }] });
    });

    it('keeps rows that share a reference number apart', () => {
        const data = buildAnnexData(csv(row({ ref: '16', name: 'Thing one', max: '1%' }), row({ ref: '16', name: 'Thing two', max: '2%' })));
        expect(data.entries.map(e => e.id)).toEqual(['16', '16#2']);
    });

    it('refuses a file that is not the export', () => {
        expect(() => buildAnnexData('a,b\n1,2\n')).toThrow(/Reference Number/);
        expect(() => buildAnnexData('"Reference Number","Other"\n1,2\n')).toThrow(/no "Name of Common Ingredients Glossary" column/);
    });
});

describe('the real export', () => {
    const csvFile = Object.values(import.meta.glob('../../../data/cosing/COSING_Annex_III_v2.csv', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[0];
    const built = buildAnnexData(csvFile);
    const entry = (name: string) => ANNEX_III.entries.find(e => e.names.includes(name))!;

    it('is what the app uses: the generated file is up to date (run `npm run build:annex3` if this fails)', () => {
        expect(ANNEX_III).toEqual(JSON.parse(JSON.stringify(built)));
    });

    it('produces a useful number of entries, with the date it was exported', () => {
        expect(built.updated).toMatch(/^\d\d\/\d\d\/\d{4}$/);
        expect(built.entries.length).toBeGreaterThan(100);
        expect(built.entries.filter(e => e.scopes.length).length).toBeGreaterThan(40);
        expect(built.entries.filter(e => e.declare).length).toBeGreaterThan(50);
    });

    it('has clean, well-formed entries', () => {
        for (const e of built.entries) {
            expect(e.title, e.id).toMatch(/[A-Za-z]{3}/);
            expect(e.names.length + e.alsoCovers.length, e.id).toBeGreaterThan(0);
            expect(JSON.stringify(e), e.id).not.toContain(FFFD);
            for (const s of e.scopes) {
                expect(s.max, `${e.id} ${s.label}`).toBeGreaterThan(0);
                expect(s.label, `${e.id}`).toMatch(/[a-z]{4}/i);
            }
            expect(e.scopes.map(s => s.max), e.id).toEqual([...e.scopes.map(s => s.max)].sort((a, b) => a - b));
            expect(e.note.length, e.id).toBeLessThanOrEqual(325);
        }
    });

    it('reads the well-known limits correctly', () => {
        expect(entry('kojic acid').scopes).toEqual([{ label: 'face and hand products', max: 1 }]);
        expect(entry('alpha-arbutin').scopes.map(s => [s.label, s.max])).toEqual([['body lotion', 0.5], ['face cream', 2]]);
        expect(entry('salicylic acid').scopes.map(s => s.max)).toEqual([0.5, 2, 3]);
        expect(entry('linalool').declare).toEqual({ leaveOn: 0.001, rinseOff: 0.01 });
        expect(entry('cetrimonium chloride').scopes.map(s => s.max)).toEqual([0.5, 1, 2.5]);
    });

    it('does not turn limits stated "as" something else into plain percentages', () => {
        const fluorides = built.entries.filter(e => /fluoride/i.test(e.title));
        expect(fluorides).toEqual([]);   // oral-care only: left out
        expect(built.entries.find(e => /ammonia/i.test(e.title))?.scopes).toEqual([]);
    });

    it('agrees with the hand-written EU limits wherever they overlap (so neither drifts)', () => {
        const annex = REGIONS.eu.limits.filter(l => ['salicylic-acid', 'alpha-arbutin', 'arbutin', 'kojic-acid'].includes(l.id));
        expect(annex).toHaveLength(4);
        for (const limit of annex) {
            const official = ANNEX_III.entries.find(e => e.names.some(n => limit.names.includes(n)));
            expect(official, limit.id).toBeDefined();
            const officialMaxes = new Set(official!.scopes.map(s => s.max));
            for (const scope of limit.scopes) expect(officialMaxes.has(scope.max), `${limit.id}: ${scope.label} ${scope.max}%`).toBe(true);
        }
    });
});
