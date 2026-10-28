package com.demiurgio.formularium.rules;

import com.demiurgio.formularium.dto.FormulaIngredient;
import com.demiurgio.formularium.dto.ValidationRequest;
import com.demiurgio.formularium.dto.ValidationResponse;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.stream.Collectors;

@Component
public class UsageRateRule implements ValidationRule {
    @Override
    public void evaluate(ValidationRequest request, ValidationResponse response) {
        
        // Heat Sensitivity
        List<String> misplacedHeat = request.ingredients().stream()
                .filter(i -> i != null && i.maxHeatingTempC() != null && i.maxHeatingTempC() < 50 && !"C".equals(i.phase()))
                .map(i -> i.name()) // Lambda bypasses the strict null-safety warning
                .collect(Collectors.toList());

        if (!misplacedHeat.isEmpty()) {
            response.addAlert("error", "Heat-sensitive ingredients misplaced: " + String.join(", ", misplacedHeat) + " degrade at high temperatures. Move to Phase C.");
        }

        // Min / Max Percentages
        for (FormulaIngredient i : request.ingredients()) {
            if (i.percentage() == 0) continue;

            if (i.maxPercentage() != null && i.percentage() > i.maxPercentage()) {
                response.addAlert("error", String.format("%s is at %.2f%%, exceeding safe usage rate of %.2f%%.", i.name(), i.percentage(), i.maxPercentage()));
            }

            if (i.minPercentage() != null && i.percentage() < i.minPercentage()) {
                String type = ("Preservative".equals(i.function()) || "Emulsifier".equals(i.function())) ? "error" : "warning";
                response.addAlert(type, String.format("%s is at %.2f%%, below minimum effective rate of %.2f%%.", i.name(), i.percentage(), i.minPercentage()));
            }
        }
    }
}