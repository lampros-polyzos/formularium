package com.demiurgio.formularium.rules;

import com.demiurgio.formularium.dto.ValidationRequest;
import com.demiurgio.formularium.dto.ValidationResponse;
import org.springframework.stereotype.Component;

@Component
public class ProfileConstraintRule implements ValidationRule {
    @Override
    public void evaluate(ValidationRequest request, ValidationResponse response) {
        if (request.profile() == null) return;

        boolean hasWater = request.ingredients().stream().anyMatch(i -> 
            i.percentage() > 0 && ("A".equals(i.phase()) || "water".equals(i.solubility()) || "Solvent".equals(i.function())));
        boolean hasOil = request.ingredients().stream().anyMatch(i -> 
            i.percentage() > 0 && ("B".equals(i.phase()) || "oil".equals(i.solubility()) || "Carrier Oil".equals(i.function()) || "Butter".equals(i.function())));
        boolean hasEmulsifier = request.ingredients().stream().anyMatch(i -> 
            i.percentage() > 0 && i.function() != null && i.function().contains("Emulsifier"));
        boolean hasPreservative = request.ingredients().stream().anyMatch(i -> 
            i.percentage() > 0 && "Preservative".equals(i.function()));

        if (request.profile().requiresWater() && !hasWater) {
            response.addAlert("error", "Profile requires a water phase.");
        }
        if (!request.profile().requiresWater() && hasWater) {
            response.addAlert("error", "Water detected in an anhydrous profile. This will cause separation.");
        }
        if (request.profile().requiresOil() && !hasOil) {
            response.addAlert("warning", "Profile usually requires an oil or lipid phase.");
        }
        if (request.profile().requiresEmulsifier() && !hasEmulsifier) {
            response.addAlert("error", "Missing emulsifier. The water and oil phases will separate.");
        }
        if (request.profile().requiresPreservative() && !hasPreservative) {
            response.addAlert("error", "Missing broad-spectrum preservative. This formulation is unsafe for long-term storage.");
        }
        if (request.profile().maxOilPhasePercent() != null && request.oilPhasePercentage() > request.profile().maxOilPhasePercent()) {
            response.addAlert("error", String.format("Oil phase (%.2f%%) exceeds the maximum allowed (%.2f%%) for this profile.", request.oilPhasePercentage(), request.profile().maxOilPhasePercent()));
        }
    }
}