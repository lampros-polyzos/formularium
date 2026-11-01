import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import Header from '../components/Header';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';

interface Snapshot {
    version: number;
    formulation_data: any[];
    release_notes: string;
    created_at: string;
}

interface Comment {
    id: string;
    content: string;
    author_name: string;
    created_at: string;
}

export default function PostDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user, username } = useAuth(); // Destructure username for comments
    const { formatDate } = useSettings();

    const [post, setPost] = useState<any>(null);
    const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
    const [activeVersion, setActiveVersion] = useState<number>(1);
    const [isLoading, setIsLoading] = useState(true);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isCloning, setIsCloning] = useState(false);

    // Rating & Comments States
    const [comments, setComments] = useState<Comment[]>([]);
    const [newComment, setNewComment] = useState('');
    const [isSubmittingComment, setIsSubmittingComment] = useState(false);
    const [score, setScore] = useState(0);
    const [userVote, setUserVote] = useState<number>(0);
    const [isVoting, setIsVoting] = useState(false);

    useEffect(() => {
        const fetchPostData = async () => {
            if (!id) return;
            try {
                // 1. Fetch Post Details
                const { data: postData } = await supabase.from('community_posts').select('*').eq('id', id).single();
                setPost(postData);

                // 2. Fetch all snapshot versions if it's a formulation
                if (postData?.post_type === 'formulation') {
                    const { data: snapData } = await supabase
                        .from('post_snapshots')
                        .select('version, formulation_data, release_notes, created_at')
                        .eq('post_id', id)
                        .order('version', { ascending: true }); // v1, v2, v3...

                    if (snapData && snapData.length > 0) {
                        const parsedSnaps = snapData.map(snap => {
                            let parsed = snap.formulation_data;
                            if (typeof parsed === 'string') {
                                try { parsed = JSON.parse(parsed); } catch (e) { parsed = []; }
                            }
                            return { ...snap, formulation_data: Array.isArray(parsed) ? parsed : [] };
                        });

                        setSnapshots(parsedSnaps);
                        setActiveVersion(parsedSnaps[parsedSnaps.length - 1].version); // Default to latest
                    }
                }

                // 3. Fetch Comments
                const { data: commentData } = await supabase
                    .from('post_comments')
                    .select('*')
                    .eq('post_id', id)
                    .order('created_at', { ascending: true });
                if (commentData) setComments(commentData);

                // 4. Fetch Votes
                const { data: voteData } = await supabase
                    .from('post_votes')
                    .select('user_id, vote_value')
                    .eq('post_id', id);

                if (voteData) {
                    const totalScore = voteData.reduce((acc, curr) => acc + curr.vote_value, 0);
                    setScore(totalScore);
                    if (user) {
                        const myVote = voteData.find(v => v.user_id === user.id);
                        if (myVote) setUserVote(myVote.vote_value);
                    }
                }
            } catch (error) {
                console.error("Error loading post:", error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchPostData();
    }, [id, user]);

    if (isLoading) return <div className="p-10 text-center">Loading...</div>;
    if (!post) return <div className="p-10 text-center">Post not found.</div>;

    const currentSnapshot = snapshots.find(s => s.version === activeVersion);
    const previousSnapshot = snapshots.find(s => s.version === activeVersion - 1);
    const recipe = currentSnapshot?.formulation_data || [];

    // Helper to calculate visual diffs
    const getDiffBadge = (currentItem: any) => {
        if (!previousSnapshot) return null; // No diff on v1

        const prevItem = previousSnapshot.formulation_data.find((p: any) => p.inci_name === currentItem.inci_name || p.name === currentItem.name);

        if (!prevItem) return <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-bold ml-2">NEW</span>;

        const diff = Number(currentItem.percentage) - Number(prevItem.percentage);
        if (Math.abs(diff) < 0.01) return null; // No change

        return (
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ml-2 ${diff > 0 ? 'bg-blue-50 text-blue-600' : 'bg-red-50 text-red-600'}`}>
                {diff > 0 ? '↑' : '↓'} {Math.abs(diff).toFixed(2)}%
            </span>
        );
    };

    // Rating Logic
    const handleVote = async (value: number) => {
        if (!user) return alert("You must be logged in to vote.");
        if (post && user.id === post.author_id) return alert("You cannot rate your own post.");
        if (isVoting) return; // Prevent spam clicking

        setIsVoting(true);

        const newVoteValue = userVote === value ? 0 : value;
        const scoreDifference = newVoteValue - userVote;

        // Optimistic update
        setScore(prev => prev + scoreDifference);
        setUserVote(newVoteValue);

        try {
            if (newVoteValue === 0) {
                await supabase.from('post_votes').delete().match({ post_id: id, user_id: user.id });
            } else {
                await supabase.from('post_votes').upsert({
                    post_id: id as string,
                    user_id: user.id,
                    vote_value: newVoteValue
                });
            }
        } catch (error) {
            console.error("Error voting:", error);
            // Revert on failure
            setScore(prev => prev - scoreDifference);
            setUserVote(userVote);
        } finally {
            setIsVoting(false);
        }
    };

    // Comment Logic
    const handleAddComment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return alert("You must be logged in to comment.");
        if (!newComment.trim()) return;

        setIsSubmittingComment(true);
        try {
            const { data, error } = await supabase
                .from('post_comments')
                .insert([{
                    post_id: id as string,
                    author_id: user.id,
                    author_name: username || 'Anonymous Formulary',
                    content: newComment.trim()
                }])
                .select('*')
                .single();

            if (error) throw error;
            if (data) setComments(prev => [...prev, data]);
            setNewComment('');
        } catch (error: any) {
            alert(`Failed to post comment: ${error.message}`);
        } finally {
            setIsSubmittingComment(false);
        }
    };

    const handleCloneRecipe = async () => {
        if (!user) return alert("You must be logged in to clone a recipe.");
        if (!recipe || recipe.length === 0) return alert("No recipe data available to clone.");

        setIsCloning(true);
        try {
            // 1. Create a new formulation draft in the user's studio
            const { data: newDraft, error: draftError } = await supabase
                .from('formulations')
                .insert([{
                    name: `${post.title} (Clone)`,
                    user_id: user.id,
                    status: 'Draft',
                    target_weight_g: 100
                }])
                .select('id')
                .single();

            if (draftError) throw draftError;

            // 2. Extract unique phases from the recipe snapshot
            const uniquePhases = Array.from(new Set(recipe.map((ing: any) => ing.phase)));

            if (uniquePhases.length > 0) {
                // 3. Create the phases in the database
                const phasesToInsert = uniquePhases.map(phaseLetter => ({
                    formulation_id: newDraft.id,
                    phase_letter: phaseLetter
                }));

                const { data: insertedPhases, error: phaseError } = await supabase
                    .from('formulation_phases')
                    .insert(phasesToInsert)
                    .select('id, phase_letter');

                if (phaseError) throw phaseError;

                // 4. Map the ingredients to the newly created phase IDs
                const ingredientsToInsert = recipe.map((ing: any) => {
                    const matchedPhase = insertedPhases.find(p => p.phase_letter === ing.phase);
                    return {
                        phase_id: matchedPhase!.id,
                        ingredient_id: ing.id || ing.ingredient_id,
                        percentage: ing.percentage,
                        is_qs: false
                    };
                });

                const { error: ingredientsError } = await supabase
                    .from('formulation_ingredients')
                    .insert(ingredientsToInsert);

                if (ingredientsError) throw ingredientsError;
            }

            // 5. Navigate the user directly to their new private clone
            navigate(`/studio/${newDraft.id}`);

        } catch (error: any) {
            console.error("Error cloning:", error);
            alert(`Failed to clone: ${error.message}`);
        } finally {
            setIsCloning(false);
        }
    };

    const handleDeletePost = async () => {
        if (!window.confirm("Are you sure you want to delete this post? This cannot be undone.")) return;

        setIsDeleting(true);
        try {
            // Delete the post (snapshots will auto-delete via CASCADE)
            const { error } = await supabase
                .from('community_posts')
                .delete()
                .eq('id', id);

            if (error) throw error;

            // Navigate back to the hub after successful deletion
            navigate('/community');
        } catch (error: any) {
            console.error("Error deleting post:", error);
            alert(`Failed to delete post: ${error.message}`);
            setIsDeleting(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#f7f8f6]">
            <Header title="Community Thread" backPath="/community" backLabel="Back to Hub">
                {post.post_type === 'formulation' && recipe && recipe.length > 0 && (
                    <>
                        <button
                            onClick={handleCloneRecipe}
                            disabled={isCloning}
                            className="px-4 py-1.5 bg-[#1f382a] text-white text-xs rounded-lg font-bold hover:bg-[#2c4c3b] transition-colors shadow-sm disabled:opacity-50"
                        >
                            {isCloning ? 'Cloning...' : '⎘ Clone to Studio'}
                        </button>
                        <span className="text-gray-400">|</span>
                    </>
                )}
            </Header>

            <main className="max-w-4xl mx-auto p-6 md:p-10 space-y-6">

                {/* Main Post Card */}
                <div className="bg-white rounded-2xl shadow-sm border border-[#c1d1b9] overflow-hidden">
                    <div className="p-8 flex gap-6">

                        {/* Rating Widget */}
                        <div className="flex flex-col items-center gap-1 shrink-0 mt-2">
                            <button
                                onClick={() => handleVote(1)}
                                disabled={isVoting || (user && post && user.id === post.author_id)}
                                title={user && post && user.id === post.author_id ? "You cannot rate your own post" : "Upvote"}
                                className={`p-1.5 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${userVote === 1 ? 'bg-green-100 text-green-700' : 'text-gray-400 hover:bg-gray-100 hover:text-green-600'}`}
                            >
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" /></svg>
                            </button>
                            <span className={`font-bold text-lg ${score > 0 ? 'text-green-700' : score < 0 ? 'text-red-700' : 'text-gray-600'}`}>{score}</span>
                            <button
                                onClick={() => handleVote(-1)}
                                disabled={isVoting || (user && post && user.id === post.author_id)}
                                title={user && post && user.id === post.author_id ? "You cannot rate your own post" : "Downvote"}
                                className={`p-1.5 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${userVote === -1 ? 'bg-red-100 text-red-700' : 'text-gray-400 hover:bg-gray-100 hover:text-red-600'}`}
                            >
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                            </button>
                        </div>

                        {/* Content Area */}
                        <div className="flex-1">
                            <div className="flex justify-between items-start mb-4">
                                <div className="flex gap-2 items-center flex-wrap">
                                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-sm bg-[#e9eee7] text-[#2c4c3b] border border-[#c1d1b9]">{post.post_type}</span>
                                    {post.development_status && <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-sm bg-blue-50 text-blue-600 border border-blue-200">{post.development_status}</span>}
                                    {post.profile_name && <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-sm bg-purple-50 text-purple-700 border border-purple-200">{post.profile_name}</span>}
                                </div>

                                {/* Render Delete Button ONLY if the logged-in user owns the post */}
                                {user && user.id === post.author_id && (
                                    <button
                                        onClick={handleDeletePost}
                                        disabled={isDeleting}
                                        className="px-3 py-1.5 text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded hover:bg-red-100 transition-colors disabled:opacity-50"
                                    >
                                        {isDeleting ? 'Deleting...' : 'Delete Post'}
                                    </button>
                                )}
                            </div>

                            <h1 className="text-3xl font-bold text-[#1f382a] mb-2">{post.title}</h1>

                            <div className="text-xs text-gray-500 mb-6 flex items-center gap-2">
                                <span className="font-medium text-gray-700">{post.author_name || 'Anonymous Formulary'}</span>
                                <span>•</span>
                                <span>{formatDate(post.created_at)}</span>
                            </div>

                            <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap">{post.write_up}</div>
                        </div>
                    </div>

                    {snapshots.length > 0 && (
                        <div className="border-t border-gray-100 bg-gray-50">
                            {/* Version Tabs */}
                            <div className="flex px-6 pt-4 gap-2 border-b border-gray-200 overflow-x-auto">
                                {snapshots.map(snap => (
                                    <button
                                        key={snap.version}
                                        onClick={() => setActiveVersion(snap.version)}
                                        className={`px-4 py-2 text-sm font-bold rounded-t-lg transition-colors border border-b-0 ${activeVersion === snap.version
                                            ? 'bg-white text-[#2c4c3b] border-gray-200 shadow-sm relative top-[1px]'
                                            : 'bg-gray-100 text-gray-400 border-transparent hover:bg-gray-200'
                                            }`}
                                    >
                                        Version {snap.version} {snap.version === snapshots[snapshots.length - 1].version && '(Latest)'}
                                    </button>
                                ))}
                            </div>

                            {/* Recipe Table */}
                            <div className="p-6 bg-white">
                                {currentSnapshot?.release_notes && (
                                    <div className="mb-6 p-4 bg-[#f3f5f2] border-l-4 border-[#2c4c3b] rounded-r-lg">
                                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">v{activeVersion} Release Notes</h4>
                                        <p className="text-sm text-gray-800">{currentSnapshot.release_notes}</p>
                                    </div>
                                )}

                                <table className="w-full text-sm">
                                    <thead className="bg-[#f0f4ef] text-[#3a5a4a] text-xs uppercase">
                                        <tr>
                                            <th className="px-6 py-3 text-center w-24">Phase</th>
                                            <th className="px-6 py-3 text-left">Ingredient</th>
                                            <th className="px-6 py-3 text-right">Target %</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {[...recipe].sort((a, b) => (a.phase || '').localeCompare(b.phase || '')).map((item, idx) => (
                                            <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                                <td className="px-6 py-3 text-center font-bold text-gray-700">{item.phase || '-'}</td>
                                                <td className="px-6 py-3">
                                                    <div className="font-medium text-[#1f382a] flex items-center">
                                                        {item.name || 'Unknown Ingredient'}
                                                        {getDiffBadge(item)}
                                                    </div>
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
                </div>

                {/* Comments Section */}
                <div className="bg-white rounded-2xl shadow-sm border border-[#c1d1b9] overflow-hidden">
                    <div className="bg-[#e9eee7] px-6 py-4 border-b border-[#c1d1b9]">
                        <h3 className="text-lg font-bold text-[#1f382a]">Discussion ({comments.length})</h3>
                    </div>

                    <div className="p-6">
                        {comments.length === 0 ? (
                            <div className="text-center py-8 text-gray-500 italic text-sm">
                                No comments yet. Be the first to share your thoughts!
                            </div>
                        ) : (
                            <div className="space-y-6 mb-8">
                                {comments.map((comment) => (
                                    <div key={comment.id} className="flex gap-4">
                                        <div className="w-10 h-10 rounded-full bg-[#cbd8d0] text-[#2c4c3b] flex items-center justify-center font-bold shrink-0">
                                            {comment.author_name ? comment.author_name.charAt(0).toUpperCase() : '?'}
                                        </div>
                                        <div className="flex-1">
                                            <div className="bg-gray-50 p-4 rounded-xl rounded-tl-none border border-gray-100">
                                                <div className="flex justify-between items-center mb-1">
                                                    <span className="font-bold text-sm text-[#1f382a]">{comment.author_name || 'Anonymous User'}</span>
                                                    <span className="text-[10px] text-gray-400">{formatDate(comment.created_at)}</span>
                                                </div>
                                                <p className="text-sm text-gray-700 whitespace-pre-wrap">{comment.content}</p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Add Comment Input */}
                        <form onSubmit={handleAddComment} className="flex gap-4 border-t border-gray-100 pt-6">
                            <div className="w-10 h-10 rounded-full bg-[#2c4c3b] text-white flex items-center justify-center font-bold shrink-0">
                                {username ? username.charAt(0).toUpperCase() : '?'}
                            </div>
                            <div className="flex-1 flex flex-col gap-2">
                                <textarea
                                    value={newComment}
                                    onChange={(e) => setNewComment(e.target.value)}
                                    placeholder={user ? "Add to the discussion..." : "Log in to join the discussion."}
                                    disabled={!user || isSubmittingComment}
                                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#2c4c3b] outline-none text-sm min-h-[80px] resize-y disabled:bg-gray-50"
                                />
                                <div className="flex justify-end">
                                    <button
                                        type="submit"
                                        disabled={!user || !newComment.trim() || isSubmittingComment}
                                        className="px-6 py-2 bg-[#2c4c3b] text-white text-sm font-bold rounded-lg hover:bg-[#1f382a] disabled:opacity-50 transition-colors shadow-sm"
                                    >
                                        {isSubmittingComment ? 'Posting...' : 'Post Comment'}
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>

            </main>
        </div>
    );
}