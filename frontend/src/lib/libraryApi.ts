// The ingredient library, the stash (ingredients you own) and your containers, as served by the Spring backend.
// Replaces the direct database reads these screens used to make. Everything here needs a signed-in user.

import { ApiError, request } from './apiClient';
import type { CatalogFilter } from './catalogFilter';
import type { DatabaseIngredient } from '../types/formulation';

export { ApiError };

// ---- ingredients

/** A library row. The backend sends every column, so this is the same shape the screens already use. */
export type IngredientRow = DatabaseIngredient & { id: string };

/** Ids per request: the backend accepts up to this many. */
export const MAX_IDS = 300;
/** The most rows one search returns. */
export const MAX_SEARCH_LIMIT = 500;

/** The whole library as you see it: shared ingredients plus your own, sorted by name. */
export const fetchAllIngredients = () => request<IngredientRow[]>('/api/v1/ingredients');

export interface IngredientSearch {
    /** A row matches when it matches ANY of these. */
    anyOf?: CatalogFilter[];
    /** Only among these ingredients. */
    ids?: string[];
    limit?: number;
    orderByName?: boolean;
}

/** Rows matching any of the filters. Asking for nothing returns nothing. */
export function searchIngredients(search: IngredientSearch): Promise<IngredientRow[]> {
    return request<IngredientRow[]>('/api/v1/ingredients/search', {
        method: 'POST',
        body: { anyOf: search.anyOf, ids: search.ids, limit: search.limit, orderBy: search.orderByName ? 'trade_name' : undefined },
    });
}

/** Full rows for some ingredients, in as many requests as it takes. Ids you cannot see are left out. */
export async function fetchIngredientsByIds(ids: string[]): Promise<IngredientRow[]> {
    const unique = [...new Set(ids.filter(Boolean))];
    const groups = Array.from({ length: Math.ceil(unique.length / MAX_IDS) }, (_, i) => unique.slice(i * MAX_IDS, (i + 1) * MAX_IDS));
    const results = await Promise.all(groups.map(group => request<IngredientRow[]>('/api/v1/ingredients/by-ids', { method: 'POST', body: { ids: group } })));
    return results.flat();
}

/** The one ingredient with exactly this INCI name, if you can see it. */
export async function fetchIngredientByInci(inciName: string): Promise<IngredientRow | null> {
    const rows = await searchIngredients({ anyOf: [{ column: 'inci_name', op: 'eq', value: inciName }], limit: 1 });
    return rows[0] ?? null;
}

export interface NewIngredient {
    trade_name: string;
    inci_name: string;
    function?: string | null;
    solubility?: string | null;
    default_min_usage?: number | null;
    default_max_usage?: number | null;
    notes?: string | null;
    is_vegan?: boolean;
    is_cosmos?: boolean;
    is_sulfate?: boolean;
    is_silicone?: boolean;
    is_paraben?: boolean;
    is_fragrance?: boolean;
}

export const createIngredient = (ingredient: NewIngredient) => request<IngredientRow>('/api/v1/ingredients', { method: 'POST', body: ingredient });

export const fetchStarredIds = () => request<string[]>('/api/v1/ingredients/starred');
export const starIngredient = (id: string) => request<void>(`/api/v1/ingredients/${id}/star`, { method: 'PUT' });
export const unstarIngredient = (id: string) => request<void>(`/api/v1/ingredients/${id}/star`, { method: 'DELETE' });

export const fetchFavorites = () => request<IngredientRow[]>('/api/v1/ingredients/favorites');
export const addFavorite = (id: string) => request<void>(`/api/v1/ingredients/${id}/favorite`, { method: 'PUT' });
export const removeFavorite = (id: string) => request<void>(`/api/v1/ingredients/${id}/favorite`, { method: 'DELETE' });

// ---- stash

export interface StashLotRow {
    id: string;
    user_id: string;
    ingredient_id: string;
    supplier_name: string | null;
    batch_lot_number: string | null;
    amount_left_g: number;
    price_per_g: number;
    expiration_date: string | null;
    notes: string | null;
    created_at: string;
    /** The ingredient this lot is of (a few fields) */
    ingredients: { id: string; inci_name: string; trade_name: string; function: string | null } | null;
}

export interface StashLotInput {
    ingredient_id: string;
    supplier_name?: string | null;
    batch_lot_number?: string | null;
    amount_left_g: number;
    price_per_g?: number | null;
    expiration_date?: string | null;
    notes?: string | null;
}

/** Your lots, newest first. */
export const fetchStash = () => request<StashLotRow[]>('/api/v1/stash');
export const addStashLot = (lot: StashLotInput) => request<StashLotRow>('/api/v1/stash', { method: 'POST', body: lot });
export const changeStashLot = (id: string, lot: StashLotInput) => request<StashLotRow>(`/api/v1/stash/${id}`, { method: 'PUT', body: lot });
export const deleteStashLot = (id: string) => request<void>(`/api/v1/stash/${id}`, { method: 'DELETE' });

// ---- containers

export interface ContainerRow {
    id: string;
    user_id: string;
    name: string;
    container_type: string;
    material: string | null;
    volume_ml: number | null;
    quantity: number;
    price_per_unit: number;
    supplier_name: string | null;
    image_url: string | null;
    notes: string | null;
    created_at: string;
    low_stock_threshold: number;
}

export type ContainerInput = Omit<ContainerRow, 'id' | 'user_id' | 'created_at'>;

/** Your containers, newest first. */
export const fetchContainers = () => request<ContainerRow[]>('/api/v1/containers');
export const addContainer = (container: Partial<ContainerInput> & { name: string; container_type: string }) => request<ContainerRow>('/api/v1/containers', { method: 'POST', body: container });
export const changeContainer = (id: string, container: Partial<ContainerInput> & { name: string; container_type: string }) => request<ContainerRow>(`/api/v1/containers/${id}`, { method: 'PUT', body: container });
export const deleteContainer = (id: string) => request<void>(`/api/v1/containers/${id}`, { method: 'DELETE' });
