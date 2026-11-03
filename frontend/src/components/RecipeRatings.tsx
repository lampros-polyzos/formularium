import { useEffect, useMemo, useState, type SyntheticEvent } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useDialog } from '../hooks/useDialog';
import { useSettings } from '../contexts/SettingsContext';
import StarRating from './StarRating';

type SkinType = 'dry' | 'oily' | 'combination' | 'normal' | 'sensitive';
type CriterionKey = 'texture' | 'stability' | 'ease' | 'efficacy';

export interface RecipeRating {
    id: string;
    post_id: string;
    user_id: string;
    author_name: string | null;
    version: number;
    overall: number;
    texture: number | null;
    stability: number | null;
    ease: number | null;
    efficacy: number | null;
    made_it: boolean;
    skin_type: SkinType | null;
    review: string | null;
    created_at: string;
    updated_at: string;
}

interface Draft {
    overall: number;
    made_it: boolean;
    texture: number | null;
    stability: number | null;
    ease: number | null;
    efficacy: number | null;
    skin_type: SkinType | '';
    review: string;
    version: number;
}

interface RecipeRatingsProps {
    postId: string;
    authorId: string;
    versions: number[];
    activeVersion: number;
}

// Hands-on criteria, only asked of people who actually made the recipe
const CRITERIA: { key: CriterionKey; label: string; hint: string }[] = [
    { key: 'texture', label: 'Skin feel & texture', hint: 'Spreadability, absorption, after-feel' },
    { key: 'stability', label: 'Stability', hint: 'No separation, graininess or changes over time' },
    { key: 'ease', label: 'Ease of making', hint: 'Clear process, easy to reproduce' },
    { key: 'efficacy', label: 'Results', hint: 'Delivered what the recipe promises' },
];

const SKIN_TYPES: { value: SkinType; label: string }[] = [
    { value: 'normal', label: 'Normal' },
    { value: 'dry', label: 'Dry' },
    { value: 'oily', label: 'Oily' },
    { value: 'combination', label: 'Combination' },
    { value: 'sensitive', label: 'Sensitive' },
];

const OVERALL_LABELS = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];
const MAX_REVIEW_LENGTH = 1000;

export default function RecipeRatings({ postId, authorId, versions, activeVersion }: RecipeRatingsProps) {
    const { user, username } = useAuth();
    const { confirm } = useDialog();
    const { formatDate } = useSettings();

    const [ratings, setRatings] = useState<RecipeRating[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [draft, setDraft] = useState<Draft | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchRatings = async () => {
            const { data, error } = await supabase
                .from('recipe_ratings')
                .select('*')
                .eq('post_id', postId)
                .order('updated_at', { ascending: false });

            if (error) console.error("Error loading ratings:", error);
            else setRatings(data ?? []);
            setIsLoading(false);
        };
        fetchRatings();
    }, [postId]);

    const myRating = user ? ratings.find(r => r.user_id === user.id) : undefined;
    const isAuthor = user?.id === authorId;

    const stats = useMemo(() => {
        const count = ratings.length;
        const average = count ? ratings.reduce((sum, r) => sum + r.overall, 0) / count : 0;
        const distribution = [5, 4, 3, 2, 1].map(star => ({
            star,
            count: ratings.filter(r => r.overall === star).length,
        }));
        const madeItCount = ratings.filter(r => r.made_it).length;
        const criteria = CRITERIA.map(c => {
            const values = ratings.map(r => r[c.key]).filter((v): v is number => v != null);
            return {
                ...c,
                count: values.length,
                average: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null,
            };
        });
        return { count, average, distribution, madeItCount, criteria };
    }, [ratings]);

    const startDraft = () => {
        setError('');
        setDraft(myRating ? {
            overall: myRating.overall,
            made_it: myRating.made_it,
            texture: myRating.texture,
            stability: myRating.stability,
            ease: myRating.ease,
            efficacy: myRating.efficacy,
            skin_type: myRating.skin_type ?? '',
            review: myRating.review ?? '',
            version: myRating.version,
        } : {
            overall: 0,
            made_it: false,
            texture: null,
            stability: null,
            ease: null,
            efficacy: null,
            skin_type: '',
            review: '',
            version: activeVersion,
        });
    };

    const updateDraft = (changes: Partial<Draft>) => {
        setDraft(prev => (prev ? { ...prev, ...changes } : prev));
    };

    const handleSubmit = async (e: SyntheticEvent) => {
        e.preventDefault();
        if (!user || !draft || draft.overall === 0) return;

        setIsSaving(true);
        setError('');
        const isFirstRating = !myRating;

        try {
            const { data, error } = await supabase
                .from('recipe_ratings')
                .upsert({
                    post_id: postId,
                    user_id: user.id,
                    author_name: username || 'Anonymous Formulary',
                    version: draft.version,
                    overall: draft.overall,
                    made_it: draft.made_it,
                    // Criteria only count for people who made it (also enforced in the DB)
                    texture: draft.made_it ? draft.texture : null,
                    stability: draft.made_it ? draft.stability : null,
                    ease: draft.made_it ? draft.ease : null,
                    efficacy: draft.made_it ? draft.efficacy : null,
                    skin_type: draft.made_it && draft.skin_type ? draft.skin_type : null,
                    review: draft.review.trim() || null,
                }, { onConflict: 'post_id,user_id' })
                .select('*')
                .single();

            if (error) throw error;
            setRatings(prev => [data, ...prev.filter(r => r.user_id !== user.id)]);
            setDraft(null);

            // Let the author know about new ratings (not edits)
            if (isFirstRating) {
                const { error: notifError } = await supabase.from('notifications').insert([{
                    recipient_id: authorId,
                    actor_name: username || 'Someone',
                    post_id: postId,
                    type: 'rating'
                }]);
                if (notifError) console.error("Error sending rating notification:", notifError);
            }
        } catch (err) {
            setError((err as { message?: string }).message || 'Failed to save your rating.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleRemove = async () => {
        if (!myRating) return;
        if (!(await confirm("Remove your rating for this recipe?", { title: "Remove your rating?", confirmLabel: "Remove rating", tone: "danger" }))) return;

        setIsSaving(true);
        setError('');
        const { error } = await supabase.from('recipe_ratings').delete().eq('id', myRating.id);
        if (error) {
            setError(error.message);
        } else {
            setRatings(prev => prev.filter(r => r.id !== myRating.id));
            setDraft(null);
        }
        setIsSaving(false);
    };

    const skinTypeLabel = (value: SkinType | null) => SKIN_TYPES.find(s => s.value === value)?.label;

    return (
        <div id="ratings" className="bg-white rounded-2xl shadow-sm border border-[#c1d1b9] overflow-hidden">
            <div className="bg-[#e9eee7] px-6 py-4 border-b border-[#c1d1b9]">
                <h3 className="text-lg font-bold text-[#1f382a]">Ratings & Reviews ({stats.count})</h3>
            </div>

            <div className="p-6 space-y-8">
                {isLoading ? (
                    <div className="text-center py-6 text-gray-400 text-sm">Loading ratings...</div>
                ) : stats.count === 0 ? (
                    <div className="text-center py-6 text-gray-500 italic text-sm">
                        No ratings yet. Made this recipe? Share how it turned out!
                    </div>
                ) : (
                    /* Summary */
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        <div className="flex flex-col items-center md:items-start justify-center">
                            <div className="text-5xl font-bold text-[#1f382a]">{stats.average.toFixed(1)}</div>
                            <StarRating value={stats.average} size={20} />
                            <div className="text-xs text-gray-500 mt-2">
                                {stats.count} rating{stats.count !== 1 && 's'} · {stats.madeItCount} made it
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            {stats.distribution.map(({ star, count }) => (
                                <div key={star} className="flex items-center gap-2 text-xs text-gray-600">
                                    <span className="w-3 text-right font-medium">{star}</span>
                                    <span className="text-amber-400">★</span>
                                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-amber-400 rounded-full"
                                            style={{ width: `${(count / stats.count) * 100}%` }}
                                        />
                                    </div>
                                    <span className="w-6 text-right text-gray-400">{count}</span>
                                </div>
                            ))}
                        </div>

                        <div className="space-y-2">
                            <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">From people who made it</div>
                            {stats.criteria.map(c => (
                                <div key={c.key} className="flex items-center justify-between gap-2 text-sm" title={c.hint}>
                                    <span className="text-gray-700">{c.label}</span>
                                    {c.average != null ? (
                                        <span className="flex items-center gap-1.5">
                                            <StarRating value={c.average} size={12} />
                                            <span className="text-xs font-mono text-gray-500 w-6 text-right">{c.average.toFixed(1)}</span>
                                        </span>
                                    ) : (
                                        <span className="text-xs text-gray-400">—</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Your Rating */}
                <div className="border-t border-gray-100 pt-6">
                    {!user ? (
                        <p className="text-sm text-gray-500 text-center">Log in to rate this recipe.</p>
                    ) : isAuthor ? (
                        <p className="text-sm text-gray-500 text-center">You can't rate your own recipe.</p>
                    ) : draft ? (
                        <form onSubmit={handleSubmit} className="space-y-5 bg-[#f7f8f6] border border-gray-200 rounded-xl p-5">
                            <div>
                                <label className="block text-sm font-bold text-[#1f382a] mb-1">Overall rating *</label>
                                <div className="flex items-center gap-3">
                                    <StarRating
                                        value={draft.overall}
                                        onChange={(overall) => updateDraft({ overall })}
                                        size={28}
                                        label="Overall rating"
                                    />
                                    {draft.overall > 0 && (
                                        <span className="text-sm font-medium text-gray-600">{OVERALL_LABELS[draft.overall]}</span>
                                    )}
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-6 items-center">
                                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={draft.made_it}
                                        onChange={(e) => updateDraft({ made_it: e.target.checked })}
                                        className="w-4 h-4 accent-[#2c4c3b]"
                                    />
                                    I made this recipe
                                </label>

                                {versions.length > 1 && (
                                    <label className="flex items-center gap-2 text-sm text-gray-700">
                                        Version
                                        <select
                                            value={draft.version}
                                            onChange={(e) => updateDraft({ version: Number(e.target.value) })}
                                            className="px-2 py-1 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-[#2c4c3b] outline-none"
                                        >
                                            {versions.map(v => <option key={v} value={v}>v{v}</option>)}
                                        </select>
                                    </label>
                                )}
                            </div>

                            {draft.made_it && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-white border border-gray-200 rounded-xl p-4">
                                    {CRITERIA.map(c => (
                                        <div key={c.key}>
                                            <div className="text-sm font-medium text-gray-800">{c.label}</div>
                                            <div className="text-[11px] text-gray-500 mb-1">{c.hint}</div>
                                            <StarRating
                                                value={draft[c.key] ?? 0}
                                                onChange={(v) => updateDraft({ [c.key]: v })}
                                                size={20}
                                                label={c.label}
                                            />
                                        </div>
                                    ))}
                                    <div>
                                        <label htmlFor="rating-skin-type" className="text-sm font-medium text-gray-800">Your skin type</label>
                                        <div className="text-[11px] text-gray-500 mb-1">Helps others judge if it suits them</div>
                                        <select
                                            id="rating-skin-type"
                                            value={draft.skin_type}
                                            onChange={(e) => updateDraft({ skin_type: e.target.value as SkinType | '' })}
                                            className="px-2 py-1 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-[#2c4c3b] outline-none"
                                        >
                                            <option value="">Prefer not to say</option>
                                            {SKIN_TYPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                                        </select>
                                    </div>
                                </div>
                            )}

                            <div>
                                <label htmlFor="rating-review" className="block text-sm font-medium text-gray-800 mb-1">Review (optional)</label>
                                <textarea
                                    id="rating-review"
                                    value={draft.review}
                                    onChange={(e) => updateDraft({ review: e.target.value })}
                                    maxLength={MAX_REVIEW_LENGTH}
                                    placeholder={draft.made_it
                                        ? "How did it turn out? Any substitutions, pH, or stability notes?"
                                        : "What do you think of this formula?"}
                                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#2c4c3b] outline-none text-sm min-h-[80px] resize-y"
                                />
                                <div className="text-[10px] text-gray-400 text-right">{draft.review.length}/{MAX_REVIEW_LENGTH}</div>
                            </div>

                            {error && <div className="text-sm font-medium p-3 rounded-xl bg-red-50 text-red-700">{error}</div>}

                            <div className="flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setDraft(null)}
                                    disabled={isSaving}
                                    className="px-4 py-2 text-sm font-bold text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSaving || draft.overall === 0}
                                    className="px-6 py-2 bg-[#2c4c3b] text-white text-sm font-bold rounded-lg hover:bg-[#1f382a] disabled:opacity-50 transition-colors shadow-sm"
                                >
                                    {isSaving ? 'Saving...' : myRating ? 'Update Rating' : 'Submit Rating'}
                                </button>
                            </div>
                        </form>
                    ) : myRating ? (
                        <div className="flex flex-wrap items-center justify-between gap-3 bg-[#f7f8f6] border border-gray-200 rounded-xl p-4">
                            <div className="flex items-center gap-3 text-sm text-gray-700">
                                <span className="font-bold text-[#1f382a]">Your rating</span>
                                <StarRating value={myRating.overall} size={16} />
                                <span className="text-xs text-gray-500">v{myRating.version}</span>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={startDraft}
                                    className="px-4 py-1.5 text-xs font-bold text-[#2c4c3b] border border-[#c1d1b9] rounded-lg hover:bg-[#e9eee7] transition-colors"
                                >
                                    Edit
                                </button>
                                <button
                                    onClick={handleRemove}
                                    disabled={isSaving}
                                    className="px-4 py-1.5 text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50"
                                >
                                    Remove
                                </button>
                            </div>
                            {error && <div className="w-full text-sm font-medium p-3 rounded-xl bg-red-50 text-red-700">{error}</div>}
                        </div>
                    ) : (
                        <div className="text-center">
                            <button
                                onClick={startDraft}
                                className="px-6 py-2 bg-[#2c4c3b] text-white text-sm font-bold rounded-lg hover:bg-[#1f382a] transition-colors shadow-sm"
                            >
                                ★ Rate this Recipe
                            </button>
                        </div>
                    )}
                </div>

                {/* Individual Reviews */}
                {ratings.length > 0 && (
                    <div className="space-y-4">
                        {ratings.map(r => (
                            <div key={r.id} className="flex gap-4">
                                <div className="w-10 h-10 rounded-full bg-[#cbd8d0] text-[#2c4c3b] flex items-center justify-center font-bold shrink-0">
                                    {r.author_name ? r.author_name.charAt(0).toUpperCase() : '?'}
                                </div>
                                <div className="flex-1 bg-gray-50 p-4 rounded-xl rounded-tl-none border border-gray-100">
                                    <div className="flex flex-wrap justify-between items-center gap-2 mb-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="font-bold text-sm text-[#1f382a]">{r.author_name || 'Anonymous User'}</span>
                                            <StarRating value={r.overall} size={14} />
                                            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-sm bg-[#e9eee7] text-[#2c4c3b] border border-[#c1d1b9]">v{r.version}</span>
                                            {r.made_it && (
                                                <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-sm bg-green-50 text-green-700 border border-green-200">✓ Made it</span>
                                            )}
                                            {r.skin_type && (
                                                <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-sm bg-purple-50 text-purple-700 border border-purple-200">{skinTypeLabel(r.skin_type)} skin</span>
                                            )}
                                        </div>
                                        <span className="text-[10px] text-gray-400">{formatDate(r.updated_at)}</span>
                                    </div>

                                    {r.made_it && CRITERIA.some(c => r[c.key] != null) && (
                                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-500 mb-2">
                                            {CRITERIA.filter(c => r[c.key] != null).map(c => (
                                                <span key={c.key}>{c.label}: <span className="font-bold text-gray-700">{r[c.key]}/5</span></span>
                                            ))}
                                        </div>
                                    )}

                                    {r.review && <p className="text-sm text-gray-700 whitespace-pre-wrap">{r.review}</p>}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
