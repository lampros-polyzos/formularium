import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Link, useNavigate } from 'react-router-dom';

import { POST_TYPES, type PostType } from '../lib/postTypes';
import { SAFETY_NOTICE, SOURCES_MAX, TEXT_MAX, TITLE_MAX, communityErrorMessage } from '../lib/communityLimits';

interface NewPostModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

const AVAILABLE_TAGS = [
    'skincare', 'haircare', 'bodycare', 'color-cosmetics',
    'o/w-emulsion', 'w/o-emulsion', 'anhydrous', 'surfactant',
    'beginner-friendly', 'advanced', 'troubleshooting', 'vegan', 'cosmos-compliant'
];

export default function NewPostModal({ isOpen, onClose, onSuccess }: NewPostModalProps) {
    const { user, username } = useAuth(); // Correctly extracts both exactly once
    const navigate = useNavigate();

    const [postType, setPostType] = useState<PostType>('discussion');
    const [title, setTitle] = useState('');
    const [writeUp, setWriteUp] = useState('');
    const [sources, setSources] = useState('');
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    if (!isOpen) return null;

    const toggleTag = (tag: string) => {
        setSelectedTags(prev =>
            prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
        );
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return setError("You must be logged in to post.");
        if (!title.trim() || !writeUp.trim()) return setError("Title and description are required.");

        setIsSubmitting(true);
        setError('');

        try {
            const { error: insertError } = await supabase
                .from('community_posts')
                .insert([{
                    title: title.trim(),
                    write_up: writeUp.trim(),
                    post_type: postType,
                    tags: selectedTags,
                    ...(postType === 'information' && sources.trim() ? { sources: sources.trim() } : {}),
                    author_id: user.id,
                    author_name: username || 'Anonymous Formulary' // Applies the global display name
                }]);

            if (insertError) throw insertError;

            setTitle('');
            setWriteUp('');
            setSources('');
            setSelectedTags([]);
            onSuccess();
            onClose();
        } catch (err: any) {
            console.error("Error creating post:", err);
            setError(communityErrorMessage(err) || "Failed to create post.");
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
                                {POST_TYPES.map((type) => (
                                    <button
                                        key={type.id}
                                        type="button"
                                        aria-pressed={postType === type.id}
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
                                        <span className="text-[10px] text-gray-500 mt-0.5 text-center leading-tight">{type.hint}</span>
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
                                        maxLength={TITLE_MAX}
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        placeholder="e.g., Best emulsifier for a high-oil body butter?"
                                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2c4c3b] outline-none text-sm"
                                    />
                                    <div className="text-[11px] text-gray-400 text-right">{title.length}/{TITLE_MAX}</div>
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Description</label>
                                    <textarea
                                        required
                                        maxLength={TEXT_MAX}
                                        value={writeUp}
                                        onChange={(e) => setWriteUp(e.target.value)}
                                        placeholder="Explain your question, share your knowledge, or describe what you're working on..."
                                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2c4c3b] outline-none text-sm min-h-[160px] resize-y"
                                    />
                                    <div className="text-[11px] text-gray-400 text-right">{writeUp.length.toLocaleString('en-US')}/{TEXT_MAX.toLocaleString('en-US')}</div>
                                </div>

                                {postType === 'information' && (
                                    <div>
                                        <label htmlFor="new-post-sources" className="block text-sm font-bold text-gray-700 mb-1">Sources (optional)</label>
                                        <textarea
                                            id="new-post-sources"
                                            value={sources}
                                            maxLength={SOURCES_MAX}
                                            onChange={(e) => setSources(e.target.value)}
                                            placeholder="Where does this come from? Books, papers, supplier data sheets, links..."
                                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2c4c3b] outline-none text-sm min-h-[70px] resize-y"
                                        />
                                    </div>
                                )}

                                {(postType === 'advice' || postType === 'information') && (
                                    <p role="note" className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                                        ⚠️ {SAFETY_NOTICE}{' '}
                                        <Link to="/terms" className="underline font-semibold">Community rules</Link>
                                    </p>
                                )}

                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2">Tags (Select all that apply)</label>
                                    <div className="flex flex-wrap gap-2">
                                        {AVAILABLE_TAGS.map(tag => (
                                            <button
                                                key={tag}
                                                type="button"
                                                onClick={() => toggleTag(tag)}
                                                className={`text-[11px] px-3 py-1.5 rounded-full font-medium transition-colors whitespace-nowrap border ${selectedTags.includes(tag)
                                                        ? 'bg-[#2c4c3b] text-white border-[#2c4c3b]'
                                                        : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400 hover:bg-gray-50'
                                                    }`}
                                            >
                                                #{tag}
                                            </button>
                                        ))}
                                    </div>
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