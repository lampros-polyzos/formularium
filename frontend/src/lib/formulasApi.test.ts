import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    addVersion, createFormula, deleteFormula, fetchFormula, fetchFormulas, fetchFormulasWithLines, fetchProfile, fetchVersions, linkFormulaToPost, removeVersion, saveFormula,
} from './formulasApi';

const mocks = vi.hoisted(() => ({ authFetch: vi.fn() }));
vi.mock('./authClient', () => ({ authFetch: mocks.authFetch }));

const answer = (status: number, body?: unknown) => mocks.authFetch.mockImplementation(async () =>
    new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
const lastCall = () => {
    const [path, init] = mocks.authFetch.mock.calls.at(-1)!;
    return { path: path as string, method: init.method as string, body: init.body ? JSON.parse(init.body as string) : undefined };
};

beforeEach(() => { mocks.authFetch.mockReset(); answer(200, []); });

describe('reading', () => {
    it('reads your formulas, with or without their contents', async () => {
        await fetchFormulas();
        expect(lastCall()).toMatchObject({ path: '/api/v1/formulas', method: 'GET' });
        await fetchFormulasWithLines();
        expect(lastCall().path).toBe('/api/v1/formulas?lines=true');
    });

    it('reads one formula and one product type', async () => {
        answer(200, { id: 'f1', name: 'Lotion', formulation_phases: [] });
        expect((await fetchFormula('f1')).name).toBe('Lotion');
        expect(lastCall().path).toBe('/api/v1/formulas/f1');
        await fetchProfile('ow_lotion');
        expect(lastCall().path).toBe('/api/v1/profiles/ow_lotion');
        await fetchProfile('odd id/with slash');
        expect(lastCall().path).toBe('/api/v1/profiles/odd%20id%2Fwith%20slash');   // an id can never change which address is called
    });
});

describe('writing', () => {
    const body = { name: 'Lotion', profile_id: 'ow_lotion', ingredients: [{ ingredient_id: 'a', phase_letter: 'A', percentage: 100, is_qs: true }] };

    it('creates with POST (asking for the copy rules only when copying), saves with PUT, deletes with DELETE', async () => {
        await createFormula(body);
        expect(lastCall()).toMatchObject({ path: '/api/v1/formulas', method: 'POST', body });
        await createFormula(body, { copy: true });
        expect(lastCall().path).toBe('/api/v1/formulas?copy=true');
        await saveFormula('f1', body);
        expect(lastCall()).toMatchObject({ path: '/api/v1/formulas/f1', method: 'PUT', body });
        answer(204);
        await deleteFormula('f1');
        expect(lastCall()).toMatchObject({ path: '/api/v1/formulas/f1', method: 'DELETE' });
    });

    it('links a formula to the post it was shared as', async () => {
        answer(204);
        await linkFormulaToPost('f1', 'p1');
        expect(lastCall()).toMatchObject({ path: '/api/v1/formulas/f1/post', method: 'PUT', body: { community_post_id: 'p1' } });
    });
});

describe('version history', () => {
    it('lists, adds and removes versions under their formula', async () => {
        await fetchVersions('f1');
        expect(lastCall()).toMatchObject({ path: '/api/v1/formulas/f1/versions', method: 'GET' });
        await addVersion('f1', { name: 'Lotion', note: 'n', lines: [] });
        expect(lastCall()).toMatchObject({ path: '/api/v1/formulas/f1/versions', method: 'POST', body: { name: 'Lotion', note: 'n', lines: [] } });
        answer(204);
        await removeVersion('f1', 'v9');
        expect(lastCall()).toMatchObject({ path: '/api/v1/formulas/f1/versions/v9', method: 'DELETE' });
    });
});

describe('when the backend says no', () => {
    it('throws the backend\'s own message', async () => {
        answer(400, { error: { code: 'unknown_ingredient', message: 'An ingredient in this formula is not in your library.' } });
        await expect(saveFormula('f1', { name: 'x', ingredients: [] })).rejects.toMatchObject({ status: 400, code: 'unknown_ingredient', message: 'An ingredient in this formula is not in your library.' });
        answer(404, { error: { code: 'not_found', message: 'That formula does not exist.' } });
        await expect(fetchFormula('nope')).rejects.toMatchObject({ status: 404, message: 'That formula does not exist.' });
    });
});
