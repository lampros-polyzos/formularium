import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    ApiError, MAX_IDS, addFavorite, addStashLot, changeContainer, createIngredient, deleteStashLot, fetchAllIngredients, fetchIngredientByInci, fetchIngredientsByIds,
    fetchStarredIds, searchIngredients, starIngredient, unstarIngredient,
} from './libraryApi';

const mocks = vi.hoisted(() => ({ authFetch: vi.fn() }));
vi.mock('./authClient', () => ({ authFetch: mocks.authFetch }));

const reply = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const lastCall = () => {
    const [path, init] = mocks.authFetch.mock.calls.at(-1)!;
    return { path: path as string, method: init.method as string, body: init.body ? JSON.parse(init.body as string) : undefined, headers: init.headers as Record<string, string> | undefined };
};

/** Every call gets its own Response, because a body can only be read once. */
const answer = (status: number, body?: unknown) => mocks.authFetch.mockImplementation(async () => reply(status, body));

beforeEach(() => { mocks.authFetch.mockReset(); answer(200, []); });

describe('reading the library', () => {
    it('asks for the whole library with a plain GET', async () => {
        answer(200, [{ id: 'a' }]);
        expect(await fetchAllIngredients()).toEqual([{ id: 'a' }]);
        expect(lastCall()).toMatchObject({ path: '/api/v1/ingredients', method: 'GET', body: undefined });
    });

    it('sends a search as filters, ids, a limit and the name ordering', async () => {
        await searchIngredients({ anyOf: [{ column: 'function', op: 'ilike', value: '%oil%' }], ids: ['a'], limit: 10, orderByName: true });
        expect(lastCall()).toMatchObject({ path: '/api/v1/ingredients/search', method: 'POST', body: { anyOf: [{ column: 'function', op: 'ilike', value: '%oil%' }], ids: ['a'], limit: 10, orderBy: 'trade_name' } });
        expect(lastCall().headers).toEqual({ 'Content-Type': 'application/json' });

        await searchIngredients({ anyOf: [] });
        expect(lastCall().body.orderBy).toBeUndefined();
    });

    it('finds one ingredient by its exact INCI name, or null', async () => {
        answer(200, [{ id: 'aqua', inci_name: 'Aqua' }]);
        expect(await fetchIngredientByInci('Aqua')).toEqual({ id: 'aqua', inci_name: 'Aqua' });
        expect(lastCall().body).toMatchObject({ anyOf: [{ column: 'inci_name', op: 'eq', value: 'Aqua' }], limit: 1 });

        answer(200, []);
        expect(await fetchIngredientByInci('Nothing')).toBeNull();
    });

    it('fetches ingredients by id in requests the backend accepts, once per distinct id', async () => {
        const ids = Array.from({ length: MAX_IDS * 2 + 5 }, (_, i) => `i${i}`);
        mocks.authFetch.mockImplementation(async (_p: string, init: { body: string }) => reply(200, JSON.parse(init.body).ids.map((id: string) => ({ id }))));
        const rows = await fetchIngredientsByIds([...ids, ...ids, '']);
        expect(mocks.authFetch).toHaveBeenCalledTimes(3);
        expect(mocks.authFetch.mock.calls.map(([, init]) => JSON.parse(init.body).ids.length)).toEqual([MAX_IDS, MAX_IDS, 5]);
        expect(rows).toHaveLength(ids.length);

        mocks.authFetch.mockClear();
        expect(await fetchIngredientsByIds([])).toEqual([]);
        expect(mocks.authFetch).not.toHaveBeenCalled();
    });

    it('stars and unstars with PUT and DELETE, and lists the starred ids', async () => {
        await starIngredient('x');
        expect(lastCall()).toMatchObject({ path: '/api/v1/ingredients/x/star', method: 'PUT' });
        await unstarIngredient('x');
        expect(lastCall()).toMatchObject({ path: '/api/v1/ingredients/x/star', method: 'DELETE' });
        await addFavorite('y');
        expect(lastCall()).toMatchObject({ path: '/api/v1/ingredients/y/favorite', method: 'PUT' });
        answer(200, ['x']);
        expect(await fetchStarredIds()).toEqual(['x']);
    });
});

describe('writing', () => {
    it('adds a custom ingredient, a stash lot and a container, and changes a container with PUT', async () => {
        await createIngredient({ trade_name: 'T', inci_name: 'I' });
        expect(lastCall()).toMatchObject({ path: '/api/v1/ingredients', method: 'POST', body: { trade_name: 'T', inci_name: 'I' } });
        await addStashLot({ ingredient_id: 'a', amount_left_g: 5 });
        expect(lastCall()).toMatchObject({ path: '/api/v1/stash', method: 'POST', body: { ingredient_id: 'a', amount_left_g: 5 } });
        await changeContainer('c1', { name: 'n', container_type: 'Bottle' });
        expect(lastCall()).toMatchObject({ path: '/api/v1/containers/c1', method: 'PUT' });
    });

    it('treats an empty answer to a delete as success', async () => {
        mocks.authFetch.mockImplementation(async () => new Response(null, { status: 204 }));
        await expect(deleteStashLot('l1')).resolves.toBeUndefined();
        expect(lastCall()).toMatchObject({ path: '/api/v1/stash/l1', method: 'DELETE' });
    });
});

describe('when the backend says no', () => {
    it('throws an ApiError with the backend\'s own message and code', async () => {
        answer(409, { error: { code: 'ingredient_exists', message: 'An ingredient with this INCI name is already in the library.' } });
        const error = await createIngredient({ trade_name: 'T', inci_name: 'Aqua' }).catch(e => e);
        expect(error).toBeInstanceOf(ApiError);
        expect(error).toMatchObject({ status: 409, code: 'ingredient_exists', message: 'An ingredient with this INCI name is already in the library.' });
    });

    it('still gives a readable error when the body is not JSON', async () => {
        mocks.authFetch.mockImplementation(async () => new Response('<html>bad gateway</html>', { status: 502 }));
        await expect(fetchAllIngredients()).rejects.toMatchObject({ status: 502, code: 'error', message: 'Something went wrong. Please try again.' });
    });

    it('passes on the sign-in error when there is no session', async () => {
        mocks.authFetch.mockRejectedValue(Object.assign(new Error('Please sign in.'), { code: 'no_session' }));
        await expect(fetchAllIngredients()).rejects.toMatchObject({ code: 'no_session' });
    });
});
