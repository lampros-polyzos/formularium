// The community (shared recipes, advice and information posts, comments, ratings, reports, muting and notifications), as served by the Spring backend.
// The backend enforces who may do what, and the limits; the messages it sends back are written for people.

import { API_BASE_URL } from './api';
import { request } from './apiClient';

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

export type PostType = 'formulation' | 'discussion' | 'advice' | 'information';

export interface CommunityPost {
    id: string;
    author_id: string | null;
    title: string;
    write_up: string | null;
    tags: string[] | null;
    created_at: string;
    /** 'request' and 'education' are older names that may still be stored */
    post_type: PostType | 'request' | 'education' | string | null;
    development_status: string | null;
    profile_name: string | null;
    author_name: string | null;
    remixed_from_post_id: string | null;
    edited_at: string | null;
    answered_at: string | null;
    sources: string | null;
}

export interface CommunityComment {
    id: string;
    post_id: string;
    author_id: string | null;
    author_name: string | null;
    body: string;
    created_at: string;
}

export interface RecipeVersion {
    version: number;
    formulation_data: Record<string, unknown>[];
    release_notes: string | null;
    created_at: string;
}

export interface RecipeRating {
    id: string;
    post_id: string;
    user_id: string;
    author_name: string | null;
    version: number;
    overall: number;
    texture: number | null;
    stability: number | null;
    ease: number | null;
    efficacy: number | null;
    made_it: boolean;
    skin_type: string | null;
    review: string | null;
    created_at: string;
    updated_at: string;
}

export interface RatingInput {
    version: number;
    overall: number;
    made_it: boolean;
    texture: number | null;
    stability: number | null;
    ease: number | null;
    efficacy: number | null;
    skin_type: string | null;
    review: string | null;
}

export interface NewPostInput {
    title: string;
    write_up?: string | null;
    post_type: PostType;
    tags?: string[];
    development_status?: string | null;
    profile_name?: string | null;
    sources?: string | null;
    remixed_from_post_id?: string | null;
}

export interface Notification {
    id: string;
    recipient_id: string;
    actor_name: string | null;
    post_id: string;
    type: string;
    is_read: boolean;
    created_at: string;
}

// ---- posts

export const fetchPosts = (types?: string[]) => request<CommunityPost[]>(`/api/v1/community/posts${types && types.length ? `?types=${types.map(encodeURIComponent).join(',')}` : ''}`);
export const fetchPost = (id: string) => request<CommunityPost>(`/api/v1/community/posts/${id}`);
export const createPost = (post: NewPostInput) => request<CommunityPost>('/api/v1/community/posts', { method: 'POST', body: post });
export const deletePost = (id: string) => request<void>(`/api/v1/community/posts/${id}`, { method: 'DELETE' });

/** Changes the text of your own post. Only what is given changes. */
export function editPost(id: string, changes: { title?: string; write_up?: string; sources?: string | null; development_status?: string }) {
    const body: Record<string, unknown> = {};
    if (changes.title !== undefined) body.title = changes.title.trim();
    if (changes.write_up !== undefined) body.write_up = changes.write_up.trim();
    if (changes.sources !== undefined) body.sources = changes.sources?.trim() || '';
    if (changes.development_status !== undefined) body.development_status = changes.development_status;
    return request<CommunityPost>(`/api/v1/community/posts/${id}`, { method: 'PATCH', body });
}

/** Marks an advice post answered (or reopens it). Returns the new answered date, or null when reopened. */
export async function setAnswered(id: string, answered: boolean): Promise<string | null> {
    return (await request<CommunityPost>(`/api/v1/community/posts/${id}/answered`, { method: 'PUT', body: { answered } })).answered_at;
}

export const fetchRemixes = (postId: string, limit = 10) => request<{ id: string; title: string; author_name: string | null; created_at: string }[]>(`/api/v1/community/posts/${postId}/remixes?limit=${limit}`);

// ---- comments

export const fetchComments = (postId: string) => request<CommunityComment[]>(`/api/v1/community/posts/${postId}/comments`);
export const addComment = (postId: string, body: string) => request<CommunityComment>(`/api/v1/community/posts/${postId}/comments`, { method: 'POST', body: { body } });
export const deleteComment = (id: string) => request<void>(`/api/v1/community/comments/${id}`, { method: 'DELETE' });

// ---- recipe versions

export const fetchVersions = (postId: string) => request<RecipeVersion[]>(`/api/v1/community/posts/${postId}/versions`);
export const addVersion = (postId: string, formulationData: Record<string, unknown>[], releaseNotes: string | null) =>
    request<RecipeVersion>(`/api/v1/community/posts/${postId}/versions`, { method: 'POST', body: { formulation_data: formulationData, release_notes: releaseNotes } });

// ---- ratings

export const fetchRatings = (postId: string) => request<RecipeRating[]>(`/api/v1/community/posts/${postId}/ratings`);
export const rateRecipe = (postId: string, rating: RatingInput) => request<RecipeRating>(`/api/v1/community/posts/${postId}/rating`, { method: 'PUT', body: rating });
export const removeRating = (postId: string) => request<void>(`/api/v1/community/posts/${postId}/rating`, { method: 'DELETE' });

/** The scores of many recipes at once, in requests the backend accepts. */
export async function fetchRatingScores(postIds: string[]): Promise<{ post_id: string; overall: number; made_it: boolean }[]> {
    const groups: string[][] = [];
    for (let i = 0; i < postIds.length; i += 200) groups.push(postIds.slice(i, i + 200));
    const results = await Promise.all(groups.map(ids => request<{ post_id: string; overall: number; made_it: boolean }[]>('/api/v1/community/ratings', { method: 'POST', body: { post_ids: ids } })));
    return results.flat();
}

// ---- reading across posts

export async function fetchSharedCount(): Promise<number> {
    return (await request<{ count: number }>('/api/v1/community/stats/shared')).count;
}

/** The newest recipes by other members, each as of its latest version. `limited`: there may be more than were looked at. */
export const fetchCommunityRecipes = (limit: number) =>
    request<{ recipes: { id: string; title: string; author_name: string | null; formulation_data: Record<string, unknown>[] }[]; limited: boolean }>(`/api/v1/community/recipes?limit=${limit}`);

/** The newest shared recipes as anyone may see them before signing in: a title, a short excerpt and tags. No sign-in needed. */
export async function fetchRecipePreviews(limit = 3): Promise<RecipePreview[]> {
    const res = await fetch(`${API_BASE_URL}/api/v1/public/recipe-previews?limit=${limit}`);
    if (!res.ok) throw new Error('Could not load the recipes.');
    return ((await res.json()) as (Omit<RecipePreview, 'tags'> & { tags: unknown })[]).map(r => ({ ...r, tags: Array.isArray(r.tags) ? (r.tags as string[]) : [] }));
}

// ---- reports, moderators and muting

export async function reportContent(input: { targetType: 'post' | 'comment'; targetId: string; reason: string; details?: string }) {
    await request<void>('/api/v1/community/reports', { method: 'POST', body: { target_type: input.targetType, target_id: input.targetId, reason: input.reason, details: input.details?.trim() || null } });
}

export const listMutes = () => request<string[]>('/api/v1/community/mutes');
export const muteMember = (userId: string) => request<void>(`/api/v1/community/mutes/${userId}`, { method: 'PUT' });
export const unmuteMember = (userId: string) => request<void>(`/api/v1/community/mutes/${userId}`, { method: 'DELETE' });

export async function isModerator(): Promise<boolean> {
    try {
        return (await request<{ moderator: boolean }>('/api/v1/community/moderator')).moderator === true;
    } catch {
        return false;
    }
}

export const listOpenReports = () => request<Report[]>('/api/v1/community/reports/open');

/** Closes a report. `remove` also deletes what was reported (moderators may remove any post or comment). */
export async function resolveReport(report: Report, outcome: 'resolved' | 'dismissed', remove: boolean) {
    await request<void>(`/api/v1/community/reports/${report.id}/resolve`, { method: 'POST', body: { outcome, remove } });
}

// ---- notifications

export const fetchUnreadNotifications = () => request<Notification[]>('/api/v1/notifications');
export const markNotificationRead = (id: string) => request<void>(`/api/v1/notifications/${id}/read`, { method: 'PUT' });
