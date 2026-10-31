import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { SettingsModal } from '../components/SettingsModal';

type IngredientItem = {
    id: string;
    trade_name: string;
    inci_name: string;
    function: string;
    solubility?: string | null;
    default_min_usage?: number | null;
    default_max_usage?: number | null;
    notes?: string | null;
    user_id?: string | null;
};

interface CustomIngredientForm {
    trade_name: string;
    inci_name: string;
    function: string;
    solubility: string;
    default_min_usage: number;
    default_max_usage: number;
    notes: string;
}

const FUNCTIONS = [
    'All',
    'Emulsifier',
    'Surfactant',
    'Active',
    'Preservative',
    'Emollient',
    'Thickener',
    'Humectant',
    'Antioxidant',
    'Other'
];

const SOLUBILITIES = ['All', 'water', 'oil', 'alcohol', 'silicone', 'dispersible'];

const IngredientsLibraryPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    useSettings();

    const [ingredients, setIngredients] = useState<IngredientItem[]>([]);
    const [starredIds, setStarredIds] = useState<Set<string>>(new Set());
    const [isLoading, setIsLoading] = useState(true);
    const [isGlobalSettingsOpen, setIsGlobalSettingsOpen] = useState(false);

    // Filter states
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedFunction, setSelectedFunction] = useState('All');
    const [selectedSolubility, setSelectedSolubility] = useState('All');
    const [showOnlyFavorites, setShowOnlyFavorites] = useState(false);
    const [showOnlyCustom, setShowOnlyCustom] = useState(false);

    // Modal state for Custom Ingredient Creation
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [formData, setFormData] = useState<CustomIngredientForm>({
        trade_name: '',
        inci_name: '',
        function: 'Active',
        solubility: 'Water',
        default_min_usage: 0,
        default_max_usage: 5,
        notes: ''
    });

    // Detail Drawer / Modal
    const [inspectingIngredient, setInspectingIngredient] = useState<IngredientItem | null>(null);

    // Fetch master list and user favorites
    const fetchLibrary = async () => {
        if (!user) return;
        try {
            setIsLoading(true);

            // Fetch ingredients (global + custom)
            const { data: ingData, error: ingError } = await supabase
                .from('ingredients')
                .select('*')
                .order('trade_name', { ascending: true });

            if (ingError) throw ingError;

            // Fetch starred records
            const { data: starData, error: starError } = await supabase
                .from('user_starred_ingredients')
                .select('ingredient_id')
                .eq('user_id', user.id);

            if (starError) throw starError;

            setIngredients(ingData || []);
            setStarredIds(new Set((starData || []).map(s => s.ingredient_id)));
        } catch (error) {
            console.error('Error fetching ingredients library:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchLibrary();
    }, [user]);

    // Star / Unstar toggle
    const toggleStar = async (ingredientId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!user) return;

        const isStarred = starredIds.has(ingredientId);

        // Optimistic UI update
        setStarredIds(prev => {
            const next = new Set(prev);
            if (isStarred) next.delete(ingredientId);
            else next.add(ingredientId);
            return next;
        });

        try {
            if (isStarred) {
                await supabase
                    .from('user_starred_ingredients')
                    .delete()
                    .eq('user_id', user.id)
                    .eq('ingredient_id', ingredientId);
            } else {
                await supabase
                    .from('user_starred_ingredients')
                    .insert([{ user_id: user.id, ingredient_id: ingredientId }]);
            }
        } catch (error) {
            console.error('Failed to toggle favorite:', error);
            // Revert state if error occurs
            fetchLibrary();
        }
    };

    // Save custom ingredient
    const handleSaveCustomIngredient = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;

        try {
            const payload = {
                user_id: user.id,
                trade_name: formData.trade_name,
                inci_name: formData.inci_name,
                function: formData.function,
                solubility: formData.solubility,
                default_min_usage: formData.default_min_usage,
                default_max_usage: formData.default_max_usage,
                notes: formData.notes || null
            };

            const { error } = await supabase.from('ingredients').insert([payload]);
            if (error) throw error;

            setIsAddModalOpen(false);
            setFormData({
                trade_name: '',
                inci_name: '',
                function: 'Active',
                solubility: 'Water',
                default_min_usage: 0,
                default_max_usage: 5,
                notes: ''
            });
            fetchLibrary();
        } catch (error) {
            console.error('Error creating custom ingredient:', error);
        }
    };

    // Filtered result calculation
    const filteredIngredients = useMemo(() => {
        return ingredients.filter(item => {
            if (showOnlyFavorites && !starredIds.has(item.id)) return false;
            if (showOnlyCustom && !item.user_id) return false;
            if (selectedFunction !== 'All' && item.function !== selectedFunction) return false;
            if (selectedSolubility !== 'All' && item.solubility !== selectedSolubility) return false;

            if (searchTerm.trim()) {
                const term = searchTerm.toLowerCase();
                const tradeMatch = item.trade_name.toLowerCase().includes(term);
                const inciMatch = item.inci_name?.toLowerCase().includes(term);
                if (!tradeMatch && !inciMatch) return false;
            }

            return true;
        });
    }, [ingredients, starredIds, showOnlyFavorites, showOnlyCustom, selectedFunction, selectedSolubility, searchTerm]);

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        navigate('/');
    };

    return (
        <div className="min-h-screen bg-[#f7f8f6] flex">
            {/* Sidebar */}
            <aside className="w-64 bg-white border-r border-[#c1d1b9] p-6 flex flex-col shrink-0">
                <div className="flex items-center gap-3 text-[#1f382a] mb-10">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                    </svg>
                    <span className="font-bold text-xl">Formularium</span>
                </div>

                <nav className="flex-1 space-y-2">
                    <button onClick={() => navigate('/studio')} className="w-full flex items-center gap-3 px-4 py-3 text-gray-600 hover:bg-gray-50 rounded-xl font-medium transition-colors">
                        My Formulations
                    </button>
                    <button onClick={() => navigate('/stash')} className="w-full flex items-center gap-3 px-4 py-3 text-gray-600 hover:bg-gray-50 rounded-xl font-medium transition-colors">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                        My Stash
                    </button>
                    <button onClick={() => navigate('/containers')} className="w-full flex items-center gap-3 px-4 py-3 text-gray-600 hover:bg-gray-50 rounded-xl font-medium transition-colors">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                        Containers
                    </button>
                    <button className="w-full flex items-center gap-3 px-4 py-3 bg-[#e8f0e5] text-[#1f382a] rounded-xl font-medium transition-colors mt-4 border-t border-gray-100 pt-6">
                        Ingredients Library
                    </button>
                    <button onClick={() => setIsGlobalSettingsOpen(true)} className="w-full flex items-center gap-3 px-4 py-3 text-gray-600 hover:bg-gray-50 rounded-xl font-medium transition-colors">
                        Settings
                    </button>
                </nav>

                <div className="pt-6 border-t border-gray-100">
                    <p className="text-sm text-gray-500 mb-4 truncate">{user?.email}</p>
                    <button onClick={handleSignOut} className="w-full py-2.5 px-4 rounded-xl border border-gray-300 text-sm font-bold text-gray-700 hover:bg-gray-50 transition-colors">
                        Sign Out
                    </button>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 p-10 flex flex-col h-screen overflow-hidden">
                <header className="flex justify-between items-center mb-6 shrink-0">
                    <div>
                        <h1 className="text-3xl font-bold text-[#1f382a]">Ingredients Library</h1>
                        <p className="text-sm text-gray-500 mt-1">Cosmetic raw materials encyclopedia and custom chemical profiles.</p>
                    </div>
                    <button
                        onClick={() => setIsAddModalOpen(true)}
                        className="py-2.5 px-6 rounded-full shadow-sm text-sm font-bold text-white bg-[#2c4c3b] hover:bg-[#1f382a] transition-colors"
                    >
                        + Custom Ingredient
                    </button>
                </header>

                {/* Filter and Search Bar */}
                <div className="bg-white p-4 rounded-2xl border border-[#c1d1b9] shadow-sm mb-6 flex flex-wrap gap-4 items-center shrink-0">
                    {/* Search */}
                    <div className="relative flex-1 min-w-[240px]">
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Search by Trade Name or INCI..."
                            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:ring-1 focus:ring-[#2c4c3b]"
                        />
                        <svg className="w-4 h-4 text-gray-400 absolute left-3 top-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>

                    {/* Function Select */}
                    <select
                        value={selectedFunction}
                        onChange={(e) => setSelectedFunction(e.target.value)}
                        className="px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none text-gray-700"
                    >
                        {FUNCTIONS.map(f => (
                            <option key={f} value={f}>Function: {f}</option>
                        ))}
                    </select>

                    {/* Solubility Select */}
                    <select
                        value={selectedSolubility}
                        onChange={(e) => setSelectedSolubility(e.target.value)}
                        className="px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none text-gray-700"
                    >
                        {SOLUBILITIES.map(s => (
                            <option key={s} value={s}>
                                Solubility: {s === 'All' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
                            </option>
                        ))}
                    </select>

                    {/* Toggles */}
                    <button
                        onClick={() => setShowOnlyFavorites(prev => !prev)}
                        className={`px-3 py-2 rounded-xl text-sm font-medium border flex items-center gap-1.5 transition-colors ${showOnlyFavorites ? 'bg-amber-50 border-amber-300 text-amber-800' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                            }`}
                    >
                        <svg className={`w-4 h-4 ${showOnlyFavorites ? 'text-amber-500 fill-amber-500' : 'text-gray-400'}`} viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                        </svg>
                        Favorites
                    </button>

                    <button
                        onClick={() => setShowOnlyCustom(prev => !prev)}
                        className={`px-3 py-2 rounded-xl text-sm font-medium border transition-colors ${showOnlyCustom ? 'bg-[#e8f0e5] border-[#2c4c3b] text-[#1f382a]' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                            }`}
                    >
                        Custom Only
                    </button>
                </div>

                {/* Ingredients Grid */}
                <div className="flex-1 overflow-y-auto">
                    {isLoading ? (
                        <div className="text-center text-gray-500 py-16">Loading cosmetic encyclopedia...</div>
                    ) : filteredIngredients.length === 0 ? (
                        <div className="text-center text-gray-500 py-16 italic">No ingredients match your active filters.</div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-8">
                            {filteredIngredients.map(item => {
                                const isStarred = starredIds.has(item.id);
                                return (
                                    <div
                                        key={item.id}
                                        onClick={() => setInspectingIngredient(item)}
                                        className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm hover:border-[#2c4c3b] cursor-pointer transition-all flex flex-col justify-between"
                                    >
                                        <div>
                                            <div className="flex justify-between items-start mb-2">
                                                <div className="flex items-center gap-2">
                                                    <h3 className="font-bold text-[#1f382a] line-clamp-1">{item.trade_name}</h3>
                                                    {item.user_id && (
                                                        <span className="text-[10px] bg-emerald-100 text-emerald-800 font-semibold px-2 py-0.5 rounded-full">
                                                            Custom
                                                        </span>
                                                    )}
                                                </div>
                                                <button
                                                    onClick={(e) => toggleStar(item.id, e)}
                                                    className="p-1 hover:scale-110 transition-transform"
                                                    title={isStarred ? 'Remove from favorites' : 'Add to favorites'}
                                                >
                                                    <svg
                                                        className={`w-5 h-5 ${isStarred ? 'text-amber-400 fill-amber-400' : 'text-gray-300'}`}
                                                        fill={isStarred ? 'currentColor' : 'none'}
                                                        stroke="currentColor"
                                                        viewBox="0 0 24 24"
                                                    >
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                                                    </svg>
                                                </button>
                                            </div>
                                            <p className="text-xs text-gray-500 font-mono mb-3 line-clamp-2">{item.inci_name}</p>
                                        </div>

                                        <div className="flex justify-between items-center pt-3 border-t border-gray-100 text-xs">
                                            <span className="bg-gray-100 text-gray-600 px-2.5 py-1 rounded-md font-medium">
                                                {item.function}
                                            </span>
                                            {item.solubility && (
                                                <span className="text-gray-500">
                                                    Sol: <strong className="text-gray-700">{item.solubility}</strong>
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </main>

            {/* Custom Ingredient Modal */}
            {isAddModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1f382a]/40 backdrop-blur-sm">
                    <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-[#c1d1b9] overflow-hidden">
                        <div className="bg-[#e9eee7] px-6 py-4 border-b border-[#c1d1b9] flex justify-between items-center">
                            <h3 className="text-xl font-bold text-[#1f382a]">New Custom Ingredient</h3>
                            <button onClick={() => setIsAddModalOpen(false)} className="text-gray-500 hover:text-gray-800 text-2xl font-bold leading-none">&times;</button>
                        </div>
                        <form onSubmit={handleSaveCustomIngredient} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Trade / Commercial Name*</label>
                                <input
                                    type="text"
                                    required
                                    value={formData.trade_name}
                                    onChange={e => setFormData({ ...formData, trade_name: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#2c4c3b] outline-none"
                                    placeholder="e.g. Niacinamide PC"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">INCI Name*</label>
                                <input
                                    type="text"
                                    required
                                    value={formData.inci_name}
                                    onChange={e => setFormData({ ...formData, inci_name: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#2c4c3b] outline-none"
                                    placeholder="e.g. Niacinamide"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Primary Function</label>
                                    <select
                                        value={formData.function}
                                        onChange={e => setFormData({ ...formData, function: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#2c4c3b] outline-none"
                                    >
                                        {FUNCTIONS.filter(f => f !== 'All').map(f => (
                                            <option key={f} value={f}>{f}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Solubility</label>
                                    <select
                                        value={formData.solubility}
                                        onChange={e => setFormData({ ...formData, solubility: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#2c4c3b] outline-none"
                                    >
                                        {SOLUBILITIES.filter(s => s !== 'All').map(s => (
                                            <option key={s} value={s}>
                                                {s.charAt(0).toUpperCase() + s.slice(1)}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Min Usage Rate (%)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        max="100"
                                        value={formData.default_min_usage}
                                        onChange={e => setFormData({ ...formData, default_min_usage: parseFloat(e.target.value) || 0 })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#2c4c3b] outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Max Usage Rate (%)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        max="100"
                                        value={formData.default_max_usage}
                                        onChange={e => setFormData({ ...formData, default_max_usage: parseFloat(e.target.value) || 0 })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#2c4c3b] outline-none"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Formulator Notes & Constraints</label>
                                <textarea
                                    value={formData.notes}
                                    onChange={e => setFormData({ ...formData, notes: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#2c4c3b] outline-none min-h-[70px]"
                                    placeholder="Heat sensitivity, recommended pH window, incompatibilities..."
                                />
                            </div>

                            <div className="pt-4 flex justify-end gap-3 border-t border-gray-100">
                                <button
                                    type="button"
                                    onClick={() => setIsAddModalOpen(false)}
                                    className="px-4 py-2 text-gray-600 hover:bg-gray-50 rounded-lg font-medium"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-6 py-2 bg-[#2c4c3b] text-white rounded-lg font-medium hover:bg-[#1f382a] shadow-sm"
                                >
                                    Save Profile
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Inspect Modal / Details Drawer */}
            {inspectingIngredient && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1f382a]/40 backdrop-blur-sm">
                    <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-[#c1d1b9] overflow-hidden">
                        <div className="bg-[#e9eee7] px-6 py-4 border-b border-[#c1d1b9] flex justify-between items-start">
                            <div>
                                <h3 className="text-xl font-bold text-[#1f382a]">{inspectingIngredient.trade_name}</h3>
                                <p className="text-xs text-gray-600 font-mono mt-1">{inspectingIngredient.inci_name}</p>
                            </div>
                            <button onClick={() => setInspectingIngredient(null)} className="text-gray-500 hover:text-gray-800 text-2xl font-bold leading-none">&times;</button>
                        </div>
                        <div className="p-6 space-y-4 text-sm">
                            <div className="grid grid-cols-2 gap-4 pb-4 border-b border-gray-100">
                                <div>
                                    <span className="text-xs text-gray-400 uppercase font-semibold">Function</span>
                                    <div className="font-medium text-gray-800 mt-0.5">{inspectingIngredient.function}</div>
                                </div>
                                <div>
                                    <span className="text-xs text-gray-400 uppercase font-semibold">Solubility</span>
                                    <div className="font-medium text-gray-800 mt-0.5">{inspectingIngredient.solubility || 'Not specified'}</div>
                                </div>
                            </div>

                            {(inspectingIngredient.default_min_usage !== undefined || inspectingIngredient.default_max_usage !== undefined) && (
                                <div className="pb-4 border-b border-gray-100">
                                    <span className="text-xs text-gray-400 uppercase font-semibold">Recommended Usage</span>
                                    <div className="font-medium text-gray-800 mt-0.5">
                                        {inspectingIngredient.default_min_usage ?? 0}% – {inspectingIngredient.default_max_usage ?? 100}%
                                    </div>
                                </div>
                            )}

                            <div>
                                <span className="text-xs text-gray-400 uppercase font-semibold">Formulation Notes</span>
                                <p className="text-gray-600 mt-1 whitespace-pre-wrap leading-relaxed">
                                    {inspectingIngredient.notes || 'No technical notes recorded for this ingredient.'}
                                </p>
                            </div>

                            <div className="pt-4 flex justify-end">
                                <button
                                    onClick={() => setInspectingIngredient(null)}
                                    className="px-6 py-2 bg-[#2c4c3b] text-white rounded-lg font-medium hover:bg-[#1f382a] shadow-sm"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <SettingsModal isOpen={isGlobalSettingsOpen} onClose={() => setIsGlobalSettingsOpen(false)} />
        </div>
    );
};

export default IngredientsLibraryPage;