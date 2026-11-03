import { supabase } from './supabase';

// "Remixed from" links. A copy points back at what it came from; deleting the original only clears the link.

export interface Lineage {
    /** The formula this one was copied from (Clone in the editor). */
    cloned_from_formulation_id?: string | null;
    /** The community recipe this one started as (Clone to Studio), kept when it is cloned again. */
    remixed_from_post_id?: string | null;
}

export interface PostSummary { id: string; title: string; author_name: string | null; created_at?: string }
export interface FormulaSummary { id: string; name: string }

type DbError = { code?: string; message?: string } | null | undefined;

/** True when the database has no lineage columns yet, i.e. the migration has not been applied. */
export function isMissingLineageColumn(error: DbError): boolean {
    if (!error) return false;
    if (error.code === '42703' || error.code === 'PGRST204') return true;
    const message = error.message ?? '';
    return /remixed_from|cloned_from/.test(message) && /column|schema cache/i.test(message);
}

const present = (lineage: Lineage): Lineage =>
    Object.fromEntries(Object.entries(lineage).filter(([, value]) => value)) as Lineage;

/**
 * Runs a write with the lineage fields added. If the database doesn't know them yet, the write is repeated without
 * them: a copy is always made, even if its link can't be stored.
 */
export async function withLineage<R extends { error: DbError }>(run: (extra: Lineage) => PromiseLike<R>, lineage: Lineage): Promise<R> {
    const extra = present(lineage);
    if (Object.keys(extra).length === 0) return run({});
    const result = await run(extra);
    if (isMissingLineageColumn(result.error)) {
        console.warn('Remix links are not available yet (database migration pending); saving without the link.');
        return run({});
    }
    return result;
}

/** The recipe a post or formula was remixed from, or null if it is gone or can't be read. */
export async function fetchPostSummary(postId: string): Promise<PostSummary | null> {
    const { data, error } = await supabase.from('community_posts').select('id, title, author_name').eq('id', postId).maybeSingle();
    if (error) {
        console.warn('Could not load the original recipe:', error.message);
        return null;
    }
    return (data as PostSummary | null) ?? null;
}

/** The formula a copy was made from. Only the owner can read it, so this is null for anyone else. */
export async function fetchFormulaSummary(formulaId: string): Promise<FormulaSummary | null> {
    const { data, error } = await supabase.from('formulations').select('id, name').eq('id', formulaId).maybeSingle();
    if (error) {
        console.warn('Could not load the original formula:', error.message);
        return null;
    }
    return (data as FormulaSummary | null) ?? null;
}

/** Posts that are remixes of this one, newest first. */
export async function fetchRemixes(postId: string, limit = 10): Promise<PostSummary[]> {
    const { data, error } = await supabase
        .from('community_posts')
        .select('id, title, author_name, created_at')
        .eq('remixed_from_post_id', postId)
        .order('created_at', { ascending: false })
        .limit(limit);
    if (error) {
        console.warn('Could not load remixes:', error.message);
        return [];
    }
    return (data ?? []) as PostSummary[];
}
