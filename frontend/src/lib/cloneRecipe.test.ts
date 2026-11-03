import { describe, expect, it, vi } from 'vitest';
import { cloneRecipeToStudio } from './cloneRecipe';

vi.mock('./supabase', () => ({ supabase: {} }));

/** Records what is inserted where, and answers like the database would. */
function fakeClient(failOn?: string) {
    const inserts: { table: string; rows: unknown }[] = [];
    const client = {
        from(table: string) {
            const b: Record<string, unknown> = {};
            b.insert = (rows: unknown) => { inserts.push({ table, rows }); return b; };
            b.select = () => b;
            b.single = () => b;
            b.then = (resolve: (v: unknown) => void) => {
                if (table === failOn) return resolve({ data: null, error: { message: `${table} failed` } });
                if (table === 'formulations') return resolve({ data: { id: 'new1' }, error: null });
                if (table === 'formulation_phases') return resolve({ data: (inserts.find(i => i.table === table)!.rows as { phase_letter: string }[]).map((p, n) => ({ id: `ph${n}`, phase_letter: p.phase_letter })), error: null });
                resolve({ data: null, error: null });
            };
            return b;
        },
    };
    return { client: client as never, inserts };
}

const LINES = [
    { ingredient_id: 'aqua', percentage: 80, phase: 'A' },
    { ingredient_id: 'oil', percentage: '15', phase: 'B' },
    { ingredient_id: 'pres', percentage: 1, phase: 'B' },
];

describe('cloneRecipeToStudio', () => {
    it('makes a draft that remembers the recipe, with one phase per letter and every line in its phase', async () => {
        const { client, inserts } = fakeClient();
        const id = await cloneRecipeToStudio('u1', { id: 'p1', title: 'Lotion' }, LINES, undefined, client);
        expect(id).toBe('new1');
        expect(inserts[0]).toMatchObject({ table: 'formulations', rows: [{ name: 'Lotion (Clone)', user_id: 'u1', status: 'Draft', remixed_from_post_id: 'p1' }] });
        expect((inserts[1].rows as { phase_letter: string }[]).map(p => p.phase_letter)).toEqual(['A', 'B']);
        expect(inserts[2].rows).toEqual([
            { phase_id: 'ph0', ingredient_id: 'aqua', percentage: 80, is_qs: false },
            { phase_id: 'ph1', ingredient_id: 'oil', percentage: '15', is_qs: false },
            { phase_id: 'ph1', ingredient_id: 'pres', percentage: 1, is_qs: false },
        ]);
    });

    it('uses the name it is given', async () => {
        const { client, inserts } = fakeClient();
        await cloneRecipeToStudio('u1', { id: 'p1', title: 'Lotion' }, LINES, 'Lotion (Clone with swaps)', client);
        expect(inserts[0].rows).toMatchObject([{ name: 'Lotion (Clone with swaps)' }]);
    });

    it.each(['formulations', 'formulation_phases', 'formulation_ingredients'])('reports a failure saving %s', async table => {
        const { client } = fakeClient(table);
        await expect(cloneRecipeToStudio('u1', { id: 'p1', title: 'x' }, LINES, undefined, client)).rejects.toMatchObject({ message: `${table} failed` });
    });
});
