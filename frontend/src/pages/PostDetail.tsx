import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import Header from '../components/Header';

type PostType = 'formulation' | 'discussion' | 'request' | 'education';
type DevStatus = 'concept' | 'in-testing' | 'stable' | null;

interface Post {
    id: string;
    title: string;
    write_up: string;
    tags: string[];
    post_type: PostType;
    development_status?: DevStatus;
    profile_name?: string;
    created_at: string;
    author_id: string;
}

interface SnapshotIngredient {
    name: string;
    inci_name?: string;
    phase: string;
    percentage: number;
    function?: string;
}

interface Comment {
    id: string;
    body: string;
    created_at: string;
    user_id: string;
}

export default function PostDetail() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { user } = useAuth();

    const [post, setPost] = useState<Post | null>(null);
    const [recipe, setRecipe] = useState<SnapshotIngredient[] | null>(null);
    const [comments, setComments] = useState<Comment[]>([]);
    const [newComment, setNewComment] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isCloning, setIsCloning] = useState(false);

    useEffect(() => {
        const fetchPostData = async () => {
            if (!id) return;
            setIsLoading(true);

            try {
                // 1. Fetch main post
                const { data: postData, error: postError } = await supabase
                    .from('community_posts')
                    .select('*')
                    .eq('id', id)
                    .single();

                if (postError) throw postError;

                const formattedPost = {
                    ...postData,
                    tags: Array.isArray(postData.tags) ? postData.tags : (postData.tags ? [postData.tags] : [])
                };
                setPost(formattedPost);

                // 2. If it's a formulation, fetch the snapshot
                if (formattedPost.post_type === 'formulation') {
                    const { data: snapData } = await supabase
                        .from('post_snapshots')
                        .select('formulation_data')
                        .eq('post_id', id)
                        .single();

                    if (snapData && snapData.formulation_data) {
                        let parsedData = snapData.formulation_data;

                        // If it was saved as a string, parse it
                        if (typeof parsedData === 'string') {
                            try {
                                parsedData = JSON.parse(parsedData);
                            } catch (e) {
                                parsedData = [];
                            }
                        }

                        // CRITICAL FIX: Ensure it is strictly an array before saving to state. 
                        // If it's an object like {}, fallback to an empty array.
                        setRecipe(Array.isArray(parsedData) ? parsedData : []);
                    }
                }

                // 3. Fetch general comments
                const { data: commentData } = await supabase
                    .from('post_comments')
                    .select('*')
                    .eq('post_id', id)
                    .order('created_at', { ascending: true });

                if (commentData) {
                    setComments(commentData);
                }

            } catch (error) {
                console.error("Error loading post:", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchPostData();
    }, [id]);

    const handleAddComment = async () => {
        if (!user || !newComment.trim() || !post) return;

        try {
            const { data, error } = await supabase
                .from('post_comments')
                .insert([{ post_id: post.id, user_id: user.id, body: newComment.trim() }])
                .select()
                .single();

            if (error) throw error;

            setComments([...comments, data]);
            setNewComment('');
        } catch (error) {
            console.error("Failed to post comment", error);
        }
    };

    const handleCloneRecipe = async () => {
        if (!user || !recipe || !post) return alert("Must be logged in to clone.");
        setIsCloning(true);

        try {
            // Create a new draft in the user's formulations table
            const { data: newDraft, error: draftError } = await supabase
                .from('formulations')
                .insert([{
                    name: `${post.title} (Cloned)`,
                    user_id: user.id,
                    status: 'Draft',
                    target_weight_g: 100 // default
                }])
                .select('id')
                .single();

            if (draftError) throw draftError;

            // Optional: You would map `recipe` array into `formulation_phases` and `formulation_ingredients` here.
            // For now, redirect to the studio with the new ID.

            navigate(`/studio/${newDraft.id}`);
        } catch (error) {
            console.error("Error cloning formulation", error);
            alert("Failed to clone formulation.");
        } finally {
            setIsCloning(false);
        }
    };

    if (isLoading) return <div className="min-h-screen p-10 flex justify-center text-gray-500 animate-pulse bg-[#f3f5f2]">Loading thread...</div>;
    if (!post) return <div className="min-h-screen p-10 text-center text-gray-500 bg-[#f3f5f2]">Post not found.</div>;

    const totalPercentage = Array.isArray(recipe) ? recipe.reduce((sum, item) => sum + (Number(item.percentage) || 0), 0) : 0;

    return (
        <div className="min-h-screen bg-[#f3f5f2] text-[#1f382a] font-sans">
            {/* Header Nav */}
            <Header
                title="Community Thread"
                backPath="/community"
                backLabel="Back to Hub"
            >
                {/* Custom Clone Button specifically for this page */}
                {post.post_type === 'formulation' && recipe && (
                    <>
                        <button
                            onClick={handleCloneRecipe}
                            disabled={isCloning}
                            className="px-4 py-1.5 bg-[#1f382a] text-white text-xs rounded-lg font-bold hover:bg-[#2c4c3b] transition-colors shadow-sm disabled:opacity-50"
                        >
                            {isCloning ? 'Cloning...' : '⎘ Clone'}
                        </button>
                        <span className="text-gray-400">|</span>
                    </>
                )}
            </Header>

            <div className="max-w-5xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Main Content Area */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Title & Write-up */}
                    <div className="bg-white rounded-2xl shadow-sm border border-[#c1d1b9] overflow-hidden">
                        <div className="p-8 pb-6 border-b border-gray-100">
                            <div className="flex gap-2 items-center mb-4">
                                <span className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-sm bg-[#e9eee7] text-[#2c4c3b] border border-[#c1d1b9]">
                                    {post.post_type}
                                </span>
                                {post.development_status && (
                                    <span className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-sm bg-blue-50 text-blue-600 border border-blue-200">
                                        {post.development_status}
                                    </span>
                                )}
                                {post.profile_name && (
                                    <span className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-sm bg-purple-50 text-purple-700 border border-purple-200">
                                        {post.profile_name}
                                    </span>
                                )}
                            </div>
                            <h1 className="text-3xl font-bold text-[#1f382a] mb-4">{post.title}</h1>
                            <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap">
                                {post.write_up || "No detailed description provided."}
                            </div>
                        </div>
                    </div>

                    {/* Read-Only Recipe Table (If Formulation) */}
                    {post.post_type === 'formulation' && recipe && (
                        <div className="bg-white rounded-2xl shadow-sm border border-[#c1d1b9] overflow-hidden">
                            <div className="bg-[#e9eee7] px-6 py-4 border-b border-[#c1d1b9] flex justify-between items-center">
                                <h3 className="font-bold text-[#1f382a]">Formulation Snapshot</h3>
                                <span className="text-sm font-mono font-bold text-[#2c4c3b]">{totalPercentage.toFixed(2)}% Total</span>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse text-sm">
                                    <thead>
                                        <tr className="bg-gray-50 text-gray-500 border-b border-gray-200">
                                            <th className="px-6 py-3 font-medium w-16 text-center">Phase</th>
                                            <th className="px-6 py-3 font-medium">Ingredient</th>
                                            <th className="px-6 py-3 font-medium text-right w-24">Target %</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {/* CRITICAL FIX: Add safe fallbacks for the sort function */}
                                        {Array.isArray(recipe) && [...recipe].sort((a, b) => (a.phase || '').localeCompare(b.phase || '')).map((item, idx) => (
                                            <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                                <td className="px-6 py-3 text-center font-bold text-gray-700">{item.phase || '-'}</td>
                                                <td className="px-6 py-3">
                                                    <div className="font-medium text-[#1f382a]">{item.name || 'Unknown Ingredient'}</div>
                                                    {item.inci_name && <div className="text-[10px] text-gray-500">{item.inci_name}</div>}
                                                </td>
                                                <td className="px-6 py-3 text-right font-mono font-medium text-[#2c4c3b]">
                                                    {Number(item.percentage || 0).toFixed(2)}%
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Discussion / Comments Section */}
                    <div className="bg-white rounded-2xl shadow-sm border border-[#c1d1b9] overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
                            <h3 className="font-bold text-[#1f382a]">Discussion ({comments.length})</h3>
                        </div>
                        <div className="p-6 space-y-6">
                            {comments.length === 0 ? (
                                <p className="text-sm text-gray-500 text-center italic">No comments yet. Start the conversation!</p>
                            ) : (
                                comments.map(comment => (
                                    <div key={comment.id} className="flex gap-4">
                                        <div className="w-8 h-8 rounded-full bg-[#c1d1b9] flex items-center justify-center text-white font-bold shrink-0">
                                            {/* Placeholder Avatar */} U
                                        </div>
                                        <div>
                                            <div className="flex items-baseline gap-2 mb-1">
                                                <span className="font-bold text-sm text-[#1f382a]">User</span>
                                                <span className="text-[10px] text-gray-400">{new Date(comment.created_at).toLocaleString()}</span>
                                            </div>
                                            <p className="text-sm text-gray-700 whitespace-pre-wrap">{comment.body}</p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Add Comment Input */}
                        <div className="p-4 bg-gray-50 border-t border-gray-100 flex gap-3">
                            <textarea
                                value={newComment}
                                onChange={(e) => setNewComment(e.target.value)}
                                placeholder="Add a comment or ask a question..."
                                className="flex-1 border border-gray-300 rounded-lg p-3 text-sm outline-none focus:ring-2 focus:ring-[#2c4c3b] resize-none h-14"
                            />
                            <button
                                onClick={handleAddComment}
                                disabled={!newComment.trim()}
                                className="px-6 bg-[#2c4c3b] text-white rounded-lg font-bold text-sm hover:bg-[#1f382a] disabled:opacity-50 transition-colors"
                            >
                                Post
                            </button>
                        </div>
                    </div>
                </div>

                {/* Sidebar */}
                <div className="space-y-6">
                    <div className="bg-white rounded-2xl shadow-sm border border-[#c1d1b9] p-6">
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Post Info</h4>
                        <div className="space-y-3 text-sm">
                            <div className="flex justify-between border-b border-gray-50 pb-2">
                                <span className="text-gray-500">Posted</span>
                                <span className="font-medium">{new Date(post.created_at).toLocaleDateString()}</span>
                            </div>
                            <div className="flex justify-between border-b border-gray-50 pb-2">
                                <span className="text-gray-500">Author</span>
                                <span className="font-medium text-[#2c4c3b]">Verified Chemist</span>
                            </div>
                        </div>

                        {post.tags && post.tags.length > 0 && (
                            <div className="mt-6">
                                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Tags</h4>
                                <div className="flex flex-wrap gap-2">
                                    {post.tags.map(tag => (
                                        <span key={tag} className="text-[11px] bg-gray-100 text-gray-600 px-2.5 py-1 rounded-md font-medium">
                                            #{tag}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}