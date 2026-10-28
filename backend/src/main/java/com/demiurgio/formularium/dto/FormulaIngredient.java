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
    Integer comedogenicRating
) {}