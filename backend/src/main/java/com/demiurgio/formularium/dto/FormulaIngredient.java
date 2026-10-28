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
    Double maxPercentage
) {}