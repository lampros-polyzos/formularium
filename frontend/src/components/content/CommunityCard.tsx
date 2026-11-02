import { Link } from 'react-router-dom';
import { ArrowRight, Clock, Users } from 'lucide-react';
import type { CommunityArticle } from '../../content/community';
import { useSettings } from '../../contexts/SettingsContext';

interface CommunityCardProps {
    post: CommunityArticle;
    /** Where the card leads. Defaults to the community post page. */
    onOpen?: () => void;
    /** Logged-out visitors can read the preview, but the full post is for members. */
    membersOnly?: boolean;
}

export function CommunityBadge() {
    return (
        <span className="inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-sm border bg-purple-50 text-purple-700 border-purple-200">
            Community
        </span>
    );
}

export default function CommunityCard({ post, onOpen, membersOnly = false }: CommunityCardProps) {
    const { formatDate } = useSettings();
    const className = 'group flex flex-col text-left bg-white border border-[#c1d1b9] rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow h-full w-full';

    const content = (
        <>
            <div className="bg-gradient-to-br from-[#e6dcef] to-[#cdbde0] h-40 flex items-center justify-center text-purple-900/40">
                <Users size={44} strokeWidth={1.5} aria-hidden />
            </div>
            <div className="p-5 flex flex-col gap-2 flex-1">
                <CommunityBadge />
                <h3 className="text-lg font-bold text-[#1f382a] leading-snug group-hover:text-[#2c4c3b] group-hover:underline decoration-[#c1d1b9] underline-offset-4">
                    {post.title}
                </h3>
                {post.excerpt && <p className="text-sm text-gray-600 leading-relaxed line-clamp-3">{post.excerpt}</p>}
                <div className="mt-auto pt-2 space-y-1">
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                        <span>{formatDate(post.createdAt)}</span>
                        <span className="flex items-center gap-1"><Clock size={12} aria-hidden /> {post.minutes} min read</span>
                        {post.authorName && <span className="truncate">by {post.authorName}</span>}
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-purple-700">
                        {membersOnly ? 'Sign in to read the full post' : 'Read the post'} <ArrowRight size={12} />
                    </span>
                </div>
            </div>
        </>
    );

    return onOpen
        ? <button type="button" onClick={onOpen} className={className}>{content}</button>
        : <Link to={`/community/${post.id}`} className={className}>{content}</Link>;
}
