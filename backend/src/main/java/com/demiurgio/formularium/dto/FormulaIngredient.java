package com.demiurgio.formularium.dto;

public record FormulaIngredient(
    String id,
    String name,
    String function,
    String phase,
    double percentage,
    String solubility,
    Double maxHeatingTempC,
    Double minPercentage,
    Double maxPercentage,
    Boolean isVegan,
    Boolean isSulfate,
    Boolean isSilicone,
    Boolean isParaben,
    Boolean isFragrance,
    Boolean cosmosCompliant,
    Integer comedogenicRating,
    // Optional: separate names for documents (name() combines both for the validation rules)
    String inciName,
    String tradeName,
    String casNumber
) {
    /** Readable name for messages: the trade name when known, else the combined name. */
    public String displayName() {
        return tradeName != null && !tradeName.isBlank() ? tradeName : name;
    }
}