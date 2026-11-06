import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import RecipeRatings from '../components/RecipeRatings';
import { RemixedFrom, RemixList } from '../components/PostRemixes';
import { cloneRecipeToStudio } from '../lib/cloneRecipe';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { useDialog } from '../hooks/useDialog';
import { postTypeInfo } from '../lib/postTypes';
import ReportModal from '../components/ReportModal';
import EditPostModal from '../components/EditPostModal';
import { useCommunityMutes } from '../hooks/useCommunityMutes';
import { useIsModerator } from '../hooks/useIsModerator';
import { addComment, deleteComment, deletePost, fetchComments, fetchPost, fetchVersions, setAnswered } from '../lib/communityApi';
import { COMMENT_MAX, SAFETY_NOTICE, communityErrorMessage } from '../lib/communityLimits';

interface Snapshot {
    version: number;
    formulation_data: any[];
    release_notes: string | null;
    created_at: string;
}

interface Comment {
    id: string;
    author_id?: string | null;
    body: string;
    author_name: string | null;
    created_at: string;
}

export default function PostDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user, username } = useAuth(); // Destructure username for comments
    const { formatDate } = useSettings();
    const { alert, confirm } = useDialog();

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
    const { muted, mute } = useCommunityMutes();
    const isModerator = useIsModerator();
    const [reporting, setReporting] = useState<{ type: 'post' | 'comment'; id: string } | null>(null);
    const [editing, setEditing] = useState(false);

    useEffect(() => {
        const fetchPostData = async () => {
            if (!id) return;
            try {
                // 1. Fetch Post Details
                const postData = await fetchPost(id).catch(() => null);
                setPost(postData);

                // 2. Fetch all snapshot versions if it's a formulation
                if (postData?.post_type === 'formulation') {
                    const snapData = await fetchVersions(id).catch(() => []); // v1, v2, v3...

                    if (snapData && snapData.length > 0) {
                        const parsedSnaps = snapData.map(snap => {
                            let parsed = snap.formulation_data;
                            if (typeof parsed === 'string') {
                                try { parsed = JSON.parse(parsed); } catch { parsed = []; }
                            }
                            return { ...snap, formulation_data: Array.isArray(parsed) ? parsed : [] };
                        });

                        setSnapshots(parsedSnaps);
                        setActiveVersion(parsedSnaps[parsedSnaps.length - 1].version); // Default to latest
                    }
                }

                // 3. Fetch Comments
                const commentData = await fetchComments(id).catch(() => null);
                if (commentData) setComments(commentData);
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

    // Comment Logic
    const handleAddComment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return alert("You must be logged in to comment.", { title: "Sign in to comment" });
        if (!newComment.trim()) return;

        setIsSubmittingComment(true);
        try {
            // The backend sets who wrote it and the name it carries
            const data = await addComment(id as string, newComment.trim());
            if (data) setComments(prev => [...prev, data]);
            setNewComment('');

        } catch (error: any) {
            void alert(communityErrorMessage(error), { tone: "error", title: "Couldn't post your comment" });
        } finally {
            setIsSubmittingComment(false);
        }
    };

    const handleCloneRecipe = async () => {
        if (!user) return alert("You must be logged in to clone a recipe.", { title: "Sign in to clone" });
        if (!recipe || recipe.length === 0) return alert("No recipe data available to clone.", { title: "Nothing to clone" });

        setIsCloning(true);
        try {
            const newId = await cloneRecipeToStudio(
                post,
                recipe.map((ing: any) => ({ ingredient_id: ing.id || ing.ingredient_id, percentage: ing.percentage, phase: ing.phase })),
            );

            // Straight to the new private clone
            navigate(`/studio/${newId}`);

        } catch (error: any) {
            console.error("Error cloning:", error);
            void alert(`Failed to clone: ${error.message}`, { tone: "error", title: "Couldn't clone the recipe" });
        } finally {
            setIsCloning(false);
        }
    };

    const handleDeletePost = async () => {
        if (!(await confirm("Are you sure you want to delete this post? This cannot be undone.", { title: "Delete this post?", confirmLabel: "Delete post", tone: "danger" }))) return;

        setIsDeleting(true);
        try {
            // Delete the post (snapshots will auto-delete via CASCADE)
            await deletePost(id as string);

            // Navigate back to the hub after successful deletion
            navigate('/community');
        } catch (error: any) {
            console.error("Error deleting post:", error);
            void alert(communityErrorMessage(error), { tone: "error", title: "Couldn't delete the post" });
            setIsDeleting(false);
        }
    };

    const isAuthor = !!user && user.id === post.author_id;
    const canRemovePost = isAuthor || isModerator;
    const isAdvice = post.post_type === 'advice' || post.post_type === 'request';
    const showSafety = isAdvice || post.post_type === 'information' || post.post_type === 'education';
    const visibleComments = comments.filter(c => !(c.author_id && muted.includes(c.author_id)));
    const hiddenCount = comments.length - visibleComments.length;

    const handleToggleAnswered = async () => {
        try {
            const answeredAt = await setAnswered(post.id, !post.answered_at);
            setPost((prev: Record<string, unknown>) => ({ ...prev, answered_at: answeredAt }));
        } catch (error) {
            void alert(communityErrorMessage(error), { tone: "error", title: "Couldn't update the post" });
        }
    };

    const handleMute = async (authorId: string, name: string) => {
        if (!(await confirm(`You won't see posts or comments from ${name} any more. You can unmute them from the Community page.`, { title: `Mute ${name}?`, confirmLabel: 'Mute' }))) return;
        try { await mute(authorId); } catch (error) { void alert(communityErrorMessage(error), { tone: "error", title: "Couldn't mute" }); }
    };

    const handleDeleteComment = async (comment: Comment) => {
        if (!(await confirm("Delete this comment? This cannot be undone.", { title: "Delete this comment?", confirmLabel: "Delete comment", tone: "danger" }))) return;
        try {
            await deleteComment(comment.id);
            setComments(prev => prev.filter(c => c.id !== comment.id));
        } catch (error) {
            void alert(communityErrorMessage(error), { tone: "error", title: "Couldn't delete the comment" });
        }
    };

    const afterReport = () => {
        setReporting(null);
        void alert("Thank you. A moderator will take a look.", { title: "Report sent" });
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

                        {/* Content Area */}
                        <div className="flex-1">
                            <div className="flex justify-between items-start mb-4">
                                <div className="flex gap-2 items-center flex-wrap">
                                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-sm bg-[#e9eee7] text-[#2c4c3b] border border-[#c1d1b9]">{postTypeInfo(post.post_type).label}</span>
                                    {post.development_status && <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-sm bg-blue-50 text-blue-600 border border-blue-200">{post.development_status}</span>}
                                    {post.profile_name && <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-sm bg-purple-50 text-purple-700 border border-purple-200">{post.profile_name}</span>}
                                    {isAdvice && post.answered_at && <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-sm bg-green-50 text-green-700 border border-green-200">✓ Answered</span>}
                                </div>

                                <div className="flex gap-2 flex-wrap justify-end">
                                    {isAuthor && isAdvice && (
                                        <button onClick={handleToggleAnswered} className="px-3 py-1.5 text-xs font-bold text-green-700 bg-green-50 border border-green-200 rounded hover:bg-green-100 transition-colors">
                                            {post.answered_at ? 'Reopen' : 'Mark as answered'}
                                        </button>
                                    )}
                                    {isAuthor && post.post_type !== 'formulation' && (
                                        <button onClick={() => setEditing(true)} className="px-3 py-1.5 text-xs font-bold text-gray-700 bg-gray-50 border border-gray-200 rounded hover:bg-gray-100 transition-colors">Edit</button>
                                    )}
                                    {user && !isAuthor && (
                                        <>
                                            <button onClick={() => setReporting({ type: 'post', id: post.id })} className="px-3 py-1.5 text-xs font-bold text-gray-600 bg-gray-50 border border-gray-200 rounded hover:bg-gray-100 transition-colors">Report</button>
                                            {post.author_id && <button onClick={() => handleMute(post.author_id, post.author_name || 'this member')} className="px-3 py-1.5 text-xs font-bold text-gray-600 bg-gray-50 border border-gray-200 rounded hover:bg-gray-100 transition-colors">Mute author</button>}
                                        </>
                                    )}
                                    {canRemovePost && (
                                        <button
                                            onClick={handleDeletePost}
                                            disabled={isDeleting}
                                            className="px-3 py-1.5 text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded hover:bg-red-100 transition-colors disabled:opacity-50"
                                        >
                                            {isDeleting ? 'Deleting...' : isAuthor ? 'Delete Post' : 'Remove (moderator)'}
                                        </button>
                                    )}
                                </div>
                            </div>

                            <h1 className="text-3xl font-bold text-[#1f382a] mb-2">{post.title}</h1>

                            <RemixedFrom originalPostId={post.remixed_from_post_id} />

                            <div className="text-xs text-gray-500 mb-6 flex items-center gap-2">
                                <span className="font-medium text-gray-700">{post.author_name || 'Anonymous Formulary'}</span>
                                <span>•</span>
                                <span>{formatDate(post.created_at)}</span>
                                {post.edited_at && <><span>•</span><span>edited</span></>}
                            </div>

                            {showSafety && (
                                <p role="note" className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">⚠️ {SAFETY_NOTICE}</p>
                            )}

                            <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap">{post.write_up}</div>

                            {post.sources && (
                                <div className="mt-6 pt-4 border-t border-gray-100">
                                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Sources</h4>
                                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{post.sources}</p>
                                </div>
                            )}
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

                {/* Recipe Ratings */}
                {post.post_type === 'formulation' && (
                    <RecipeRatings
                        postId={post.id}
                        authorId={post.author_id}
                        versions={snapshots.map(s => s.version)}
                        activeVersion={activeVersion}
                    />
                )}

                {post.post_type === 'formulation' && <RemixList postId={post.id} />}

                {/* Comments Section */}
                <div className="bg-white rounded-2xl shadow-sm border border-[#c1d1b9] overflow-hidden">
                    <div className="bg-[#e9eee7] px-6 py-4 border-b border-[#c1d1b9]">
                        <h3 className="text-lg font-bold text-[#1f382a]">Discussion ({visibleComments.length})</h3>
                    </div>

                    <div className="p-6">
                        {visibleComments.length === 0 ? (
                            <div className="text-center py-8 text-gray-500 italic text-sm">
                                No comments yet. Be the first to share your thoughts!
                            </div>
                        ) : (
                            <div className="space-y-6 mb-8">
                                {visibleComments.map((comment) => (
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
                                                <p className="text-sm text-gray-700 whitespace-pre-wrap">{comment.body}</p>
                                            </div>
                                            <div className="flex gap-3 mt-1 ml-1 text-[11px] text-gray-400">
                                                {user && comment.author_id !== user.id && (
                                                    <button onClick={() => setReporting({ type: 'comment', id: comment.id })} className="hover:text-gray-700">Report</button>
                                                )}
                                                {user && comment.author_id && comment.author_id !== user.id && (
                                                    <button onClick={() => handleMute(comment.author_id!, comment.author_name || 'this member')} className="hover:text-gray-700">Mute</button>
                                                )}
                                                {user && (comment.author_id === user.id || isModerator) && (
                                                    <button onClick={() => handleDeleteComment(comment)} className="hover:text-red-600">
                                                        {comment.author_id === user.id ? 'Delete' : 'Remove (moderator)'}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {hiddenCount > 0 && (
                            <p className="text-xs text-gray-400 italic mb-4">{hiddenCount} comment{hiddenCount === 1 ? '' : 's'} from muted members hidden.</p>
                        )}

                        {/* Add Comment Input */}
                        <form onSubmit={handleAddComment} className="flex gap-4 border-t border-gray-100 pt-6">
                            <div className="w-10 h-10 rounded-full bg-[#2c4c3b] text-white flex items-center justify-center font-bold shrink-0">
                                {username ? username.charAt(0).toUpperCase() : '?'}
                            </div>
                            <div className="flex-1 flex flex-col gap-2">
                                <textarea
                                    value={newComment}
                                    maxLength={COMMENT_MAX}
                                    onChange={(e) => setNewComment(e.target.value)}
                                    placeholder={user ? "Add to the discussion..." : "Log in to join the discussion."}
                                    disabled={!user || isSubmittingComment}
                                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#2c4c3b] outline-none text-sm min-h-[80px] resize-y disabled:bg-gray-50"
                                />
                                <div className="flex justify-between items-center">
                                    <span className="text-[11px] text-gray-400">{newComment.length.toLocaleString('en-US')}/{COMMENT_MAX.toLocaleString('en-US')}</span>
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

            {reporting && <ReportModal targetType={reporting.type} targetId={reporting.id} onClose={() => setReporting(null)} onSent={afterReport} />}
            {editing && (
                <EditPostModal
                    post={post}
                    onClose={() => setEditing(false)}
                    onSaved={(changes) => { setPost((prev: Record<string, unknown>) => ({ ...prev, ...changes, edited_at: new Date().toISOString() })); setEditing(false); }}
                />
            )}
        </div>
    );
}