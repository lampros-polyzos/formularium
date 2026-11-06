import { useState } from 'react';
import { editPost } from '../lib/communityApi';
import { SOURCES_MAX, TEXT_MAX, TITLE_MAX, communityErrorMessage } from '../lib/communityLimits';

interface EditPostModalProps {
    post: { id: string; title: string; write_up: string | null; sources?: string | null; post_type: string | null };
    onClose: () => void;
    onSaved: (changes: { title: string; write_up: string; sources: string | null }) => void;
}

export default function EditPostModal({ post, onClose, onSaved }: EditPostModalProps) {
    const [title, setTitle] = useState(post.title);
    const [writeUp, setWriteUp] = useState(post.write_up ?? '');
    const [sources, setSources] = useState(post.sources ?? '');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const hasSources = post.post_type === 'information' || post.post_type === 'education';

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim() || !writeUp.trim()) return setError('Title and description are required.');
        setSaving(true);
        setError('');
        try {
            const changes = { title: title.trim(), write_up: writeUp.trim(), sources: hasSources ? sources.trim() || null : (post.sources ?? null) };
            await editPost(post.id, hasSources ? changes : { title: changes.title, write_up: changes.write_up });
            onSaved(changes);
        } catch (err) {
            setError(communityErrorMessage(err));
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1f382a]/40 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="edit-post-title">
            <form id="edit-post-form" onSubmit={submit} className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-[#c1d1b9] overflow-hidden flex flex-col max-h-[90vh]">
                <div className="bg-[#e9eee7] px-6 py-4 border-b border-[#c1d1b9] shrink-0">
                    <h3 id="edit-post-title" className="text-lg font-bold text-[#1f382a]">Edit your post</h3>
                </div>
                <div className="p-6 space-y-4 overflow-y-auto">
                    {error && <div role="alert" className="p-3 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm font-medium">{error}</div>}
                    <div>
                        <label htmlFor="edit-title" className="block text-sm font-bold text-gray-700 mb-1">Title</label>
                        <input id="edit-title" type="text" required maxLength={TITLE_MAX} value={title} onChange={(e) => setTitle(e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2c4c3b] outline-none text-sm" />
                        <div className="text-[11px] text-gray-400 text-right">{title.length}/{TITLE_MAX}</div>
                    </div>
                    <div>
                        <label htmlFor="edit-text" className="block text-sm font-bold text-gray-700 mb-1">Description</label>
                        <textarea id="edit-text" required maxLength={TEXT_MAX} value={writeUp} onChange={(e) => setWriteUp(e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2c4c3b] outline-none text-sm min-h-[160px] resize-y" />
                        <div className="text-[11px] text-gray-400 text-right">{writeUp.length.toLocaleString('en-US')}/{TEXT_MAX.toLocaleString('en-US')}</div>
                    </div>
                    {hasSources && (
                        <div>
                            <label htmlFor="edit-sources" className="block text-sm font-bold text-gray-700 mb-1">Sources (optional)</label>
                            <textarea id="edit-sources" maxLength={SOURCES_MAX} value={sources} onChange={(e) => setSources(e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2c4c3b] outline-none text-sm min-h-[70px] resize-y" />
                        </div>
                    )}
                </div>
                <div className="bg-gray-50 px-6 py-4 border-t border-gray-100 flex justify-end gap-3 shrink-0">
                    <button type="button" onClick={onClose} className="px-5 py-2.5 text-sm font-bold text-gray-600 hover:text-gray-900">Cancel</button>
                    <button type="submit" disabled={saving} className="px-6 py-2.5 bg-[#2c4c3b] text-white text-sm font-bold rounded-lg hover:bg-[#1f382a] disabled:opacity-50">
                        {saving ? 'Saving...' : 'Save changes'}
                    </button>
                </div>
            </form>
        </div>
    );
}
