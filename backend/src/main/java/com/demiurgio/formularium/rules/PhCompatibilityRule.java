package com.demiurgio.formularium.rules;

import com.demiurgio.formularium.dto.Fix;
import com.demiurgio.formularium.dto.ValidationRequest;
import com.demiurgio.formularium.dto.ValidationResponse;
import org.springframework.stereotype.Component;

@Component
public class PhCompatibilityRule implements ValidationRule {

    private static Fix setPh(double value) {
        double rounded = Math.round(value * 10) / 10.0;
        String shown = rounded == Math.rint(rounded) ? String.valueOf((int) rounded) : String.valueOf(rounded);
        return Fix.setPh(rounded, "Set pH to " + shown);
    }

    @Override
    public void evaluate(ValidationRequest request, ValidationResponse response) {
        if (request.targetPh() == null) return;

        boolean hasOrganicAcid = request.ingredients().stream().anyMatch(i -> {
            String n = i.name().toLowerCase();
            return n.contains("sodium benzoate") || n.contains("potassium sorbate") || n.contains("salicylic acid")
                    || n.contains("benzoic acid") || n.contains("sorbic acid");
        });
        boolean hasNiacinamide = request.ingredients().stream().anyMatch(i -> i.name().toLowerCase().contains("niacinamide"));

        Double profileMin = request.profile() != null ? request.profile().defaultPhMin() : null;
        Double profileMax = request.profile() != null ? request.profile().defaultPhMax() : null;

        if (profileMin != null && request.targetPh() < profileMin) {
            double middle = profileMax != null ? (profileMin + profileMax) / 2 : profileMin;
            response.addAlert("warning", "Target pH is below the recommended minimum for this product type.", setPh(middle));
        }
        if (hasOrganicAcid && request.targetPh() > 5.5) {
            // Only offer a fix when the product type allows a pH low enough for the preservative
            Fix fix = profileMin == null || profileMin <= 5.2 ? setPh(5.2) : null;
            response.addAlert("error", "Preservative failure risk: Organic acids require a pH below 5.5 to convert into their active state.", fix);
        }
        if (hasNiacinamide && request.targetPh() < 5.0) {
            double target = hasOrganicAcid ? 5.2 : 5.5;
            if (profileMax != null && target > profileMax) target = Math.max(5.0, profileMax);
            response.addAlert("error", "Niacinamide risk: At a target pH below 5.0, Niacinamide hydrolyzes into nicotinic acid, causing flushing.", setPh(target));
        }
    }
}