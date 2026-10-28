package com.demiurgio.formularium.rules;

import com.demiurgio.formularium.dto.ValidationRequest;
import com.demiurgio.formularium.dto.ValidationResponse;
import org.springframework.stereotype.Component;

@Component
public class PhCompatibilityRule implements ValidationRule {
    @Override
    public void evaluate(ValidationRequest request, ValidationResponse response) {
        if (request.targetPh() == null) return;

        boolean hasOrganicAcid = request.ingredients().stream().anyMatch(i -> {
            String n = i.name().toLowerCase();
            return n.contains("sodium benzoate") || n.contains("potassium sorbate") || n.contains("salicylic acid");
        });
        boolean hasNiacinamide = request.ingredients().stream().anyMatch(i -> i.name().toLowerCase().contains("niacinamide"));

        if (request.profile() != null && request.profile().defaultPhMin() != null && request.targetPh() < request.profile().defaultPhMin()) {
            response.addAlert("warning", "Target pH is below the recommended minimum for this product type.");
        }
        if (hasOrganicAcid && request.targetPh() > 5.5) {
            response.addAlert("error", "Preservative failure risk: Organic acids require a pH below 5.5 to convert into their active state.");
        }
        if (hasNiacinamide && request.targetPh() < 5.0) {
            response.addAlert("error", "Niacinamide risk: At a target pH below 5.0, Niacinamide hydrolyzes into nicotinic acid, causing flushing.");
        }
    }
}