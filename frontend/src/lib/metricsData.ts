import { listBatchLines, listBatches } from './batches';
import { fetchSharedCount } from './communityApi';
import { fetchFormulasWithLines } from './formulasApi';
import { fetchFavorites } from './libraryApi';
import { loadIngredients, loadStash } from './pantryData';
import type { MetricBatch, MetricFavorite, MetricFormula, MetricLine, MetricsInput } from './metrics';

function fail(what: string, error: { message?: string } | null): never {
    throw new Error(`Could not load ${what}${error?.message ? `: ${error.message}` : '.'}`);
}

export async function loadMetricBatches(): Promise<MetricBatch[]> {
    const batches = await listBatches();
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

/** What went into every batch you have made. */
export async function loadMetricLines(): Promise<MetricLine[]> {
    const rows = await listBatchLines();
    return rows.map(r => ({ batch_id: r.batch_id, ingredient_id: r.ingredient_id, name: r.name, actual_g: Number(r.actual_g), cost: r.cost === null ? null : Number(r.cost) }));
}

export async function loadFavorites(): Promise<MetricFavorite[]> {
    try {
        return (await fetchFavorites()).map(i => ({ id: i.id, name: i.trade_name || i.inci_name || 'Unknown ingredient' }));
    } catch (e) {
        return fail('your favourite ingredients', e as Error);
    }
}

export async function loadFormulaSummaries(): Promise<MetricFormula[]> {
    let data;
    try {
        data = await fetchFormulasWithLines();
    } catch (e) {
        return fail('your formulas', e as Error);
    }
    return data
        .map(f => ({
            id: f.id,
            name: f.name,
            created_at: f.created_at,
            ingredientCount: (f.formulation_phases ?? []).reduce((n, p) => n + (p.formulation_ingredients?.length ?? 0), 0),
        }));
}

export async function countSharedRecipes(): Promise<number> {
    try {
        return await fetchSharedCount();
    } catch (e) {
        return fail('your shared recipes', e as Error);
    }
}

/** Everything the Metrics page works from. */
export async function loadMetricsInput(): Promise<MetricsInput> {
    const [batches, lines, favorites, formulas, sharedCount, lots] = await Promise.all([
        loadMetricBatches(),
        loadMetricLines(),
        loadFavorites(),
        loadFormulaSummaries(),
        countSharedRecipes(),
        loadStash(),
    ]);
    const stashRows = await loadIngredients(lots.map(l => l.ingredient_id));
    return {
        batches, lines, favorites, formulas, sharedCount, lots,
        stashNames: new Map(stashRows.map(i => [i.id, i.trade_name || i.inci_name])),
        stashMaxUsage: new Map(stashRows.map(i => [i.id, i.max_usage_pct ?? null])),
    };
}
