// The kinds of post in the community. These words are stored in the database (community_posts.post_type), so change them
// only together with a migration.

export type PostType = 'formulation' | 'discussion' | 'advice' | 'information';

export interface PostTypeInfo {
    id: PostType;
    label: string;
    /** What the post is for, shown when choosing a type. */
    hint: string;
    icon: string;
    color: string;
}

/** In the order they are offered. */
export const POST_TYPES: PostTypeInfo[] = [
    { id: 'discussion', label: 'Discussion', hint: 'Start a conversation', icon: '💬', color: 'bg-blue-100 text-blue-800 border-blue-200' },
    { id: 'advice', label: 'Advice', hint: 'Ask for advice', icon: '🙋', color: 'bg-amber-100 text-amber-800 border-amber-200' },
    { id: 'information', label: 'Information', hint: 'Share useful information', icon: '💡', color: 'bg-purple-100 text-purple-800 border-purple-200' },
    { id: 'formulation', label: 'Recipe', hint: 'Share a formula', icon: '🧪', color: 'bg-green-100 text-green-800 border-green-200' },
];

/** The names these kinds had before, which may still be in the database until the migration has been run. */
export const LEGACY_POST_TYPES: Record<string, PostType> = { request: 'advice', education: 'information' };

const FALLBACK: PostTypeInfo = { id: 'discussion', label: 'Post', hint: '', icon: '📄', color: 'bg-gray-100 text-gray-800 border-gray-200' };

/** The kind of a stored post, understanding the old names too. Unknown kinds are shown as a plain post. */
export function postTypeInfo(raw: string | null | undefined): PostTypeInfo {
    const id = LEGACY_POST_TYPES[raw ?? ''] ?? raw;
    return POST_TYPES.find(t => t.id === id) ?? FALLBACK;
}

/** What to ask the database for to get every post of a kind: its name, plus the old name it may still have. */
export function storedTypesFor(type: PostType): string[] {
    return [type, ...Object.entries(LEGACY_POST_TYPES).filter(([, current]) => current === type).map(([old]) => old)];
}
