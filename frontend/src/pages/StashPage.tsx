import React, { useState, useEffect } from 'react';
import { addStashLot, changeStashLot, deleteStashLot, fetchStash as fetchStashLots, searchIngredients } from '../lib/libraryApi';
import { useAuth } from '../contexts/AuthContext';
import CustomModal from '../components/CustomModal';
import { useSettings } from '../contexts/SettingsContext';
import ExpiryPicker from '../components/ExpiryPicker';
import { NO_EXPIRY, expiryFromMonth, expiryParts, formatExpiry, isPartialExpiry, parseDay, partsToMonth, type ExpiryParts } from '../lib/expiry';
import StudioLayout from '../components/StudioLayout';

// Types
type DatabaseIngredient = {
    id: string;
    inci_name: string;
    trade_name: string;
    function: string;
};

const NO_RESULTS: DatabaseIngredient[] = [];

type StashItem = {
    id: string;
    user_id: string;
    ingredient_id: string;
    supplier_name: string | null;
    batch_lot_number: string | null;
    amount_left_g: number;
    price_per_g: number | null; // Add this line
    expiration_date: string | null;
    notes: string | null;
    ingredients: DatabaseIngredient;
};

interface StashFormData {
    supplier_name: string;
    batch_lot_number: string;
    amount_left_g: number;
    total_price: number;
    expiration_date: string;
    notes: string;
}

const StashPage = () => {
    const { user } = useAuth();

    // Inventory State
    const [stashItems, setStashItems] = useState<StashItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    // Settings State (Persisted to localStorage)

    const { currency, formatDate, warningDays, dateFormat } = useSettings();

    // Global Search State
    const [searchTerm, setSearchTerm] = useState('');
    const [foundIngredients, setSearchResults] = useState<DatabaseIngredient[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [localSearchTerm, setLocalSearchTerm] = useState('');

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedIngredient, setSelectedIngredient] = useState<DatabaseIngredient | null>(null);
    const [editingStashId, setEditingStashId] = useState<string | null>(null);
    // The month and year picked so far. Either can be missing while choosing, and then the expiry cannot be saved yet
    const [expiry, setExpiry] = useState<ExpiryParts>(NO_EXPIRY);
    const expiryInvalid = isPartialExpiry(expiry);
    // Results are only shown while something is typed (so clearing the box needs no effect to empty them)
    const searchResults = searchTerm.trim() ? foundIngredients : NO_RESULTS;

    // Form State
    const [formData, setFormData] = useState<StashFormData>({
        supplier_name: '',
        batch_lot_number: '',
        amount_left_g: 0,
        total_price: 0,
        expiration_date: '',
        notes: ''
    });

    const [confirmModal, setConfirmModal] = useState({
        isOpen: false,
        title: '',
        message: '',
        targetId: ''
    });

    // Fetch Inventory
    // Fetch Inventory
    useEffect(() => {
        if (!user) return;
        let live = true;
        fetchStashLots()
            .then(lots => { if (live) setStashItems(lots as never); })
            .catch(error => console.error('Error fetching stash:', error))
            .finally(() => { if (live) setIsLoading(false); });
        return () => { live = false; };
    }, [user]);

    // Load again after a change (the first load is the effect above)
    const fetchStash = async () => {
        if (!user) return;
        try {
            setIsLoading(true);
            setStashItems((await fetchStashLots()) as never);
        } catch (error) {
            console.error('Error fetching stash:', error);
        } finally {
            setIsLoading(false);
        }
    };

    // Global Ingredient Search (Debounced)
    useEffect(() => {
        if (!searchTerm.trim()) return;

        const searchGlobalIngredients = async () => {
            setIsSearching(true);
            const cleanTerm = searchTerm.trim();
            try {
                setSearchResults(await searchIngredients({
                    anyOf: [{ column: 'trade_name', op: 'ilike', value: `%${cleanTerm}%` }, { column: 'inci_name', op: 'ilike', value: `%${cleanTerm}%` }],
                    limit: 10,
                }));
            } catch {
                // keep the results already shown
            }
            setIsSearching(false);
        };

        const debounce = setTimeout(searchGlobalIngredients, 300);
        return () => clearTimeout(debounce);
    }, [searchTerm]);

    // Handlers

    const openAddModal = (ingredient: DatabaseIngredient) => {
        setSelectedIngredient(ingredient);
        setEditingStashId(null);
        setExpiry(NO_EXPIRY);
        setFormData({
            supplier_name: '',
            batch_lot_number: '',
            amount_left_g: 0,
            total_price: 0,
            expiration_date: '',
            notes: ''
        });
        setSearchTerm('');
        setSearchResults([]);
        setIsModalOpen(true);
    };

    const openEditModal = (item: StashItem) => {
        setSelectedIngredient(item.ingredients);
        setEditingStashId(item.id);
        setExpiry(expiryParts(item.expiration_date));
        setFormData({
            supplier_name: item.supplier_name || '',
            batch_lot_number: item.batch_lot_number || '',
            amount_left_g: item.amount_left_g || 0,
            total_price: (item.amount_left_g || 0) * (item.price_per_g || 0),
            expiration_date: item.expiration_date || '',
            notes: item.notes || ''
        });
        setIsModalOpen(true);
    };

    const handleSaveStashItem = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !selectedIngredient || expiryInvalid) return;

        // Auto-calculate the price per gram (safeguard against dividing by zero)
        const calculatedPricePerG = formData.amount_left_g > 0
            ? formData.total_price / formData.amount_left_g
            : 0;

        const payload = {
            ingredient_id: selectedIngredient.id,
            supplier_name: formData.supplier_name || null,
            batch_lot_number: formData.batch_lot_number || null,
            amount_left_g: formData.amount_left_g,
            price_per_g: calculatedPricePerG, // Add this
            expiration_date: formData.expiration_date || null,
            notes: formData.notes || null
        };

        try {
            if (editingStashId) {
                await changeStashLot(editingStashId, payload);
            } else {
                await addStashLot(payload);
            }
            setIsModalOpen(false);
            fetchStash();
        } catch (error) {
            console.error('Error saving stash item:', error);
        }
    };

    const requestDelete = (id: string, name: string) => {
        setConfirmModal({
            isOpen: true,
            title: 'Delete Inventory Item',
            message: `Are you sure you want to remove "${name}" from your stash?`,
            targetId: id
        });
    };

    const executeDelete = async () => {
        try {
            await deleteStashLot(confirmModal.targetId);
            setStashItems(prev => prev.filter(item => item.id !== confirmModal.targetId));
            setConfirmModal(prev => ({ ...prev, isOpen: false }));
        } catch (error) {
            console.error('Error deleting stash item:', error);
        }
    };

    // Calculate total inventory value
    const totalStashValue = stashItems.reduce((sum, item) => {
        return sum + (item.amount_left_g * (item.price_per_g || 0));
    }, 0);

    // Filter items based on local search
    const filteredStash = stashItems.filter(item => {
        if (!localSearchTerm) return true;
        const term = localSearchTerm.toLowerCase();
        return item.ingredients.trade_name.toLowerCase().includes(term) ||
            item.ingredients.inci_name.toLowerCase().includes(term);
    });

    return (
        <StudioLayout active="stash" title="My Stash" fixedHeight>
            {/* Main Content */}
            <main className="flex-1 min-h-0 p-10 flex flex-col overflow-hidden">
                <header className="flex justify-between items-center mb-8 shrink-0">
                    <h1 className="text-3xl font-bold text-[#1f382a]">My Stash</h1>

                    {/* Global Search Bar */}
                    <div className="relative w-96">
                        <div className="bg-white px-4 py-2.5 rounded-xl border border-[#c1d1b9] shadow-sm flex items-center gap-3">
                            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Search global library to add stock..."
                                className="w-full bg-transparent text-sm outline-none text-gray-700"
                            />
                            {isSearching && <span className="text-xs text-gray-400 shrink-0">Searching...</span>}
                        </div>

                        {/* Search Dropdown */}
                        {searchResults.length > 0 && (
                            <ul className="absolute top-full left-0 right-0 bg-white border border-[#c1d1b9] mt-1 rounded-xl shadow-xl max-h-80 overflow-y-auto z-20">
                                {searchResults.map((ingredient) => (
                                    <li
                                        key={ingredient.id}
                                        onClick={() => openAddModal(ingredient)}
                                        className="px-4 py-3 border-b border-gray-100 last:border-b-0 hover:bg-[#f3f5f2] cursor-pointer flex flex-col"
                                    >
                                        <span className="font-semibold text-[#1f382a]">{ingredient.trade_name}</span>
                                        <span className="text-xs text-gray-500">{ingredient.inci_name} • {ingredient.function}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </header>

                <div className="flex justify-between items-end mb-4">
                    <div className="bg-white px-4 py-2 rounded-xl border border-[#c1d1b9] shadow-sm flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-500">Total Inventory Value:</span>
                        <span className="text-lg font-bold text-[#2c4c3b]">{currency}{totalStashValue.toFixed(2)}</span>
                    </div>

                    <div className="relative w-72">
                        <input
                            type="text"
                            value={localSearchTerm}
                            onChange={(e) => setLocalSearchTerm(e.target.value)}
                            placeholder="Search my stash..."
                            className="w-full px-4 py-2 bg-white border border-[#c1d1b9] rounded-xl text-sm outline-none focus:ring-1 focus:ring-[#2c4c3b] shadow-sm"
                        />
                    </div>
                </div>

                {/* Inventory Table */}
                <div className="bg-white border border-[#c1d1b9] rounded-2xl shadow-sm flex-1 overflow-hidden flex flex-col">
                    <div className="overflow-x-auto flex-1">
                        <table className="w-full text-left border-collapse text-sm">
                            <thead className="bg-[#f0f4ef] sticky top-0 z-10 shadow-sm">
                                <tr className="text-gray-600 border-b border-[#c1d1b9]">
                                    <th className="px-6 py-4 font-semibold w-[26%]">Ingredient</th>
                                    <th className="px-6 py-4 font-semibold w-[15%]">Supplier</th>
                                    <th className="px-6 py-4 font-semibold w-[15%]">Batch / Lot</th>
                                    <th className="px-6 py-4 font-semibold w-[10%] text-right">Amount (g)</th>
                                    <th className="px-6 py-4 font-semibold w-[12%] text-right">Price/g</th>
                                    <th className="px-6 py-4 font-semibold w-[12%] text-center">Expiration</th>
                                    <th className="px-6 py-4 font-semibold w-[10%] text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {isLoading ? (
                                    <tr>
                                        <td colSpan={7} className="px-6 py-12 text-center text-gray-500">Loading inventory...</td>
                                    </tr>
                                ) : stashItems.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="px-6 py-12 text-center text-gray-500 italic">
                                            Your stash is empty. Search the library above to add ingredients.
                                        </td>
                                    </tr>
                                ) : filteredStash.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="px-6 py-12 text-center text-gray-500 italic">
                                            No ingredients found matching "{localSearchTerm}".
                                        </td>
                                    </tr>
                                ) : (
                                    filteredStash.map((item) => {
                                        // Expiration Warning Logic
                                        const today = new Date();
                                        today.setHours(0, 0, 0, 0);

                                        const expDate = item.expiration_date ? parseDay(item.expiration_date) : null;
                                        const warningDate = new Date(today);
                                        warningDate.setDate(today.getDate() + warningDays);

                                        let rowClass = "border-b border-gray-100 hover:bg-gray-50 transition-colors";
                                        let badgeClass = "bg-gray-100 text-gray-600";

                                        if (expDate) {
                                            if (expDate < today) {
                                                rowClass = "bg-red-50 border-b border-red-100 hover:bg-red-100 transition-colors";
                                                badgeClass = "bg-red-200 text-red-800 font-bold";
                                            } else if (expDate <= warningDate) {
                                                rowClass = "bg-orange-50 border-b border-orange-100 hover:bg-orange-100 transition-colors";
                                                badgeClass = "bg-orange-200 text-orange-800 font-bold";
                                            }
                                        }

                                        const pricePerG = item.price_per_g ?? 0;

                                        return (
                                            <tr key={item.id} className={rowClass}>
                                                <td className="px-6 py-4">
                                                    <div className="font-semibold text-[#1f382a]">{item.ingredients?.trade_name}</div>
                                                    <div className="text-xs text-gray-500">{item.ingredients?.inci_name}</div>
                                                </td>
                                                <td className="px-6 py-4 text-gray-700">{item.supplier_name || '—'}</td>
                                                <td className="px-6 py-4 text-gray-700 font-mono text-xs">{item.batch_lot_number || '—'}</td>
                                                <td className="px-6 py-4 text-right font-medium text-gray-900">
                                                    {item.amount_left_g.toLocaleString()}g
                                                </td>

                                                {/* Price & Total Value Column */}
                                                <td className="px-6 py-4 text-right">
                                                    <div className="font-medium text-gray-900">{currency}{pricePerG.toFixed(3)}</div>
                                                    {pricePerG > 0 && (
                                                        <div className="text-[10px] text-gray-500 mt-0.5 font-medium">
                                                            Val: {currency}{(item.amount_left_g * pricePerG).toFixed(2)}
                                                        </div>
                                                    )}
                                                </td>

                                                <td className="px-6 py-4 text-center">
                                                    {expDate ? (
                                                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs ${badgeClass}`}>
                                                            {formatExpiry(item.expiration_date, formatDate, dateFormat)}
                                                        </span>
                                                    ) : '—'}
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <button
                                                        onClick={() => openEditModal(item)}
                                                        className="text-[#2c4c3b] hover:text-[#1f382a] font-medium mr-4 text-sm"
                                                    >
                                                        Edit
                                                    </button>
                                                    <button
                                                        onClick={() => requestDelete(item.id, item.ingredients.trade_name)}
                                                        className="text-gray-400 hover:text-red-500 transition-colors"
                                                    >
                                                        <svg className="w-4 h-4 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                        </svg>
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </main>

            {/* Add/Edit Modal: a header and footer that stay put, and a middle that scrolls on small screens */}
            {isModalOpen && selectedIngredient && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1f382a]/40 backdrop-blur-sm"
                    onKeyDown={e => { if (e.key === 'Escape') setIsModalOpen(false); }}
                >
                    <form
                        onSubmit={handleSaveStashItem}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="stash-dialog-title"
                        className="bg-white w-full max-w-xl max-h-[92vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden border border-[#c1d1b9]"
                    >
                        <div className="bg-[#e9eee7] px-6 py-4 border-b border-[#c1d1b9] flex justify-between items-start gap-4 shrink-0">
                            <div className="min-w-0">
                                <h3 id="stash-dialog-title" className="text-xl font-bold text-[#1f382a]">
                                    {editingStashId ? 'Edit Stock' : 'Add to Stash'}
                                </h3>
                                <p className="text-sm text-[#3a5a4a] font-medium mt-1 truncate">{selectedIngredient.trade_name}</p>
                                <p className="text-xs text-gray-500 font-mono truncate">{selectedIngredient.inci_name}</p>
                            </div>
                            <button type="button" onClick={() => setIsModalOpen(false)} aria-label="Close" className="text-gray-500 hover:text-gray-800 text-2xl font-bold leading-none">
                                &times;
                            </button>
                        </div>

                        <div className="p-6 space-y-6 overflow-y-auto">
                            <section aria-label="How much you have" className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="stash-amount" className="block text-sm font-medium text-gray-700 mb-1">Amount left (g)*</label>
                                    <input
                                        id="stash-amount"
                                        type="number"
                                        step="0.01"
                                        required
                                        min="0"
                                        value={formData.amount_left_g || ''}
                                        onChange={e => setFormData({ ...formData, amount_left_g: parseFloat(e.target.value) || 0 })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#2c4c3b] outline-none"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="stash-price" className="block text-sm font-medium text-gray-700 mb-1">Total price ({currency})</label>
                                    <input
                                        id="stash-price"
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={formData.total_price === 0 ? '' : formData.total_price}
                                        onChange={e => setFormData({ ...formData, total_price: parseFloat(e.target.value) || 0 })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#2c4c3b] outline-none"
                                        placeholder="e.g. 15.50"
                                    />
                                    {formData.amount_left_g > 0 && formData.total_price > 0 && (
                                        <p className="text-[11px] text-gray-500 mt-1 font-medium">
                                            = {currency}{(formData.total_price / formData.amount_left_g).toFixed(4)} per gram
                                        </p>
                                    )}
                                </div>
                            </section>

                            <section aria-label="Shelf life">
                                <ExpiryPicker
                                    value={expiry}
                                    onChange={next => {
                                        setExpiry(next);
                                        const month = partsToMonth(next);
                                        if (month) {
                                            const original = stashItems.find(s => s.id === editingStashId)?.expiration_date;
                                            setFormData(f => ({ ...f, expiration_date: expiryFromMonth(month, original) }));
                                        } else if (!next.month && !next.year) {
                                            setFormData(f => ({ ...f, expiration_date: '' }));
                                        }
                                    }}
                                />
                            </section>

                            <section aria-label="Where it came from" className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="stash-supplier" className="block text-sm font-medium text-gray-700 mb-1">Supplier</label>
                                    <input
                                        id="stash-supplier"
                                        type="text"
                                        value={formData.supplier_name}
                                        onChange={e => setFormData({ ...formData, supplier_name: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#2c4c3b] outline-none"
                                        placeholder="e.g. MakingCosmetics"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="stash-lot" className="block text-sm font-medium text-gray-700 mb-1">Batch / lot number</label>
                                    <input
                                        id="stash-lot"
                                        type="text"
                                        value={formData.batch_lot_number}
                                        onChange={e => setFormData({ ...formData, batch_lot_number: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#2c4c3b] outline-none"
                                        placeholder="e.g. LOT-2023-A"
                                    />
                                </div>
                                <div className="sm:col-span-2">
                                    <label htmlFor="stash-notes" className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                                    <textarea
                                        id="stash-notes"
                                        value={formData.notes}
                                        onChange={e => setFormData({ ...formData, notes: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#2c4c3b] outline-none min-h-[72px]"
                                        placeholder="Storage requirements, visual condition..."
                                    />
                                </div>
                            </section>
                        </div>

                        <div className="px-6 py-4 flex justify-end gap-3 border-t border-gray-100 bg-gray-50 shrink-0">
                            <button
                                type="button"
                                onClick={() => setIsModalOpen(false)}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={expiryInvalid}
                                className="px-6 py-2 bg-[#2c4c3b] text-white rounded-lg font-medium hover:bg-[#1f382a] shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Save Stock
                            </button>
                        </div>
                    </form>
                </div>
            )}


            {/* Delete Confirmation Modal */}
            <CustomModal
                isOpen={confirmModal.isOpen}
                type="confirm"
                title={confirmModal.title}
                message={confirmModal.message}
                onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                onConfirm={executeDelete}
            />
        </StudioLayout>
    );
};

export default StashPage;