import { supabase } from './supabase';
import { fetchIngredientsByIds, fetchStash } from './libraryApi';
import type { StashLot } from './batchPlan';
import type { Recipe } from './pantry';
import type { CatalogIngredient, FormulaLine } from './substitutions';

type Client = Pick<typeof supabase, 'from'>;

/** How many of the newest community recipes are looked at. */
export const COMMUNITY_LIMIT = 200;

const chunk = <T,>(items: T[], size: number): T[][] =>
    Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));

function fail(what: string, error: { message?: string } | null): never {
    throw new Error(`Could not load ${what}${error?.message ? `: ${error.message}` : '.'}`);
}

/** Your stash lots, as the batch planner reads them. */
export async function loadStash(): Promise<StashLot[]> {
    try {
        return (await fetchStash()).map(({ id, ingredient_id, amount_left_g, expiration_date, supplier_name, batch_lot_number, price_per_g }) =>
            ({ id, ingredient_id, amount_left_g, expiration_date, supplier_name, batch_lot_number, price_per_g }));
    } catch (e) {
        return fail('your stash', e as Error);
    }
}

/** Full library rows for some ingredients, fetched in short batches so the request address stays short. */
export async function loadIngredients(ids: string[]): Promise<CatalogIngredient[]> {
    try {
        return (await fetchIngredientsByIds(ids)) as CatalogIngredient[];
    } catch (e) {
        return fail('ingredients', e as Error);
    }
}

interface NestedFormulation {
    id: string;
    name: string;
    target_ph: number | null;
    target_weight_g: number | string | null;
    formulation_phases: {
        phase_letter: 'A' | 'B' | 'C';
        formulation_ingredients: { percentage: number | string; is_qs: boolean | null; ingredients: CatalogIngredient | null }[];
    }[];
}

/** Your own formulas, with every ingredient. Formulas with nothing in them are left out. */
export async function loadOwnRecipes(userId: string, client: Client = supabase): Promise<Recipe[]> {
    const { data, error } = await client
        .from('formulations')
        .select('id, name, target_ph, target_weight_g, formulation_phases(phase_letter, formulation_ingredients(percentage, is_qs, ingredients(*)))')
        .eq('user_id', userId)
        .order('name');
    if (error) fail('your formulas', error);

    return ((data ?? []) as unknown as NestedFormulation[])
        .map<Recipe>(f => ({
            id: f.id,
            source: 'own',
            name: f.name,
            targetPh: f.target_ph,
            targetWeightG: f.target_weight_g === null ? null : Number(f.target_weight_g),
            lines: (f.formulation_phases ?? []).flatMap(phase =>
                (phase.formulation_ingredients ?? [])
                    .filter(fi => fi.ingredients)
                    .map<FormulaLine>(fi => ({ ingredient: fi.ingredients!, phase: phase.phase_letter, percentage: Number(fi.percentage), isQS: Boolean(fi.is_qs) }))),
        }))
        .filter(recipe => recipe.lines.length > 0);
}

interface SnapshotEntry { id?: string; ingredient_id?: string; name?: string; inci_name?: string | null; phase?: string; percentage?: number | string; function?: string | null }

function parseSnapshot(raw: unknown): SnapshotEntry[] {
    let data = raw;
    if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch { return []; }
    }
    return Array.isArray(data) ? (data as SnapshotEntry[]) : [];
}

export interface CommunityRecipes {
    recipes: Recipe[];
    /** There may be more recipes than were looked at. */
    limited: boolean;
}

/**
 * The newest community recipes by other people, each as of its latest version. A shared recipe stores which
 * ingredients it uses and how much, but not their details, so those are fetched for what you do not own; for what you
 * do own, your own copy of the ingredient is used.
 */
export async function loadCommunityRecipes(
    userId: string,
    owned: CatalogIngredient[],
    client: Client = supabase,
    limit: number = COMMUNITY_LIMIT,
): Promise<CommunityRecipes> {
    const { data: posts, error } = await client
        .from('community_posts')
        .select('id, title, author_id, author_name, created_at')
        .eq('post_type', 'formulation')
        .order('created_at', { ascending: false })
        .limit(limit);
    if (error) fail('community recipes', error);

    const all = (posts ?? []) as { id: string; title: string; author_id: string | null; author_name: string | null }[];
    const others = all.filter(p => p.author_id !== userId);

    // The latest version of each recipe
    const snapshotResults = await Promise.all(chunk(others.map(p => p.id), 50)
        .map(ids => client.from('post_snapshots').select('post_id, version, formulation_data').in('post_id', ids)));
    const latest = new Map<string, { version: number; data: SnapshotEntry[] }>();
    for (const { data, error: snapshotError } of snapshotResults) {
        if (snapshotError) fail('community recipes', snapshotError);
        for (const snap of (data ?? []) as { post_id: string; version: number; formulation_data: unknown }[]) {
            const known = latest.get(snap.post_id);
            if (!known || snap.version > known.version) latest.set(snap.post_id, { version: snap.version, data: parseSnapshot(snap.formulation_data) });
        }
    }

    const ownedById = new Map(owned.map(i => [i.id, i]));
    const wanted = new Set<string>();
    for (const { data } of latest.values()) {
        for (const entry of data) {
            const id = entry.id ?? entry.ingredient_id;
            if (id && !ownedById.has(id)) wanted.add(id);
        }
    }
    const fetched = new Map((await loadIngredients([...wanted])).map(i => [i.id, i]));

    const recipes: Recipe[] = [];
    for (const post of others) {
        const snapshot = latest.get(post.id);
        if (!snapshot) continue;
        const lines = snapshot.data.flatMap<FormulaLine>(entry => {
            const id = entry.id ?? entry.ingredient_id;
            const percentage = Number(entry.percentage);
            if (!id || !(percentage > 0)) return [];
            const ingredient: CatalogIngredient = ownedById.get(id) ?? fetched.get(id) ?? {
                id,
                inci_name: entry.inci_name ?? entry.name ?? 'Unknown',
                trade_name: entry.name ?? entry.inci_name ?? 'Unknown',
                function: entry.function ?? null,
                min_usage_pct: null,
                max_usage_pct: null,
            };
            return [{ ingredient, phase: (['A', 'B', 'C'].includes(entry.phase ?? '') ? entry.phase : 'A') as 'A' | 'B' | 'C', percentage }];
        });
        if (lines.length > 0) recipes.push({ id: post.id, source: 'community', name: post.title, author: post.author_name, lines });
    }
    return { recipes, limited: all.length >= limit };
}
