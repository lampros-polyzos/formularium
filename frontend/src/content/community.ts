// Community "Education" posts are shown in the blog next to the editorial articles.

export interface CommunityRow {
    id: string;
    title: string;
    write_up: string | null;
    tags: string[] | string | null;
    created_at: string;
    author_name?: string | null;
}

export interface CommunityArticle {
    id: string;
    title: string;
    excerpt: string;
    tags: string[];
    createdAt: string;
    authorName: string | null;
    minutes: number;
}

const EXCERPT_LENGTH = 170;

/** First ~170 characters of plain text, cut at a word boundary. */
export function excerptOf(text: string | null, max = EXCERPT_LENGTH): string {
    const clean = (text ?? '').replace(/\s+/g, ' ').trim();
    if (clean.length <= max) return clean;
    const cut = clean.slice(0, max);
    return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max / 2))}...`;
}

export function toCommunityArticle(row: CommunityRow): CommunityArticle {
    const words = (row.write_up ?? '').split(/\s+/).filter(Boolean).length;
    return {
        id: row.id,
        title: row.title,
        excerpt: excerptOf(row.write_up),
        tags: Array.isArray(row.tags) ? row.tags : row.tags ? [row.tags] : [],
        createdAt: row.created_at,
        authorName: row.author_name ?? null,
        minutes: Math.max(1, Math.round(words / 200)),
    };
}

export function communityText(post: CommunityArticle): string {
    return `${post.title} ${post.excerpt} ${post.tags.join(' ')} ${post.authorName ?? ''}`;
}
