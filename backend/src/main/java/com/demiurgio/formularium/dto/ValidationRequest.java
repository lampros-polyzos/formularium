package com.demiurgio.formularium.dto;

import java.util.List;

public record ValidationRequest(
    String projectName,
    Double targetWeight,
    String profileId,
    ProfileConfig profile,
    List<FormulaIngredient> ingredients,
    List<MarketingClaim> targetClaims,
    double totalPercentage,
    double waterPhasePercentage,
    double oilPhasePercentage,
    Double targetPh
) {}