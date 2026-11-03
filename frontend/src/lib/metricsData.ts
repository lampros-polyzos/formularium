import { supabase } from './supabase';
import { listBatches } from './batches';
import { loadIngredients, loadStash } from './pantryData';
import type { MetricBatch, MetricFavorite, MetricFormula, MetricLine, MetricsInput } from './metrics';

type Client = Pick<typeof supabase, 'from'>;

const PAGE = 1000;
/** Most pages read for the ingredients of all batches (so up to 20,000 rows). */
const MAX_PAGES = 20;

function fail(what: string, error: { message?: string } | null): never {
    throw new Error(`Could not load ${what}${error?.message ? `: ${error.message}` : '.'}`);
}

export async function loadMetricBatches(client: Client = supabase): Promise<MetricBatch[]> {
    const batches = await listBatches(client as typeof supabase);
    return batches.map(b => ({
        id: b.id,
        formulation_id: b.formulation_id,
        name: b.name,
        batch_size_g: Number(b.batch_size_g),
        made_on: b.made_on,
        status: b.status,
        final_weight_g: b.final_weight_g === null || b.final_weight_g === undefined ? null : Number(b.final_weight_g),
        ingredient_cost: b.ingredient_cost === null || b.ingredient_cost === undefined ? null : Number(b.ingredient_cost),
        unpriced_count: b.unpriced_count ?? 0,
        container_name: b.container_name ?? null,
        container_volume_ml: b.container_volume_ml === null || b.container_volume_ml === undefined ? null : Number(b.container_volume_ml),
        container_count: b.container_count === null || b.container_count === undefined ? null : Number(b.container_count),
        container_unit_price: b.container_unit_price === null || b.container_unit_price === undefined ? null : Number(b.container_unit_price),
        checks: (b.batch_checks ?? []).map(c => ({ result: c.result, observations: c.observations ?? [], checked_at: c.checked_at })),
    }));
}

/** What went into every batch you have made, read a page at a time. */
export async function loadMetricLines(client: Client = supabase): Promise<MetricLine[]> {
    const lines: MetricLine[] = [];
    for (let page = 0; page < MAX_PAGES; page++) {
        const { data, error } = await client
            .from('batch_ingredients')
            .select('batch_id, ingredient_id, name, actual_g, cost')
            .order('id')
            .range(page * PAGE, (page + 1) * PAGE - 1);
        if (error) fail('what went into your batches', error);
        const rows = (data ?? []) as { batch_id: string; ingredient_id: string | null; name: string; actual_g: number | string; cost: number | string | null }[];
        for (const r of rows) {
            lines.push({ batch_id: r.batch_id, ingredient_id: r.ingredient_id, name: r.name, actual_g: Number(r.actual_g), cost: r.cost === null ? null : Number(r.cost) });
        }
        if (rows.length < PAGE) break;
    }
    return lines;
}

export async function loadFavorites(userId: string, client: Client = supabase): Promise<MetricFavorite[]> {
    const { data, error } = await client.from('favorite_ingredients').select('ingredients(id, trade_name, inci_name)').eq('user_id', userId);
    if (error) fail('your favourite ingredients', error);
    return ((data ?? []) as unknown as { ingredients: { id: string; trade_name: string | null; inci_name: string | null } | null }[])
        .flatMap(r => (r.ingredients ? [{ id: r.ingredients.id, name: r.ingredients.trade_name || r.ingredients.inci_name || 'Unknown ingredient' }] : []));
}

export async function loadFormulaSummaries(userId: string, client: Client = supabase): Promise<MetricFormula[]> {
    const { data, error } = await client
        .from('formulations')
        .select('id, name, created_at, formulation_phases(formulation_ingredients(id))')
        .eq('user_id', userId);
    if (error) fail('your formulas', error);
    return ((data ?? []) as unknown as { id: string; name: string; created_at: string | null; formulation_phases: { formulation_ingredients: unknown[] }[] }[])
        .map(f => ({
            id: f.id,
            name: f.name,
            created_at: f.created_at,
            ingredientCount: (f.formulation_phases ?? []).reduce((n, p) => n + (p.formulation_ingredients?.length ?? 0), 0),
        }));
}

export async function countSharedRecipes(userId: string, client: Client = supabase): Promise<number> {
    const { count, error } = await client
        .from('community_posts')
        .select('id', { count: 'exact', head: true })
        .eq('author_id', userId)
        .eq('post_type', 'formulation');
    if (error) fail('your shared recipes', error);
    return count ?? 0;
}

/** Everything the Metrics page works from. */
export async function loadMetricsInput(userId: string, client: Client = supabase): Promise<MetricsInput> {
    const [batches, lines, favorites, formulas, sharedCount, lots] = await Promise.all([
        loadMetricBatches(client),
        loadMetricLines(client),
        loadFavorites(userId, client),
        loadFormulaSummaries(userId, client),
        countSharedRecipes(userId, client),
        loadStash(userId, client),
    ]);
    const stashRows = await loadIngredients(lots.map(l => l.ingredient_id), client);
    return {
        batches, lines, favorites, formulas, sharedCount, lots,
        stashNames: new Map(stashRows.map(i => [i.id, i.trade_name || i.inci_name])),
        stashMaxUsage: new Map(stashRows.map(i => [i.id, i.max_usage_pct ?? null])),
    };
}
