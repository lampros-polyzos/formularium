import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import NewPostModal from '../components/NewPostModal';
import Header from '../components/Header';
import RatingSummary from '../components/RatingSummary';
import { sortPosts, summarizeRatings, type RatingRow, type RatingStats, type SortMode } from '../lib/ratingStats';

import { useCommunityMutes } from '../hooks/useCommunityMutes';
import { useIsModerator } from '../hooks/useIsModerator';
import { postTypeInfo, storedTypesFor, type PostType } from '../lib/postTypes';
type DevStatus = 'concept' | 'in-testing' | 'stable' | null;

interface CommunityPost {
    id: string;
    title: string;
    write_up: string;
    tags: string[] | null;
    post_type: PostType;
    development_status?: DevStatus;
    answered_at?: string | null;
    author_name?: string | null;
    created_at: string;
    author_id: string;
    /** Set when the recipe started as another community recipe. */
    remixed_from_post_id?: string | null;
}

const POPULAR_TAGS = [
    'skincare', 'haircare', 'o/w-emulsion', 'anhydrous',
    'beginner-friendly', 'advanced', 'vegan', 'cosmos-compliant'
];

export default function CommunityFeed() {
    const [posts, setPosts] = useState<CommunityPost[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<PostType | 'all'>('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTags, setActiveTags] = useState<string[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [sortMode, setSortMode] = useState<SortMode>('newest');
    const { muted, unmute } = useCommunityMutes();
    const isModerator = useIsModerator();
    const [showMuted, setShowMuted] = useState(false);
    const [ratingStats, setRatingStats] = useState<Map<string, RatingStats>>(new Map());

    // Ratings are a bonus: if they can't be loaded, the feed still works without them
    const loadRatings = async (recipeIds: string[]) => {
        try {
            const rows: RatingRow[] = [];
            for (let i = 0; i < recipeIds.length; i += 100) { // keep each request's address short
                const { data, error } = await supabase
                    .from('recipe_ratings')
                    .select('post_id, overall, made_it')
                    .in('post_id', recipeIds.slice(i, i + 100));
                if (error) throw error;
                rows.push(...((data ?? []) as RatingRow[]));
            }
            setRatingStats(summarizeRatings(rows));
        } catch (error) {
            console.error("Error fetching recipe ratings:", error);
            setRatingStats(new Map());
        }
    };

    useEffect(() => {
        const fetchPosts = async () => {
            setIsLoading(true);
            try {
                let query = supabase
                    .from('community_posts')
                    .select('*')
                    .order('created_at', { ascending: false });

                if (activeTab !== 'all') {
                    query = query.in('post_type', storedTypesFor(activeTab));
                }

                const { data, error } = await query;

                if (error) throw error;

                const formattedData = (data || []).map(post => ({
                    ...post,
                    tags: Array.isArray(post.tags) ? post.tags : (post.tags ? [post.tags] : [])
                }));

                setPosts(formattedData);
                await loadRatings(formattedData.filter(p => p.post_type === 'formulation').map(p => p.id));
            } catch (error) {
                console.error("Error fetching community posts:", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchPosts();
    }, [activeTab]);

    const toggleTag = (tag: string) => {
        setActiveTags(prev =>
            prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
        );
    };

    // Filter by search term AND selected tags
    const filteredPosts = posts.filter(post => {
        if (post.author_id && muted.includes(post.author_id)) return false;
        const lowerSearch = searchTerm.toLowerCase();
        const matchesSearch = !searchTerm ||
            post.title?.toLowerCase().includes(lowerSearch) ||
            post.tags?.some(tag => tag.toLowerCase().includes(lowerSearch));

        const matchesTags = activeTags.length === 0 ||
            activeTags.every(activeTag => post.tags?.includes(activeTag));

        return matchesSearch && matchesTags;
    });

    const visiblePosts = sortPosts(filteredPosts, ratingStats, sortMode);

    const getTypeLabel = (type: string) => postTypeInfo(type);

    const getStatusBadge = (status?: DevStatus) => {
        switch (status) {
            case 'concept': return <span className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200">💡 Concept</span>;
            case 'in-testing': return <span className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200">⏳ In Testing</span>;
            case 'stable': return <span className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">✓ Stable</span>;
            default: return null;
        }
    };

    return (
        <div className="min-h-screen bg-[#f7f8f6] text-[#1f382a] font-sans">
            <Header title="Community Hub" backPath="/studio" backLabel="Back to Studio" />
            <div className="max-w-6xl mx-auto p-4 sm:p-6">
                <div className="flex flex-wrap justify-between items-end gap-4 mb-8">
                    <div>
                        <h1 className="text-3xl font-bold">Community Hub</h1>
                        <p className="text-gray-600 mt-1">Discover formulas, ask questions, and learn from other chemists.</p>
                    </div>
                    <div className="flex items-center gap-3">
                    {isModerator && <Link to="/community/moderation" className="text-sm font-semibold text-[#2c4c3b] underline">Moderation</Link>}
                    {muted.length > 0 && (
                        <button onClick={() => setShowMuted(v => !v)} className="text-sm font-semibold text-gray-600 underline">
                            Muted members ({muted.length})
                        </button>
                    )}
                    <button
                        onClick={() => setIsModalOpen(true)}
                        className="px-5 py-2.5 bg-[#1f382a] text-white rounded-lg font-medium hover:bg-[#2c4c3b] transition-colors shadow-sm"
                    >
                        + New Post
                    </button>
                    </div>
                </div>

                {showMuted && muted.length > 0 && (
                    <div className="mb-6 bg-white p-4 rounded-xl border border-[#c1d1b9]" aria-label="Muted members">
                        <p className="text-sm text-gray-600 mb-3">You do not see posts or comments from these members.</p>
                        <ul className="space-y-2">
                            {muted.map(id => {
                                const name = posts.find(p => p.author_id === id)?.author_name || 'Member';
                                return (
                                    <li key={id} className="flex items-center justify-between text-sm">
                                        <span>{name}</span>
                                        <button onClick={() => { void unmute(id); }} className="font-semibold text-[#2c4c3b] underline">Unmute</button>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                )}

                <div className="flex flex-col gap-4 mb-8 bg-white p-4 rounded-xl shadow-sm border border-[#c1d1b9]">
                    {/* Top Row: Main Filters & Search */}
                    <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                        <div className="flex space-x-2 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
                            {([{ id: 'all', label: 'All' }, ...(['formulation', 'discussion', 'advice', 'information'] as const).map(id => postTypeInfo(id))] as { id: PostType | 'all'; label: string }[]).map((tab) => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    aria-pressed={activeTab === tab.id}
                                    className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap border ${activeTab === tab.id
                                        ? 'bg-[#2c4c3b] text-white border-[#2c4c3b]'
                                        : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                                        }`}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        <div className="flex w-full md:w-auto items-center gap-3">
                        <label className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-wider shrink-0">
                            Sort
                            <select
                                value={sortMode}
                                onChange={(e) => setSortMode(e.target.value as SortMode)}
                                aria-label="Sort posts"
                                title="Top rated weighs how many people rated a recipe, so one 5-star rating doesn't beat many 4.8s"
                                className="normal-case tracking-normal text-sm font-medium text-gray-700 border border-gray-300 rounded-lg px-2 py-2 bg-white outline-none focus:ring-2 focus:ring-[#2c4c3b]"
                            >
                                <option value="newest">Newest</option>
                                <option value="top">Top rated</option>
                                <option value="made">Most made</option>
                            </select>
                        </label>
                        <div className="relative w-full md:w-72">
                            <input
                                type="text"
                                placeholder="Search topics or tags..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2c4c3b] outline-none text-sm"
                            />
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
                        </div>
                        </div>
                    </div>

                    {/* Bottom Row: Standardized Tags Filter */}
                    <div className="pt-3 border-t border-gray-100 flex items-center gap-3 overflow-x-auto pb-1">
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider shrink-0">Filter by Tag:</span>
                        {POPULAR_TAGS.map(tag => (
                            <button
                                key={tag}
                                onClick={() => toggleTag(tag)}
                                className={`text-[11px] px-2.5 py-1 rounded-md font-medium transition-colors whitespace-nowrap ${activeTags.includes(tag)
                                    ? 'bg-[#e9eee7] text-[#2c4c3b] border border-[#c1d1b9]'
                                    : 'bg-white text-gray-500 border border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                                    }`}
                            >
                                #{tag}
                            </button>
                        ))}
                        {activeTags.length > 0 && (
                            <button
                                onClick={() => setActiveTags([])}
                                className="text-[11px] text-red-500 hover:underline shrink-0 ml-1 font-medium"
                            >
                                Clear tags
                            </button>
                        )}
                    </div>
                </div>

                {isLoading ? (
                    <div className="flex justify-center py-20 text-gray-500 animate-pulse">Loading community posts...</div>
                ) : visiblePosts.length === 0 ? (
                    <div className="text-center py-20 bg-white rounded-xl border border-dashed border-[#c1d1b9] text-gray-500">
                        No posts found matching your criteria. Be the first to start a conversation!
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {visiblePosts.map(post => {
                            const typeMeta = getTypeLabel(post.post_type);

                            return (
                                <Link
                                    key={post.id}
                                    to={`/community/${post.id}`}
                                    className="block bg-white rounded-xl shadow-sm border border-[#c1d1b9] overflow-hidden hover:shadow-md hover:border-[#2c4c3b] transition-all group flex flex-col h-full relative"
                                >
                                    <div className="p-5 flex-1 flex flex-col">
                                        <div className="flex justify-between items-start mb-3">
                                            <span className={`text-xs font-bold px-2 py-1 rounded border flex items-center gap-1 ${typeMeta.color}`}>
                                                {typeMeta.icon} {typeMeta.label}
                                            </span>
                                            <div className="flex items-center gap-1.5">
                                                {/* Formulation Status Badge (renders only if applicable) */}
                                                {post.post_type === 'formulation' && getStatusBadge(post.development_status)}
                                                {(post.post_type === 'advice' || post.post_type === ('request' as string)) && post.answered_at && (
                                                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-sm bg-green-50 text-green-700 border border-green-200">✓ Answered</span>
                                                )}
                                                {post.remixed_from_post_id && (
                                                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-sm bg-[#e9eee7] text-[#2c4c3b] border border-[#c1d1b9]" title="This recipe started as another community recipe">↻ Remix</span>
                                                )}
                                            </div>
                                        </div>

                                        <h3 className="text-lg font-bold text-[#1f382a] mb-2 group-hover:text-[#2c4c3b] line-clamp-2 pr-12">
                                            {post.title}
                                        </h3>

                                        {post.post_type === 'formulation' && <RatingSummary stats={ratingStats.get(post.id)} />}

                                        <p className="text-sm text-gray-600 line-clamp-3 mb-4 flex-1">
                                            {post.write_up.replace(/<[^>]+>/g, '') || "No description provided."}
                                        </p>

                                        <div className="flex flex-wrap gap-1.5 mt-auto pt-4 border-t border-gray-100 items-center justify-between">
                                            <div className="flex flex-wrap gap-1.5 flex-1">
                                                {post.tags && post.tags.slice(0, 3).map((tag, idx) => (
                                                    <span
                                                        key={idx}
                                                        onClick={(e) => {
                                                            e.preventDefault(); // Prevent navigating to PostDetail
                                                            toggleTag(tag);
                                                        }}
                                                        className="text-[10px] bg-gray-50 border border-gray-200 text-gray-600 px-2 py-0.5 rounded-sm font-medium hover:bg-[#e9eee7] hover:text-[#2c4c3b] transition-colors cursor-pointer"
                                                    >
                                                        #{tag}
                                                    </span>
                                                ))}
                                                {post.tags && post.tags.length > 3 && (
                                                    <span className="text-[10px] text-gray-400 px-1 py-0.5">+{post.tags.length - 3}</span>
                                                )}
                                            </div>
                                            <span className="text-[10px] text-gray-400 shrink-0">
                                                {new Date(post.created_at).toLocaleDateString()}
                                            </span>
                                        </div>
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                )}
            </div>
            <NewPostModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSuccess={() => {
                    // Re-trigger the fetchPosts useEffect by briefly toggling the tab or manually recalling the fetch function.
                    // Easiest way: force a re-render by setting activeTab to 'all'.
                    setActiveTab('all');
                }}
            />
        </div>
    );
}