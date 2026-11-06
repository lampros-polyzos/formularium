import { fetchPost, fetchRemixes as fetchPostRemixes } from './communityApi';
import { fetchFormula } from './formulasApi';

// "Remixed from" links. A copy points back at what it came from; deleting the original only clears the link.

export interface PostSummary { id: string; title: string; author_name: string | null; created_at?: string }
export interface FormulaSummary { id: string; name: string }

/** The recipe a post or formula was remixed from, or null if it is gone or can't be read. */
export async function fetchPostSummary(postId: string): Promise<PostSummary | null> {
    try {
        const post = await fetchPost(postId);
        return { id: post.id, title: post.title, author_name: post.author_name };
    } catch (error) {
        console.warn('Could not load the original recipe:', error instanceof Error ? error.message : error);
        return null;
    }
}

/** The formula a copy was made from. Only the owner can read it, so this is null for anyone else. */
export async function fetchFormulaSummary(formulaId: string): Promise<FormulaSummary | null> {
    try {
        const formula = await fetchFormula(formulaId);
        return { id: formula.id, name: formula.name };
    } catch (error) {
        console.warn('Could not load the original formula:', error instanceof Error ? error.message : error);
        return null;
    }
}

/** Posts that are remixes of this one, newest first. */
export async function fetchRemixes(postId: string, limit = 10): Promise<PostSummary[]> {
    try {
        return await fetchPostRemixes(postId, limit);
    } catch (error) {
        console.warn('Could not load remixes:', error instanceof Error ? error.message : error);
        return [];
    }
}
