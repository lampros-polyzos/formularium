import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { toCommunityArticle, type CommunityArticle } from '../../content/community';

/** Education posts written by the community, newest first. Fails soft: the blog still works without them. */
export function useCommunityArticles() {
    const [posts, setPosts] = useState<CommunityArticle[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            const { data, error } = await supabase
                .from('community_posts')
                .select('id, title, write_up, tags, created_at, author_name')
                .eq('post_type', 'education')
                .order('created_at', { ascending: false });

            if (cancelled) return;
            if (error) console.error('Error loading community articles:', error);
            else setPosts((data ?? []).map(toCommunityArticle));
            setIsLoading(false);
        };
        load();
        return () => { cancelled = true; };
    }, []);

    return { posts, isLoading };
}
