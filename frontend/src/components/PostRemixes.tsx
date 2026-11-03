import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import LineageNotice from './LineageNotice';
import { fetchPostSummary, fetchRemixes, type PostSummary } from '../lib/lineage';

/** "↻ Remixed from ..." under a post's title. Shows nothing when the original is gone. */
export function RemixedFrom({ originalPostId }: { originalPostId: string | null | undefined }) {
    const [loaded, setLoaded] = useState<{ id: string; post: PostSummary | null } | null>(null);

    useEffect(() => {
        if (!originalPostId) return;
        let cancelled = false;
        fetchPostSummary(originalPostId).then(post => { if (!cancelled) setLoaded({ id: originalPostId, post }); });
        return () => { cancelled = true; };
    }, [originalPostId]);

    if (!originalPostId || loaded?.id !== originalPostId) return null;
    return <LineageNotice remixedFrom={loaded.post} className="mb-4 -mt-4" />;
}

/** The recipes other people made starting from this one. Shows nothing when there are none. */
export function RemixList({ postId }: { postId: string }) {
    const [loaded, setLoaded] = useState<{ id: string; remixes: PostSummary[] } | null>(null);

    useEffect(() => {
        let cancelled = false;
        fetchRemixes(postId).then(remixes => { if (!cancelled) setLoaded({ id: postId, remixes }); });
        return () => { cancelled = true; };
    }, [postId]);

    if (loaded?.id !== postId || loaded.remixes.length === 0) return null;
    return (
        <section aria-label="Remixes" className="bg-white rounded-2xl shadow-sm border border-[#c1d1b9] overflow-hidden">
            <div className="bg-[#e9eee7] px-6 py-4 border-b border-[#c1d1b9]">
                <h3 className="text-lg font-bold text-[#1f382a]"><span aria-hidden>↻</span> Remixes ({loaded.remixes.length})</h3>
            </div>
            <ul className="divide-y divide-gray-100">
                {loaded.remixes.map(remix => (
                    <li key={remix.id} className="px-6 py-3 text-sm">
                        <Link to={`/community/${remix.id}`} className="font-semibold text-[#2c4c3b] hover:underline">{remix.title}</Link>
                        {remix.author_name && <span className="text-gray-500"> by {remix.author_name}</span>}
                    </li>
                ))}
            </ul>
        </section>
    );
}
