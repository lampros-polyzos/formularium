import React from 'react';
import { useSettings } from '../contexts/SettingsContext';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
    const { currency, setCurrency, dateFormat, setDateFormat, warningDays, setWarningDays } = useSettings();

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1f382a]/40 backdrop-blur-sm">
            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-[#c1d1b9]">
                <div className="bg-[#e9eee7] px-6 py-4 border-b border-[#c1d1b9] flex justify-between items-center">
                    <h3 className="text-lg font-bold text-[#1f382a]">Global Settings</h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-800 text-2xl font-bold leading-none">
                        &times;
                    </button>
                </div>
                <div className="p-6 space-y-6">

                    {/* Display Preferences */}
                    <div>
                        <h4 className="font-semibold text-[#1f382a] border-b border-gray-100 pb-2 mb-3">Display</h4>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Currency Symbol</label>
                                <select
                                    value={currency}
                                    onChange={(e) => setCurrency(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#2c4c3b] outline-none"
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
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#2c4c3b] outline-none"
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
                    </div>

                    <div className="mt-6 flex justify-end pt-2 border-t border-gray-100">
                        <button
                            onClick={onClose}
                            className="px-6 py-2 bg-[#2c4c3b] text-white rounded-lg font-medium hover:bg-[#1f382a] shadow-sm transition-colors w-full"
                        >
                            Save & Close
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};