package com.demiurgio.formularium.library;

/** The columns of an ingredient row as the app uses them, for queries that join the table as `i`. The three enum columns are read as text. */
public final class IngredientColumns {
    private IngredientColumns() { }

    public static final String SELECT = """
            i.id, i.inci_name, i.trade_name, i.function, i.min_usage_pct, i.max_usage_pct, i.cas_number,
            cast(i.solubility as varchar) as solubility, cast(i.ionic_charge as varchar) as ionic_charge, cast(i.physical_state as varchar) as physical_state,
            i.optimal_ph_min, i.optimal_ph_max, i.max_heating_temp_c, i.is_vegan, i.is_cosmos, cast(i.cost_category as varchar) as cost_category,
            i.description, i.common_uses, i.is_sulfate, i.is_silicone, i.is_paraben, i.is_fragrance, i.cosmos_compliant, i.comedogenic_rating,
            i.user_id, i.default_min_usage, i.default_max_usage, i.notes""";

    /** The keys of those columns in a row map. */
    public static final java.util.Set<String> KEYS = java.util.Set.of(
            "id", "inci_name", "trade_name", "function", "min_usage_pct", "max_usage_pct", "cas_number", "solubility", "ionic_charge", "physical_state",
            "optimal_ph_min", "optimal_ph_max", "max_heating_temp_c", "is_vegan", "is_cosmos", "cost_category", "description", "common_uses", "is_sulfate",
            "is_silicone", "is_paraben", "is_fragrance", "cosmos_compliant", "comedogenic_rating", "user_id", "default_min_usage", "default_max_usage", "notes");
}
