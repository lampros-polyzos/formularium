import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import StudioLayout from '../components/StudioLayout';
import RecipeMatchCard from '../components/pantry/RecipeMatchCard';
import { useAuth } from '../contexts/AuthContext';
import { useDialog } from '../hooks/useDialog';
import { usePantry } from '../hooks/usePantry';
import { cloneRecipeToStudio } from '../lib/cloneRecipe';
import { cloneLines, filterByCloseness, matchRecipe, rankMatches, usableStash, type Closeness, type RecipeMatch } from '../lib/pantry';

type Source = 'all' | 'own' | 'community';

const CHIP = 'px-3 py-1.5 rounded-full text-sm font-bold border transition-colors';
const chip = (on: boolean) => `${CHIP} ${on ? 'bg-[#2c4c3b] text-white border-[#2c4c3b]' : 'bg-white text-[#2c4c3b] border-[#c1d1b9] hover:bg-[#e9eee7]'}`;

export default function WhatCanIMakePage() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const { alert } = useDialog();
    const { state, reload } = usePantry(user?.id);
    const [cloning, setCloning] = useState(false);
    const [batchText, setBatchText] = useState('100');
    const [source, setSource] = useState<Source>('all');
    const [closeness, setCloseness] = useState<Closeness>('almost');

    const batchG = Number(batchText) > 0 ? Number(batchText) : 100;

    const matches = useMemo(() => {
        if (state.status !== 'ready') return [];
        const { lots, stashIngredients, recipes } = state.data;
        const stash = usableStash(lots);
        return rankMatches(recipes.map(r => matchRecipe(r, stash, stashIngredients, batchG)));
    }, [state, batchG]);

    const handleClone = async (match: RecipeMatch, withSwaps: boolean) => {
        if (!user) return;
        setCloning(true);
        try {
            const { recipe } = match;
            const id = await cloneRecipeToStudio(
                { id: recipe.id, title: recipe.name }, cloneLines(match, withSwaps),
                `${recipe.name} (${withSwaps ? 'Clone with swaps' : 'Clone'})`,
            );
            navigate(`/studio/${id}`);
        } catch (e) {
            void alert(`Failed to clone: ${e instanceof Error ? e.message : 'unknown error'}`, { tone: 'error', title: "Couldn't clone the recipe" });
        } finally {
            setCloning(false);
        }
    };

    const bySource = matches.filter(m => source === 'all' || m.recipe.source === source);
    const shown = filterByCloseness(bySource, closeness);

    return (
        <StudioLayout active="pantry" title="What can I make?">
            <main className="flex-1 p-4 sm:p-8 max-w-4xl w-full mx-auto">
                {state.status === 'loading' && <p className="text-gray-500">Checking your stash against recipes…</p>}

                {state.status === 'error' && (
                    <div role="alert" className="bg-red-50 border border-red-200 text-red-800 rounded-2xl p-5">
                        <p>{state.message}</p>
                        <button type="button" onClick={reload} className="mt-3 px-4 py-2 rounded-full bg-[#2c4c3b] text-white text-sm font-bold">Try again</button>
                    </div>
                )}

                {state.status === 'ready' && state.data.lots.length === 0 && (
                    <div className="text-center py-16 bg-white border border-dashed border-[#c1d1b9] rounded-2xl">
                        <p className="font-bold text-[#1f382a]">Your stash is empty</p>
                        <p className="text-gray-500 mt-1">Add what you own and recipes will be matched against it.</p>
                        <Link to="/stash" className="inline-block mt-4 px-5 py-2.5 bg-[#2c4c3b] text-white text-sm font-bold rounded-full hover:bg-[#1f382a]">Go to My Stash</Link>
                    </div>
                )}

                {state.status === 'ready' && state.data.lots.length > 0 && (
                    <>
                        <p className="text-gray-600 mb-6">
                            Recipes ranked by how much of them you can make from your stash. Where something is missing, a close stand-in from your own stash is suggested.
                        </p>

                        <div className="flex flex-wrap items-end gap-x-6 gap-y-4 mb-6">
                            <label className="text-sm font-bold text-gray-700">
                                Batch size (g)
                                <input
                                    type="number" min={1} value={batchText} onChange={e => setBatchText(e.target.value)}
                                    className="block mt-1 w-28 px-3 py-2 border border-[#c1d1b9] rounded-lg bg-white font-normal"
                                />
                            </label>
                            <div role="group" aria-label="Show recipes from" className="flex gap-2">
                                {(['all', 'own', 'community'] as const).map(s => (
                                    <button key={s} type="button" aria-pressed={source === s} onClick={() => setSource(s)} className={chip(source === s)}>
                                        {s === 'all' ? 'All' : s === 'own' ? 'Mine' : 'Community'}
                                    </button>
                                ))}
                            </div>
                            <div role="group" aria-label="How close" className="flex gap-2">
                                {([['ready', 'Ready'], ['almost', 'Almost there'], ['all', 'Everything']] as const).map(([c, label]) => (
                                    <button key={c} type="button" aria-pressed={closeness === c} onClick={() => setCloseness(c)} className={chip(closeness === c)}>{label}</button>
                                ))}
                            </div>
                        </div>

                        {shown.length > 0 ? (
                            <ul className="space-y-4">{shown.map(m => <RecipeMatchCard key={`${m.recipe.source}-${m.recipe.id}`} match={m} onClone={handleClone} cloning={cloning} />)}</ul>
                        ) : (
                            <div className="text-center py-12 bg-white border border-dashed border-[#c1d1b9] rounded-2xl">
                                <p className="text-gray-600">Nothing matches that closely yet.</p>
                                {closeness !== 'all' && bySource.length > 0 && (
                                    <button type="button" onClick={() => setCloseness('all')} className="mt-3 text-sm font-bold text-[#2c4c3b] hover:underline">
                                        Show all {bySource.length} recipes
                                    </button>
                                )}
                            </div>
                        )}

                        {state.data.limited && source !== 'own' && (
                            <p className="mt-6 text-xs text-gray-500">Only the 200 newest community recipes are checked.</p>
                        )}
                    </>
                )}
            </main>
        </StudioLayout>
    );
}
