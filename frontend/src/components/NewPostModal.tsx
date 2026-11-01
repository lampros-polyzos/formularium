import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

type PostType = 'discussion' | 'request' | 'education' | 'formulation';

interface NewPostModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export default function NewPostModal({ isOpen, onClose, onSuccess }: NewPostModalProps) {
    const { user } = useAuth();
    const navigate = useNavigate();

    const [postType, setPostType] = useState<PostType>('discussion');
    const [title, setTitle] = useState('');
    const [writeUp, setWriteUp] = useState('');
    const [tagsInput, setTagsInput] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return setError("You must be logged in to post.");
        if (!title.trim() || !writeUp.trim()) return setError("Title and description are required.");

        setIsSubmitting(true);
        setError('');

        // Clean and format tags
        const tags = tagsInput
            .split(',')
            .map(t => t.trim().toLowerCase().replace(/[^a-z0-9-]/g, ''))
            .filter(t => t.length > 0);

        try {
            const { error: insertError } = await supabase
                .from('community_posts')
                .insert([{
                    title: title.trim(),
                    write_up: writeUp.trim(),
                    post_type: postType,
                    tags: tags,
                    author_id: user.id
                }]);

            if (insertError) throw insertError;

            setTitle('');
            setWriteUp('');
            setTagsInput('');
            onSuccess();
            onClose();
        } catch (err: any) {
            console.error("Error creating post:", err);
            setError(err.message || "Failed to create post.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1f382a]/40 backdrop-blur-sm">
            <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden border border-[#c1d1b9] flex flex-col max-h-[90vh]">
                <div className="bg-[#e9eee7] px-6 py-4 border-b border-[#c1d1b9] flex justify-between items-center shrink-0">
                    <h3 className="text-xl font-bold text-[#1f382a]">Create New Post</h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-800 text-2xl font-bold leading-none">
                        &times;
                    </button>
                </div>

                <div className="p-6 overflow-y-auto flex-1">
                    {error && (
                        <div className="mb-4 p-3 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm font-medium">
                            {error}
                        </div>
                    )}

                    <form id="new-post-form" onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Post Type</label>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                {(
                                    [
                                        { id: 'discussion', label: 'Discussion', icon: '💬' },
                                        { id: 'request', label: 'Request', icon: '✋' },
                                        { id: 'education', label: 'Education', icon: '📚' },
                                        { id: 'formulation', label: 'Recipe', icon: '🧪' }
                                    ] as const
                                ).map((type) => (
                                    <button
                                        key={type.id}
                                        type="button"
                                        onClick={() => setPostType(type.id)}
                                        className={`flex flex-col items-center justify-center p-3 border rounded-xl transition-all ${postType === type.id
                                                ? 'bg-[#e9eee7] border-[#2c4c3b] ring-1 ring-[#2c4c3b] shadow-sm'
                                                : 'bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                                            }`}
                                    >
                                        <span className="text-2xl mb-1">{type.icon}</span>
                                        <span className={`text-xs font-bold ${postType === type.id ? 'text-[#1f382a]' : 'text-gray-600'}`}>
                                            {type.label}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {postType === 'formulation' ? (
                            <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
                                <span className="text-4xl block mb-3">🧪</span>
                                <h4 className="text-green-900 font-bold mb-2">Share a Formulation</h4>
                                <p className="text-sm text-green-800 mb-4 max-w-sm mx-auto">
                                    To ensure your recipe data is accurately captured, formulas must be published directly from your Formulation Studio workspace.
                                </p>
                                <button
                                    type="button"
                                    onClick={() => navigate('/studio')}
                                    className="px-6 py-2 bg-green-700 text-white text-sm font-bold rounded-lg hover:bg-green-800 transition-colors shadow-sm"
                                >
                                    Go to Studio
                                </button>
                            </div>
                        ) : (
                            <>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Title</label>
                                    <input
                                        type="text"
                                        required
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        placeholder="e.g., Best emulsifier for a high-oil body butter?"
                                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2c4c3b] outline-none text-sm"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Description</label>
                                    <textarea
                                        required
                                        value={writeUp}
                                        onChange={(e) => setWriteUp(e.target.value)}
                                        placeholder="Explain your question, share your knowledge, or describe what you're working on..."
                                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2c4c3b] outline-none text-sm min-h-[160px] resize-y"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Tags (Optional)</label>
                                    <input
                                        type="text"
                                        value={tagsInput}
                                        onChange={(e) => setTagsInput(e.target.value)}
                                        placeholder="skincare, emulsifiers, beginner-friendly (comma separated)"
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#2c4c3b] outline-none text-sm"
                                    />
                                </div>
                            </>
                        )}
                    </form>
                </div>

                <div className="bg-gray-50 px-6 py-4 border-t border-gray-100 flex justify-end gap-3 shrink-0">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-5 py-2.5 text-sm font-bold text-gray-600 hover:text-gray-900 transition-colors"
                    >
                        Cancel
                    </button>
                    {postType !== 'formulation' && (
                        <button
                            form="new-post-form"
                            type="submit"
                            disabled={isSubmitting}
                            className="px-6 py-2.5 bg-[#2c4c3b] text-white text-sm font-bold rounded-lg hover:bg-[#1f382a] disabled:opacity-50 transition-colors shadow-sm"
                        >
                            {isSubmitting ? 'Posting...' : 'Post to Community'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}