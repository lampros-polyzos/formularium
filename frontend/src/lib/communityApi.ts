import { supabase } from './supabase';

/** What each function talks to. Tests pass their own; the app uses the real one. */
type Client = Pick<typeof supabase, 'from' | 'rpc'>;

export interface Report {
    id: string;
    target_type: 'post' | 'comment';
    target_id: string;
    post_id: string | null;
    target_author_id: string | null;
    snapshot: string | null;
    reason: string;
    details: string | null;
    status: 'open' | 'resolved' | 'dismissed';
    created_at: string;
}

export interface RecipePreview {
    id: string;
    title: string;
    excerpt: string;
    tags: string[];
    development_status: string | null;
    created_at: string;
}

const check = (error: { message: string } | null) => { if (error) throw error; };

export async function reportContent(input: { targetType: 'post' | 'comment'; targetId: string; reason: string; details?: string }, client: Client = supabase) {
    const { error } = await client.from('content_reports').insert([{ target_type: input.targetType, target_id: input.targetId, reason: input.reason, details: input.details?.trim() || null }]);
    check(error);
}

export async function editPost(id: string, changes: { title: string; write_up: string; sources?: string | null }, client: Client = supabase) {
    const { error } = await client.from('community_posts').update({
        title: changes.title.trim(),
        write_up: changes.write_up.trim(),
        ...(changes.sources !== undefined ? { sources: changes.sources?.trim() || null } : {}),
    }).eq('id', id);
    check(error);
}

/** Marks an advice post answered (or reopens it). Returns the new answered date, or null when reopened. */
export async function setAnswered(id: string, answered: boolean, client: Client = supabase): Promise<string | null> {
    const answeredAt = answered ? new Date().toISOString() : null;
    const { error } = await client.from('community_posts').update({ answered_at: answeredAt }).eq('id', id);
    check(error);
    return answeredAt;
}

export async function deleteComment(id: string, client: Client = supabase) {
    const { error } = await client.from('post_comments').delete().eq('id', id);
    check(error);
}

export async function listMutes(client: Client = supabase): Promise<string[]> {
    const { data, error } = await client.from('community_mutes').select('muted_user_id');
    check(error);
    return ((data ?? []) as { muted_user_id: string }[]).map(r => r.muted_user_id);
}
export async function muteMember(userId: string, client: Client = supabase) {
    const { error } = await client.from('community_mutes').insert([{ muted_user_id: userId }]);
    check(error);
}
export async function unmuteMember(userId: string, client: Client = supabase) {
    const { error } = await client.from('community_mutes').delete().eq('muted_user_id', userId);
    check(error);
}

export async function isModerator(client: Client = supabase): Promise<boolean> {
    const { data, error } = await client.rpc('is_moderator');
    if (error) return false;
    return data === true;
}

export async function listOpenReports(client: Client = supabase): Promise<Report[]> {
    const { data, error } = await client.from('content_reports').select('*').eq('status', 'open').order('created_at', { ascending: true });
    check(error);
    return (data ?? []) as Report[];
}

/** Closes a report. `remove` also deletes what was reported (moderators may remove any post or comment). */
export async function resolveReport(report: Report, outcome: 'resolved' | 'dismissed', moderatorId: string, remove: boolean, client: Client = supabase) {
    if (remove) {
        const { error } = await client.from(report.target_type === 'post' ? 'community_posts' : 'post_comments').delete().eq('id', report.target_id);
        check(error);
    }
    const { error } = await client.from('content_reports').update({ status: outcome, resolved_by: moderatorId, resolved_at: new Date().toISOString() }).eq('id', report.id);
    check(error);
}

/** The newest shared recipes as anyone may see them before signing in: a title, a short excerpt and tags. */
export async function fetchRecipePreviews(limit = 3, client: Client = supabase): Promise<RecipePreview[]> {
    const { data, error } = await client.rpc('public_recipe_previews', { p_limit: limit });
    check(error);
    return ((data ?? []) as (Omit<RecipePreview, 'tags'> & { tags: unknown })[]).map(r => ({ ...r, tags: Array.isArray(r.tags) ? (r.tags as string[]) : [] }));
}
