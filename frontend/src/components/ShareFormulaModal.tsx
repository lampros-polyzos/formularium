import React, { useState, useEffect } from 'react';
import { addVersion, createPost, editPost, fetchVersions } from '../lib/communityApi';
import { linkFormulaToPost } from '../lib/formulasApi';
import { useAuth } from '../contexts/AuthContext';

interface ShareFormulaModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentProjectName: string;
    recipeData: any[];
    activeProfileName: string | null;
    formulaId: string | null;
    communityPostId: string | null;
    /** The community recipe this formula started as, if it is a remix. */
    remixedFromPostId?: string | null;
    onShareSuccess: (postId: string) => void;
}

type DevStatus = 'concept' | 'in-testing' | 'stable';

export default function ShareFormulaModal({
    isOpen, onClose, currentProjectName, recipeData, activeProfileName, formulaId, communityPostId, remixedFromPostId = null, onShareSuccess
}: ShareFormulaModalProps) {
    const { user } = useAuth(); // Correctly extracted once

    const [title, setTitle] = useState('');
    const [writeUp, setWriteUp] = useState('');
    const [releaseNotes, setReleaseNotes] = useState('');
    const [devStatus, setDevStatus] = useState<DevStatus>('in-testing');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [currentVersion, setCurrentVersion] = useState(0);

    useEffect(() => {
        if (isOpen) {
            setTitle(currentProjectName);
            setSuccess(false);
            setError('');
            setReleaseNotes('');

            if (communityPostId) {
                fetchVersions(communityPostId)
                    .then(versions => {
                        if (versions.length > 0) setCurrentVersion(Math.max(...versions.map(v => v.version)));
                    })
                    .catch(() => { /* the next version number is worked out by the backend anyway */ });
            }
        }
    }, [isOpen, currentProjectName, communityPostId]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return setError("You must be logged in to share.");
        if (!formulaId) return setError("Please save your project before sharing.");
        if (!title.trim() || !writeUp.trim()) return setError("Title and description are required.");

        setIsSubmitting(true);
        setError('');

        try {
            let activePostId = communityPostId;

            if (activePostId) {
                await editPost(activePostId, { write_up: writeUp, development_status: devStatus });
            } else {
                // A recipe that started as someone else's says so on its post. The backend sets who wrote it and the name it carries.
                const postData = await createPost({
                    title: title.trim(),
                    write_up: writeUp.trim(),
                    post_type: 'formulation',
                    development_status: devStatus,
                    profile_name: activeProfileName,
                    remixed_from_post_id: remixedFromPostId,
                });
                activePostId = postData.id;

                await linkFormulaToPost(formulaId, activePostId as string).catch(error => console.warn('Could not link the formula to its post:', error));

                onShareSuccess(activePostId as string);
            }

            const snapshotData = recipeData.map(ing => ({
                id: ing.id || ing.ingredient_id,
                name: ing.trade_name || ing.inci_name || 'Unknown',
                inci_name: ing.inci_name,
                phase: ing.phase,
                percentage: ing.percentage,
                function: ing.function
            }));

            await addVersion(activePostId as string, snapshotData, releaseNotes.trim() || null);

            setSuccess(true);
            setTimeout(() => onClose(), 2000);

        } catch (err: any) {
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
                        <span>🧪</span> {communityPostId ? `Publish Version ${currentVersion + 1}` : 'Share Formulation'}
                    </h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-800 text-2xl font-bold leading-none">&times;</button>
                </div>

                <div className="p-6 overflow-y-auto flex-1">
                    {success ? (
                        <div className="text-center py-10">
                            <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-3xl mx-auto mb-4">✓</div>
                            <h4 className="text-xl font-bold text-[#1f382a]">Version {currentVersion + 1} Published!</h4>
                        </div>
                    ) : (
                        <form id="share-formula-form" onSubmit={handleSubmit} className="space-y-5">
                            {error && <div className="p-3 bg-red-50 text-red-700 border rounded-lg text-sm">{error}</div>}

                            {communityPostId && (
                                <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl text-sm text-blue-800">
                                    <strong>Updating Post:</strong> You are adding a new version to an existing post. Community members will be able to see the differences between v{currentVersion} and v{currentVersion + 1}.
                                </div>
                            )}

                            {!communityPostId && (
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Recipe Title</label>
                                    <input type="text" required value={title} onChange={(e) => setTitle(e.target.value)} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-[#2c4c3b] outline-none text-sm" />
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Development Status</label>
                                <select value={devStatus} onChange={(e) => setDevStatus(e.target.value as DevStatus)} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-[#2c4c3b] outline-none text-sm bg-white">
                                    <option value="concept">💡 Concept (Untested idea)</option>
                                    <option value="in-testing">⏳ In Testing (Currently evaluating)</option>
                                    <option value="stable">✓ Stable (Passed stability/micro testing)</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Main Description (Overwrites previous)</label>
                                <textarea required value={writeUp} onChange={(e) => setWriteUp(e.target.value)} placeholder="Describe the overall formulation..." className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-[#2c4c3b] outline-none text-sm min-h-[100px]" />
                            </div>

                            {communityPostId && (
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Release Notes (v{currentVersion + 1})</label>
                                    <textarea value={releaseNotes} onChange={(e) => setReleaseNotes(e.target.value)} placeholder="What changed in this version? (e.g., Increased emulsifier to fix separation)" className="w-full px-4 py-3 border rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-[#2c4c3b] outline-none text-sm min-h-[80px]" />
                                </div>
                            )}
                        </form>
                    )}
                </div>

                {!success && (
                    <div className="bg-gray-50 px-6 py-4 border-t flex justify-end gap-3 shrink-0">
                        <button type="button" onClick={onClose} className="px-5 py-2.5 text-sm font-bold text-gray-600">Cancel</button>
                        <button form="share-formula-form" type="submit" disabled={isSubmitting} className="px-6 py-2.5 bg-[#2c4c3b] text-white text-sm font-bold rounded-lg hover:bg-[#1f382a] disabled:opacity-50">
                            {isSubmitting ? 'Publishing...' : 'Publish'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}