import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import NewPostModal from '../components/NewPostModal';

type PostType = 'formulation' | 'discussion' | 'request' | 'education';
type DevStatus = 'concept' | 'in-testing' | 'stable' | null;

interface CommunityPost {
    id: string;
    title: string;
    write_up: string;
    tags: string[] | null;
    post_type: PostType;
    development_status?: DevStatus;
    created_at: string;
    author_id: string;
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

    useEffect(() => {
        const fetchPosts = async () => {
            setIsLoading(true);
            try {
                let query = supabase
                    .from('community_posts')
                    .select('*')
                    .order('created_at', { ascending: false });

                if (activeTab !== 'all') {
                    query = query.eq('post_type', activeTab);
                }

                const { data, error } = await query;

                if (error) throw error;

                const formattedData = (data || []).map(post => ({
                    ...post,
                    tags: Array.isArray(post.tags) ? post.tags : (post.tags ? [post.tags] : [])
                }));

                setPosts(formattedData);
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
        const lowerSearch = searchTerm.toLowerCase();
        const matchesSearch = !searchTerm ||
            post.title?.toLowerCase().includes(lowerSearch) ||
            post.tags?.some(tag => tag.toLowerCase().includes(lowerSearch));

        const matchesTags = activeTags.length === 0 ||
            activeTags.every(activeTag => post.tags?.includes(activeTag));

        return matchesSearch && matchesTags;
    });

    const getTypeLabel = (type: PostType) => {
        switch (type) {
            case 'formulation': return { label: 'Recipe', icon: '🧪', color: 'bg-green-100 text-green-800 border-green-200' };
            case 'discussion': return { label: 'Discussion', icon: '💬', color: 'bg-blue-100 text-blue-800 border-blue-200' };
            case 'request': return { label: 'Request', icon: '✋', color: 'bg-amber-100 text-amber-800 border-amber-200' };
            case 'education': return { label: 'Education', icon: '📚', color: 'bg-purple-100 text-purple-800 border-purple-200' };
            default: return { label: 'Post', icon: '📄', color: 'bg-gray-100 text-gray-800 border-gray-200' };
        }
    };

    const getStatusBadge = (status?: DevStatus) => {
        switch (status) {
            case 'concept': return <span className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200">💡 Concept</span>;
            case 'in-testing': return <span className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200">⏳ In Testing</span>;
            case 'stable': return <span className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">✓ Stable</span>;
            default: return null;
        }
    };

    return (
        <div className="min-h-screen bg-[#f3f5f2] text-[#1f382a] font-sans p-6">
            <div className="max-w-6xl mx-auto">
                <div className="flex justify-between items-end mb-8">
                    <div>
                        <h1 className="text-3xl font-bold">Community Hub</h1>
                        <p className="text-gray-600 mt-1">Discover formulas, ask questions, and learn from other chemists.</p>
                    </div>
                    <button
                        onClick={() => setIsModalOpen(true)}
                        className="px-5 py-2.5 bg-[#1f382a] text-white rounded-lg font-medium hover:bg-[#2c4c3b] transition-colors shadow-sm"
                    >
                        + New Post
                    </button>
                </div>

                <div className="flex flex-col gap-4 mb-8 bg-white p-4 rounded-xl shadow-sm border border-[#c1d1b9]">
                    {/* Top Row: Main Filters & Search */}
                    <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                        <div className="flex space-x-2 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
                            {(['all', 'formulation', 'discussion', 'request', 'education'] as const).map((tab) => (
                                <button
                                    key={tab}
                                    onClick={() => setActiveTab(tab)}
                                    className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap border ${activeTab === tab
                                        ? 'bg-[#2c4c3b] text-white border-[#2c4c3b]'
                                        : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                                        }`}
                                >
                                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                                </button>
                            ))}
                        </div>

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
                ) : filteredPosts.length === 0 ? (
                    <div className="text-center py-20 bg-white rounded-xl border border-dashed border-[#c1d1b9] text-gray-500">
                        No posts found matching your criteria. Be the first to start a conversation!
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredPosts.map(post => {
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
                                            {/* Formulation Status Badge (renders only if applicable) */}
                                            {post.post_type === 'formulation' && getStatusBadge(post.development_status)}
                                        </div>

                                        <h3 className="text-lg font-bold text-[#1f382a] mb-2 group-hover:text-[#2c4c3b] line-clamp-2 pr-12">
                                            {post.title}
                                        </h3>

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