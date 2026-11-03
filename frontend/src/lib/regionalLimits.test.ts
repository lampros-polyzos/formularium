import { describe, expect, it } from 'vitest';
import { REGIONS, checkRegionalLimits, regionFrom } from './regionalLimits';

const eu = (...lines: [string, number][]) => checkRegionalLimits('eu', lines.map(([inci_name, percentage]) => ({ inci_name, percentage })));

describe('regional limits', () => {
    it('checks nothing when you are not selling', () => {
        expect(checkRegionalLimits('none', [{ inci_name: 'Salicylic Acid', percentage: 50 }])).toEqual([]);
    });

    it('stays quiet within the limits', () => {
        expect(eu(['Aqua', 80], ['Salicylic Acid', 1.5], ['Alpha-Arbutin', 0.4], ['Phenoxyethanol', 1])).toEqual([]);
    });

    it('flags salicylic acid above 3% as over for every product, and between 2% and 3% as depending on the product', () => {
        expect(eu(['Salicylic Acid', 3.5])[0]).toMatchObject({ id: 'salicylic-acid', level: 'over' });
        const mid = eu(['Salicylic Acid', 2.5]);
        expect(mid[0]).toMatchObject({ level: 'depends' });
        expect(mid[0].message).toContain('2% in most products');
        expect(mid[0].message).toContain('3% in rinse-off hair products');
    });

    it('treats arbutin and alpha-arbutin separately', () => {
        expect(eu(['Alpha-Arbutin', 1])[0]).toMatchObject({ id: 'alpha-arbutin', level: 'depends' }); // fine in a face cream, not in a body lotion
        expect(eu(['Alpha-Arbutin', 2.5])[0]).toMatchObject({ id: 'alpha-arbutin', level: 'over' });
        expect(eu(['Arbutin', 5])).toEqual([]);
        expect(eu(['Arbutin', 8])[0]).toMatchObject({ id: 'arbutin', level: 'over' });
    });

    it('adds up several lines of the same ingredient', () => {
        expect(eu(['Phenoxyethanol', 0.7], ['Phenoxyethanol', 0.7])[0]).toMatchObject({ id: 'phenoxyethanol', level: 'over', percentage: 1.4 });
    });

    it('counts a salt as the acid it contains', () => {
        expect(eu(['Potassium Sorbate', 0.7])).toEqual([]); // 0.7% sorbate is about 0.52% sorbic acid
        expect(eu(['Potassium Sorbate', 0.9])[0]).toMatchObject({ id: 'sorbic-acid', level: 'over' });
        expect(eu(['Sorbic Acid', 0.7])[0]).toMatchObject({ id: 'sorbic-acid', level: 'over' });
    });

    it('cannot tell how much of a restricted ingredient is in a blend, so asks only when the blend alone is over', () => {
        expect(eu(['Phenoxyethanol (and) Ethylhexylglycerin', 0.9])).toEqual([]);
        const blend = eu(['Phenoxyethanol (and) Ethylhexylglycerin', 1.2]);
        expect(blend[0]).toMatchObject({ id: 'phenoxyethanol', level: 'blend' });
        expect(blend[0].message).toContain('Ask the supplier');
    });

    it('ignores brackets in names, letter case and lines with nothing in them', () => {
        expect(eu(['SALICYLIC ACID [x]', 5])[0].level).toBe('over');
        expect(eu(['Salicylic Acid', 0])).toEqual([]);
    });

    it('does not mistake other ingredients for restricted ones', () => {
        expect(eu(['Salicylic Acid Esters', 9], ['Arbutin Extract', 9], ['Retinyl Retinoate', 9])).toEqual([]);
    });

    it('lists the worst first', () => {
        expect(eu(['Phenoxyethanol (and) Ethylhexylglycerin', 1.5], ['Salicylic Acid', 2.5], ['Kojic Acid', 4]).map(w => w.level)).toEqual(['over', 'depends', 'blend']);
    });

    it('warns about retinol and its esters together, in retinol equivalents', () => {
        expect(eu(['Retinol', 0.2], ['Retinyl Palmitate', 0.2])[0]).toMatchObject({ id: 'retinol', level: 'over' });
        expect(eu(['Retinol', 0.1])[0]).toMatchObject({ level: 'depends' });
    });

    it('has well-formed data for every limit', () => {
        for (const limit of REGIONS.eu.limits) {
            expect(limit.names.every(n => n === n.toLowerCase())).toBe(true);
            expect([...limit.scopes].sort((a, b) => a.max - b.max)).toEqual(limit.scopes);
        }
        expect(new Set(REGIONS.eu.limits.map(l => l.id)).size).toBe(REGIONS.eu.limits.length);
    });

    it('reads a saved setting safely', () => {
        expect(regionFrom('eu')).toBe('eu');
        expect(regionFrom('mars')).toBe('none');
        expect(regionFrom(null)).toBe('none');
        expect(regionFrom(undefined)).toBe('none');
    });
});
