package com.demiurgio.formularium.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

public record ProfileConfig(
    String id,
    String name,
    @JsonProperty("requires_water") boolean requiresWater,
    @JsonProperty("requires_oil") boolean requiresOil,
    @JsonProperty("requires_emulsifier") boolean requiresEmulsifier,
    @JsonProperty("requires_preservative") boolean requiresPreservative,
    @JsonProperty("default_ph_min") Double defaultPhMin,
    @JsonProperty("default_ph_max") Double defaultPhMax,
    @JsonProperty("max_oil_phase_percent") Double maxOilPhasePercent
) {}