import React, { createContext, useContext, useState, useEffect } from 'react';
import { regionFrom, type SellingRegion } from '../lib/regionalLimits';

type SettingsContextType = {
    currency: string;
    setCurrency: (val: string) => void;
    dateFormat: string;
    setDateFormat: (val: string) => void;
    warningDays: number;
    setWarningDays: (val: number) => void;
    /** Stock at or below this many grams counts as running low. */
    lowStockGrams: number;
    setLowStockGrams: (val: number) => void;
    /** Where you plan to sell: formulas are checked against that region's ingredient limits. */
    sellingRegion: SellingRegion;
    setSellingRegion: (val: SellingRegion) => void;
    formatDate: (dateString: string | null) => string;
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [currency, setCurrency] = useState(() => localStorage.getItem('app_currency') || '$');
    const [dateFormat, setDateFormat] = useState(() => localStorage.getItem('app_date_format') || 'en-US');
    const [warningDays, setWarningDays] = useState(() => parseInt(localStorage.getItem('stash_warning_days') || '30', 10));

    const [lowStockGrams, setLowStockGrams] = useState(() => { const v = Number(localStorage.getItem('stash_low_stock_g')); return localStorage.getItem('stash_low_stock_g') !== null && v >= 0 ? v : 20; });
    const [sellingRegion, setSellingRegion] = useState<SellingRegion>(() => regionFrom(localStorage.getItem('selling_region')));

    useEffect(() => {
        localStorage.setItem('app_currency', currency);
        localStorage.setItem('app_date_format', dateFormat);
        localStorage.setItem('stash_warning_days', warningDays.toString());
        localStorage.setItem('selling_region', sellingRegion);
        localStorage.setItem('stash_low_stock_g', lowStockGrams.toString());
    }, [currency, dateFormat, warningDays, sellingRegion, lowStockGrams]);

    const formatDate = (dateString: string | null) => {
        if (!dateString) return '—';
        const date = new Date(dateString);
        switch (dateFormat) {
            case 'en-GB': return date.toLocaleDateString('en-GB');
            case 'sv-SE': return date.toLocaleDateString('sv-SE');
            default: return date.toLocaleDateString('en-US');
        }
    };

    return (
        <SettingsContext.Provider value={{ currency, setCurrency, dateFormat, setDateFormat, warningDays, setWarningDays, lowStockGrams, setLowStockGrams, sellingRegion, setSellingRegion, formatDate }}>
            {children}
        </SettingsContext.Provider>
    );
};

export const useSettings = () => {
    const context = useContext(SettingsContext);
    if (!context) throw new Error('useSettings must be used within a SettingsProvider');
    return context;
};