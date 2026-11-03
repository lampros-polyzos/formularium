import { supabase } from './supabase';

type Client = Pick<typeof supabase, 'from'>;

/** One ingredient of a saved version. */
export interface VersionLine {
    ingredient_id: string;
    inci_name: string;
    trade_name: string;
    phase: string;
    percentage: number;
    is_qs: boolean;
}

/** A formula as it was at one moment. `id` and `version_number` are null for the formula as it is now. */
export interface FormulaVersion {
    id: string | null;
    version_number: number | null;
    note: string | null;
    name: string;
    profile_id: string | null;
    target_weight_g: number | null;
    target_ph: number | null;
    lines: VersionLine[];
    created_at: string | null;
}

export interface VersionInput {
    name: string;
    profileId: string | null;
    targetWeight: number | null;
    targetPh: number | null;
    ingredients: { id: string; inci_name: string; trade_name: string; phase: string; percentage: number; isQS: boolean }[];
}

const COLUMNS = 'id, version_number, note, name, profile_id, target_weight_g, target_ph, lines, created_at';
const num = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));

function fail(what: string, error: { message?: string } | null): never {
    throw new Error(`Could not ${what}${error?.message ? `: ${error.message}` : '.'}`);
}

/** The lines of a formula as stored in a version: by phase, largest first, the way the formula itself is saved. */
export function toVersionLines(ingredients: VersionInput['ingredients']): VersionLine[] {
    return [...ingredients]
        .sort((a, b) => (a.phase < b.phase ? -1 : a.phase > b.phase ? 1 : (b.percentage || 0) - (a.percentage || 0)))
        .map(i => ({
            ingredient_id: i.id,
            inci_name: i.inci_name ?? '',
            trade_name: i.trade_name ?? '',
            phase: i.phase,
            percentage: Number(i.percentage) || 0,
            is_qs: Boolean(i.isQS),
        }));
}

function fromRow(row: Record<string, unknown>): FormulaVersion {
    return {
        id: row.id as string,
        version_number: Number(row.version_number),
        note: (row.note as string | null) ?? null,
        name: row.name as string,
        profile_id: (row.profile_id as string | null) ?? null,
        target_weight_g: num(row.target_weight_g),
        target_ph: num(row.target_ph),
        lines: ((row.lines as VersionLine[] | null) ?? []).map(l => ({ ...l, percentage: Number(l.percentage) || 0 })),
        created_at: (row.created_at as string | null) ?? null,
    };
}

/** Saved versions of a formula, newest first. */
export async function listVersions(formulaId: string, client: Client = supabase): Promise<FormulaVersion[]> {
    const { data, error } = await client.from('formulation_versions').select(COLUMNS).eq('formulation_id', formulaId).order('version_number', { ascending: false });
    if (error) fail('load the history', error);
    return ((data ?? []) as Record<string, unknown>[]).map(fromRow);
}

/** Keeps a copy of the formula as it is now, with a note on what changed and why. Returns the new version. */
export async function saveVersion(formulaId: string, input: VersionInput, note: string, client: Client = supabase): Promise<FormulaVersion> {
    const { data, error } = await client
        .from('formulation_versions')
        .insert([{
            formulation_id: formulaId,
            note: note.trim() || null,
            name: input.name,
            profile_id: input.profileId || null,
            target_weight_g: input.targetWeight,
            target_ph: input.targetPh,
            lines: toVersionLines(input.ingredients),
        }])
        .select(COLUMNS)
        .single();
    if (error) fail('save the version', error);
    return fromRow(data as Record<string, unknown>);
}

export async function deleteVersion(versionId: string, client: Client = supabase): Promise<void> {
    const { error } = await client.from('formulation_versions').delete().eq('id', versionId);
    if (error) fail('delete the version', error);
}

interface NestedFormula {
    name: string;
    profile_id: string | null;
    target_weight_g: number | string | null;
    target_ph: number | string | null;
    formulation_phases: {
        phase_letter: string;
        formulation_ingredients: { percentage: number | string; is_qs: boolean | null; ingredients: { id: string; inci_name: string | null; trade_name: string | null } | null }[];
    }[];
}

/** The formula as it is saved right now, in the same shape as a version so the two can be compared. */
export async function loadCurrent(formulaId: string, client: Client = supabase): Promise<FormulaVersion> {
    const { data, error } = await client
        .from('formulations')
        .select('name, profile_id, target_weight_g, target_ph, formulation_phases(phase_letter, formulation_ingredients(percentage, is_qs, ingredients(id, inci_name, trade_name)))')
        .eq('id', formulaId)
        .single();
    if (error) fail('load the formula', error);
    const f = data as unknown as NestedFormula;
    const ingredients = (f.formulation_phases ?? []).flatMap(phase =>
        (phase.formulation_ingredients ?? []).filter(fi => fi.ingredients).map(fi => ({
            id: fi.ingredients!.id,
            inci_name: fi.ingredients!.inci_name ?? '',
            trade_name: fi.ingredients!.trade_name ?? '',
            phase: phase.phase_letter,
            percentage: Number(fi.percentage),
            isQS: Boolean(fi.is_qs),
        })));
    return {
        id: null, version_number: null, note: null, created_at: null,
        name: f.name, profile_id: f.profile_id ?? null, target_weight_g: num(f.target_weight_g), target_ph: num(f.target_ph),
        lines: toVersionLines(ingredients),
    };
}

// ---------- Comparing two versions ----------

export type LineChange = 'added' | 'removed' | 'changed' | 'same';

export interface LineDiff {
    key: string;
    name: string;
    inci_name: string;
    before: VersionLine | null;
    after: VersionLine | null;
    change: LineChange;
    /** Percentage points, after minus before. Zero for lines that are only in one version. */
    delta: number;
}

export interface MetaDiff { field: 'name' | 'profile' | 'target weight' | 'target pH'; before: string; after: string }

export interface VersionDiff {
    lines: LineDiff[];
    meta: MetaDiff[];
    counts: Record<LineChange, number>;
    /** Nothing differs, not even the details. */
    identical: boolean;
}

const EPSILON = 1e-9;
const label = (l: VersionLine) => l.trade_name || l.inci_name || 'Unknown';

/**
 * What changed going from `before` to `after`. An ingredient is matched by what it is, so moving it to another phase
 * or changing its amount is a change to that ingredient, not a removal and an addition. An ingredient used twice is
 * matched in order.
 */
export function diffVersions(before: FormulaVersion, after: FormulaVersion): VersionDiff {
    const keyed = (lines: VersionLine[]) => {
        const seen = new Map<string, number>();
        const out = new Map<string, VersionLine>();
        for (const line of lines) {
            const n = seen.get(line.ingredient_id) ?? 0;
            seen.set(line.ingredient_id, n + 1);
            out.set(`${line.ingredient_id}#${n}`, line);
        }
        return out;
    };
    const a = keyed(before.lines);
    const b = keyed(after.lines);

    const lines: LineDiff[] = [];
    for (const [key, x] of a) {
        const y = b.get(key) ?? null;
        const changed = y !== null && (Math.abs(x.percentage - y.percentage) > EPSILON || x.phase !== y.phase || x.is_qs !== y.is_qs);
        lines.push({ key, name: label(y ?? x), inci_name: (y ?? x).inci_name, before: x, after: y,
            change: y === null ? 'removed' : changed ? 'changed' : 'same', delta: y ? y.percentage - x.percentage : 0 });
    }
    for (const [key, y] of b) {
        if (!a.has(key)) lines.push({ key, name: label(y), inci_name: y.inci_name, before: null, after: y, change: 'added', delta: 0 });
    }
    // Biggest movers first, then what stayed the same, each phase in turn
    const order: Record<LineChange, number> = { changed: 0, added: 1, removed: 2, same: 3 };
    lines.sort((p, q) => order[p.change] - order[q.change]
        || Math.abs(q.delta) - Math.abs(p.delta)
        || ((q.after ?? q.before)!.percentage - (p.after ?? p.before)!.percentage));

    const show = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));
    const meta: MetaDiff[] = [];
    const compare = (field: MetaDiff['field'], x: unknown, y: unknown) => {
        if (show(x) !== show(y)) meta.push({ field, before: show(x), after: show(y) });
    };
    compare('name', before.name, after.name);
    compare('profile', before.profile_id, after.profile_id);
    compare('target weight', before.target_weight_g, after.target_weight_g);
    compare('target pH', before.target_ph, after.target_ph);

    const counts: Record<LineChange, number> = { added: 0, removed: 0, changed: 0, same: 0 };
    for (const l of lines) counts[l.change]++;
    return { lines, meta, counts, identical: meta.length === 0 && counts.added + counts.removed + counts.changed === 0 };
}

/** "Version 3", or "Current" for the formula as it is now. */
export const versionLabel = (v: FormulaVersion) => (v.version_number === null ? 'Current' : `Version ${v.version_number}`);
