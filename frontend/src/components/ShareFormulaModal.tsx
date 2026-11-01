import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface ShareFormulaModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentProjectName: string;
    // Using any here for flexibility, but it expects your FormulaIngredient[] array
    recipeData: any[];
    activeProfileName: string | null;
}

type DevStatus = 'concept' | 'in-testing' | 'stable';

export default function ShareFormulaModal({ isOpen, onClose, currentProjectName, recipeData, activeProfileName }: ShareFormulaModalProps) {
    const { user } = useAuth();

    const [title, setTitle] = useState('');
    const [writeUp, setWriteUp] = useState('');
    const [tagsInput, setTagsInput] = useState('');
    const [devStatus, setDevStatus] = useState<DevStatus>('in-testing');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    // Pre-fill title when modal opens
    useEffect(() => {
        if (isOpen && currentProjectName) {
            setTitle(currentProjectName);
            setSuccess(false);
            setError('');
        }
    }, [isOpen, currentProjectName]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return setError("You must be logged in to share.");
        if (!title.trim() || !writeUp.trim()) return setError("Title and description are required.");
        if (!recipeData || recipeData.length === 0) return setError("Your formula is empty. Add ingredients before sharing.");

        setIsSubmitting(true);
        setError('');

        const tags = tagsInput
            .split(',')
            .map(t => t.trim().toLowerCase().replace(/[^a-z0-9-]/g, ''))
            .filter(t => t.length > 0);

        try {
            // 1. Create the main community post
            const { data: postData, error: postError } = await supabase
                .from('community_posts')
                .insert([{
                    title: title.trim(),
                    write_up: writeUp.trim(),
                    post_type: 'formulation',
                    development_status: devStatus,
                    profile_name: activeProfileName,
                    tags: tags,
                    author_id: user.id
                }])
                .select('id')
                .single();

            if (postError) throw postError;

            // 2. Format the recipe for the snapshot
            const snapshotData = recipeData.map(ing => ({
                name: ing.trade_name || ing.inci_name || 'Unknown',
                inci_name: ing.inci_name,
                phase: ing.phase,
                percentage: ing.percentage,
                function: ing.function
            }));

            // 3. Save the immutable snapshot
            const { error: snapError } = await supabase
                .from('post_snapshots')
                .insert([{
                    post_id: postData.id,
                    formulation_data: snapshotData
                }]);

            if (snapError) throw snapError;

            setSuccess(true);
            setTimeout(() => {
                onClose();
            }, 2000);

        } catch (err: any) {
            console.error("Error sharing formulation:", err);
            setError(err.message || "Failed to share formulation.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1f382a]/40 backdrop-blur-sm">
            <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden border border-[#c1d1b9] flex flex-col max-h-[90vh]">
                <div className="bg-[#e9eee7] px-6 py-4 border-b border-[#c1d1b9] flex justify-between items-center shrink-0">
                    <h3 className="text-xl font-bold text-[#1f382a] flex items-center gap-2">
                        <span>🧪</span> Share Formulation
                    </h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-800 text-2xl font-bold leading-none">
                        &times;
                    </button>
                </div>

                <div className="p-6 overflow-y-auto flex-1">
                    {success ? (
                        <div className="flex flex-col items-center justify-center py-10 text-center">
                            <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-3xl mb-4">✓</div>
                            <h4 className="text-xl font-bold text-[#1f382a] mb-2">Formulation Shared!</h4>
                            <p className="text-gray-600">Your recipe is now live in the Community Hub.</p>
                        </div>
                    ) : (
                        <form id="share-formula-form" onSubmit={handleSubmit} className="space-y-5">
                            {error && (
                                <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm font-medium">
                                    {error}
                                </div>
                            )}

                            <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl text-sm text-blue-800 mb-6">
                                <strong>Note:</strong> Sharing will create a permanent, public snapshot of your formula's phases and percentages as they are right now. Future edits to your private draft will not affect this public post.
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Recipe Title</label>
                                <input
                                    type="text"
                                    required
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2c4c3b] outline-none text-sm"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Development Status</label>
                                <select
                                    value={devStatus}
                                    onChange={(e) => setDevStatus(e.target.value as DevStatus)}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2c4c3b] outline-none text-sm bg-white"
                                >
                                    <option value="concept">💡 Concept (Untested idea)</option>
                                    <option value="in-testing">⏳ In Testing (Currently evaluating)</option>
                                    <option value="stable">✓ Stable (Passed stability/micro testing)</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Description & Notes</label>
                                <textarea
                                    required
                                    value={writeUp}
                                    onChange={(e) => setWriteUp(e.target.value)}
                                    placeholder="Describe the texture, performance, and process for making this formulation..."
                                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2c4c3b] outline-none text-sm min-h-[120px] resize-y"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Tags (Optional)</label>
                                <input
                                    type="text"
                                    value={tagsInput}
                                    onChange={(e) => setTagsInput(e.target.value)}
                                    placeholder="skincare, emulsion, vegan (comma separated)"
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#2c4c3b] outline-none text-sm"
                                />
                            </div>
                        </form>
                    )}
                </div>

                {!success && (
                    <div className="bg-gray-50 px-6 py-4 border-t border-gray-100 flex justify-end gap-3 shrink-0">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-5 py-2.5 text-sm font-bold text-gray-600 hover:text-gray-900 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            form="share-formula-form"
                            type="submit"
                            disabled={isSubmitting}
                            className="px-6 py-2.5 bg-[#2c4c3b] text-white text-sm font-bold rounded-lg hover:bg-[#1f382a] disabled:opacity-50 transition-colors shadow-sm"
                        >
                            {isSubmitting ? 'Publishing...' : 'Publish to Community'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}