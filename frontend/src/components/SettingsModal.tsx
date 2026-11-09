import React, { useState, useEffect } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { useAuth } from '../contexts/AuthContext';
import { useDialog } from '../hooks/useDialog';
import { updateUsername } from '../lib/authClient';
import { REGIONS, regionFrom } from '../lib/regionalLimits';
import AccountDataSection from './AccountDataSection';
import TwoStepVerification from './TwoStepVerification';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
    const { currency, setCurrency, dateFormat, setDateFormat, warningDays, setWarningDays, lowStockGrams, setLowStockGrams, sellingRegion, setSellingRegion } = useSettings();
    const { user, username } = useAuth();
    const { alert } = useDialog();

    const [displayName, setDisplayName] = useState(username || '');
    const [isSaving, setIsSaving] = useState(false);

    // Sync input if the username loads after the modal is opened
    useEffect(() => {
        if (username) setDisplayName(username);
    }, [username]);

    if (!isOpen) return null;

    const handleSaveAndClose = async () => {
        // Save profile name to database if it was changed
        if (user && displayName.trim() !== (username || '')) {
            setIsSaving(true);
            try {
                // The backend checks the name is free and changes it on everything you have written
                await updateUsername(displayName.trim());
            } catch (error) {
                console.error("Error saving profile:", error);
                setIsSaving(false);
                // Stay here, with what was typed, so it can be tried again
                await alert(error instanceof Error ? error.message : "Failed to save display name.", { tone: "error", title: "Couldn't save your name" });
                return;
            }
            setIsSaving(false);
            onClose();
            return;
        }

        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1f382a]/40 backdrop-blur-sm">
            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-[#c1d1b9] flex flex-col max-h-[90vh]">
                <div className="bg-[#e9eee7] px-6 py-4 border-b border-[#c1d1b9] flex justify-between items-center shrink-0">
                    <h3 className="text-lg font-bold text-[#1f382a]">Global Settings</h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-800 text-2xl font-bold leading-none">
                        &times;
                    </button>
                </div>

                <div className="p-6 space-y-6 overflow-y-auto">

                    {/* Account Profile */}
                    {user && (
                        <div>
                            <h4 className="font-semibold text-[#1f382a] border-b border-gray-100 pb-2 mb-3">Community Profile</h4>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
                                <p className="text-xs text-gray-500 mb-2">How your name will appear on shared recipes and comments.</p>
                                <input
                                    type="text"
                                    value={displayName}
                                    onChange={(e) => setDisplayName(e.target.value)}
                                    placeholder="e.g., OrganicChemist99"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#2c4c3b] outline-none"
                                />
                            </div>
                        </div>
                    )}

                    {/* Display Preferences */}
                    <div>
                        <h4 className="font-semibold text-[#1f382a] border-b border-gray-100 pb-2 mb-3">Display</h4>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Currency Symbol</label>
                                <select
                                    value={currency}
                                    onChange={(e) => setCurrency(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#2c4c3b] outline-none bg-white"
                                >
                                    <option value="$">USD ($)</option>
                                    <option value="€">EUR (€)</option>
                                    <option value="£">GBP (£)</option>
                                    <option value="A$">AUD (A$)</option>
                                    <option value="C$">CAD (C$)</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Date Format</label>
                                <select
                                    value={dateFormat}
                                    onChange={(e) => setDateFormat(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#2c4c3b] outline-none bg-white"
                                >
                                    <option value="en-US">MM/DD/YYYY (US)</option>
                                    <option value="en-GB">DD/MM/YYYY (EU/UK)</option>
                                    <option value="sv-SE">YYYY-MM-DD (ISO)</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Stash Preferences */}
                    <div>
                        <h4 className="font-semibold text-[#1f382a] border-b border-gray-100 pb-2 mb-3">Inventory</h4>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Expiration Warning Window (Days)
                            </label>
                            <p className="text-xs text-gray-500 mb-2">
                                Ingredients expiring within this many days will be highlighted in orange.
                            </p>
                            <input
                                type="number"
                                min="1"
                                max="365"
                                value={warningDays}
                                onChange={(e) => setWarningDays(parseInt(e.target.value) || 30)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#2c4c3b] outline-none"
                            />
                        </div>
                        <div className="mt-4">
                            <label htmlFor="low-stock" className="block text-sm font-medium text-gray-700 mb-1">Low Stock Level (grams)</label>
                            <p className="text-xs text-gray-500 mb-2">
                                An ingredient with this much or less left is flagged as running low on the shopping list. This is the level for ingredients used in large amounts (10% or more of a batch). Ingredients used in small amounts, such as essential oils and preservatives, get proportionally less, so you are only warned when they are nearly gone.
                            </p>
                            <input
                                id="low-stock"
                                type="number"
                                min="0"
                                value={lowStockGrams}
                                onChange={(e) => setLowStockGrams(Math.max(0, parseFloat(e.target.value) || 0))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#2c4c3b] outline-none"
                            />
                        </div>
                    </div>

                    {/* Selling */}
                    <div>
                        <h4 className="font-semibold text-[#1f382a] border-b border-gray-100 pb-2 mb-3">Selling</h4>
                        <label htmlFor="selling-region" className="block text-sm font-medium text-gray-700 mb-1">Where do you plan to sell?</label>
                        <p className="text-xs text-gray-500 mb-2">
                            Formulas are checked against that region's maximum levels (for example salicylic acid and arbutin in the EU), with a warning in the editor when one is over.
                        </p>
                        <select
                            id="selling-region"
                            value={regionFrom(sellingRegion)}
                            onChange={(e) => setSellingRegion(regionFrom(e.target.value))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#2c4c3b] outline-none bg-white"
                        >
                            <option value="none">Not selling (no checks)</option>
                            <option value="eu">{REGIONS.eu.label}</option>
                        </select>
                    </div>

                    {!user?.guest && <TwoStepVerification />}   {/* the demo account is temporary: nothing to secure */}

                    <AccountDataSection />
                </div>

                <div className="bg-gray-50 px-6 py-4 border-t border-gray-100 shrink-0 flex justify-end">
                    <button
                        onClick={handleSaveAndClose}
                        disabled={isSaving}
                        className="px-6 py-2.5 bg-[#2c4c3b] text-white rounded-lg font-bold hover:bg-[#1f382a] shadow-sm transition-colors w-full disabled:opacity-50"
                    >
                        {isSaving ? 'Saving...' : 'Save & Close'}
                    </button>
                </div>
            </div>
        </div>
    );
};