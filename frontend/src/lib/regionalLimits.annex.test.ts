import { describe, expect, it } from 'vitest';
import { checkRegionalLimits } from './regionalLimits';
import { ANNEX_III } from './annexIII/entries.generated';

// How the official Annex III entries (from the CosIng export) are used on top of the hand-written EU limits.

const annex = (...lines: [string, number, string?][]) =>
    checkRegionalLimits('eu', lines.map(([inci_name, percentage, cas_number]) => ({ inci_name, percentage, cas_number })), ANNEX_III);
const by = (list: ReturnType<typeof annex>, substance: string) => list.find(w => w.substance === substance);

describe('the official Annex III entries', () => {
    it('adds ingredients the hand-written list does not cover', () => {
        const over = annex(['Cetrimonium Chloride', 3]);
        expect(by(over, 'Cetrimonium Chloride')).toMatchObject({ level: 'over' });
        expect(by(over, 'Cetrimonium Chloride')!.message).toContain('0.5% in leave-on face products');
        expect(by(annex(['Cetrimonium Chloride', 1.5]), 'Cetrimonium Chloride')).toMatchObject({ level: 'depends' });
        expect(by(annex(['Cetrimonium Chloride', 0.3]), 'Cetrimonium Chloride')).toBeUndefined();
    });

    it('keeps the list of products short when there are many', () => {
        const message = by(annex(['Methyl Salicylate', 0.5]), 'Methyl Salicylate')!.message;
        expect(message).toMatch(/and up to .* \(\d+ kinds of product in all\)/);
        expect(message.length).toBeLessThan(400);
    });

    it('finds an ingredient by CAS number when its name is written differently', () => {
        const climbazole = ANNEX_III.entries.find(e => e.names.includes('climbazole'))!;
        expect(annex(['My antidandruff active', 5])).toEqual([]);
        expect(by(annex(['My antidandruff active', 5, climbazole.cas[0]]), 'Climbazole')).toMatchObject({ level: 'over' });
    });

    it('lets the hand-written limit win, so the same ingredient is never reported twice', () => {
        const list = annex(['Salicylic Acid', 3.5], ['Kojic Acid', 4]);
        expect(list.filter(w => w.substance.toLowerCase() === 'salicylic acid')).toHaveLength(1);
        expect(list.find(w => w.id === 'salicylic-acid')).toBeDefined();
        expect(list.some(w => w.id.startsWith('annex3-') && /kojic|salicylic acid/i.test(w.substance))).toBe(false);
    });

    it('says an ingredient has to be named on the label once it is above the threshold, and stays quiet below it', () => {
        const linalool = by(annex(['Linalool', 0.5]), 'Linalool')!;
        expect(linalool.level).toBe('declare');
        expect(linalool.message).toContain('0.001% in leave-on products or 0.01% in rinse-off products');
        expect(linalool.message).toContain('fragrance or essential oil');
        expect(by(annex(['Linalool', 0.0005]), 'Linalool')).toBeUndefined();
    });

    it('counts the same ingredient on several lines together', () => {
        expect(by(annex(['Linalool', 0.0006], ['Linalool', 0.0006]), 'Linalool')?.level).toBe('declare');
    });

    it('checks a limit and a label threshold on the same ingredient (citral)', () => {
        expect(annex(['Citral', 0.3]).map(w => w.level)).toEqual(['depends', 'declare']);   // fine in some products (up to 1.2%), not in others
        expect(annex(['Citral', 2]).map(w => w.level)).toEqual(['over', 'declare']);
    });

    it('passes on conditions of use for ingredients with no number to check', () => {
        const note = annex(['Hydrolyzed Wheat Protein', 2]).find(w => w.level === 'note')!;
        expect(note.substance).toBe('Hydrolyzed Wheat Protein');
        expect(note.message).toContain('3,5 kDa');
    });

    it('only asks about a blend that could be over, and is not fooled by ingredients that merely contain the name', () => {
        expect(by(annex(['Cetrimonium Chloride (and) Aqua', 3]), 'Cetrimonium Chloride')).toMatchObject({ level: 'blend' });
        expect(annex(['Cetrimonium Chloride (and) Aqua', 0.3])).toEqual([]);
        expect(annex(['Hydroxypropyl Cetrimonium Chloride', 3])).toEqual([]);
    });

    it('puts what must be fixed before what is good to know', () => {
        expect(annex(['Hydrolyzed Wheat Protein', 2], ['Linalool', 0.5], ['Cetrimonium Chloride', 3]).map(w => w.level)).toEqual(['over', 'declare', 'note']);
    });

    it('does nothing when you are not selling in the EU', () => {
        expect(checkRegionalLimits('none', [{ inci_name: 'Cetrimonium Chloride', percentage: 9 }], ANNEX_III)).toEqual([]);
    });

    it('still checks the hand-written limits when the official entries have not loaded', () => {
        expect(checkRegionalLimits('eu', [{ inci_name: 'Cetrimonium Chloride', percentage: 9 }])).toEqual([]);
        expect(checkRegionalLimits('eu', [{ inci_name: 'Kojic Acid', percentage: 9 }])[0]).toMatchObject({ level: 'over' });
    });
});
