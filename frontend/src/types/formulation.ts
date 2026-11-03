export type DatabaseIngredient = {
    id: string;
    inci_name: string;
    trade_name: string;
    function: string;
    solubility: string;
    max_heating_temp_c: number | null;
    optimal_ph_min: number | null;
    optimal_ph_max: number | null;
    ionic_charge?: string | null;
    default_min_usage?: number | null;
    default_max_usage?: number | null;
    min_usage_pct: number | null;
    max_usage_pct: number | null;
    description?: string;
    common_uses?: string;
    min_percentage?: number | null;
    max_percentage?: number | null;
    QS?: boolean;
};

export type FormulaIngredient = DatabaseIngredient & {
    phase: 'A' | 'B' | 'C';
    percentage: number;
    isQS: boolean;
    originalIndex?: number;
    is_vegan?: boolean;
    is_sulfate?: boolean;
    is_silicone?: boolean;
    is_paraben?: boolean;
    is_fragrance?: boolean;
    cosmos_compliant?: boolean;
    comedogenic_rating?: number;
    cas_number?: string | null;
    substitutedFor?: FormulaIngredient; // in-memory only, lets the user undo a swap
    locked?: boolean; // in-memory only: balancing never changes a locked percentage
};

export type ProfileConfig = {
    id: string;
    name: string;
    category: string;
    max_oil_phase_percent: number | null;
    default_ph_min: number | null;
    default_ph_max: number | null;
    requires_water?: boolean;
    requires_oil?: boolean;
    requires_emulsifier?: boolean;
    requires_preservative?: boolean;
};
