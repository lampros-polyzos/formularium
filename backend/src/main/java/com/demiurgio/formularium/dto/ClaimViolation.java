package com.demiurgio.formularium.dto;

public record ClaimViolation(
    MarketingClaim claim,
    String ingredientName,
    String reason
) {}