package com.demiurgio.formularium.rules;

import com.demiurgio.formularium.dto.Fix;
import com.demiurgio.formularium.dto.FormulaIngredient;
import com.demiurgio.formularium.dto.ValidationRequest;
import com.demiurgio.formularium.dto.ValidationResponse;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.stream.Collectors;

@Component
public class UsageRateRule implements ValidationRule {

    private static String trim(double value) {
        return java.math.BigDecimal.valueOf(value).setScale(2, java.math.RoundingMode.HALF_UP).stripTrailingZeros().toPlainString();
    }

    @Override
    public void evaluate(ValidationRequest request, ValidationResponse response) {
        
        // Heat Sensitivity
        List<FormulaIngredient> misplaced = request.ingredients().stream()
                .filter(i -> i != null && i.maxHeatingTempC() != null && i.maxHeatingTempC() < 50 && !"C".equals(i.phase()))
                .collect(Collectors.toList());

        if (!misplaced.isEmpty()) {
            String names = misplaced.stream().map(i -> i.displayName()).collect(Collectors.joining(", "));
            response.addAlert("error", "Heat-sensitive ingredients misplaced: " + names + " degrade at high temperatures. Move to Phase C.",
                    Fix.moveToPhase(misplaced.stream().map(FormulaIngredient::id).toList(), "C", "Move to Phase C"));
        }

        // Min / Max Percentages
        for (FormulaIngredient i : request.ingredients()) {
            if (i.percentage() == 0) continue;

            if (i.maxPercentage() != null && i.percentage() > i.maxPercentage()) {
                response.addAlert("error", String.format("%s is at %.2f%%, exceeding safe usage rate of %.2f%%.", i.displayName(), i.percentage(), i.maxPercentage()),
                        Fix.setPercentage(i.id(), i.maxPercentage(), "Lower to " + trim(i.maxPercentage()) + "%"));
            }

            if (i.minPercentage() != null && i.percentage() < i.minPercentage()) {
                String fn = i.function() == null ? "" : i.function();
                boolean critical = (fn.startsWith("Preservative") && !fn.contains("Booster")) || fn.equals("Emulsifier");
                String type = critical ? "error" : "warning";
                response.addAlert(type, String.format("%s is at %.2f%%, below minimum effective rate of %.2f%%.", i.displayName(), i.percentage(), i.minPercentage()),
                        Fix.setPercentage(i.id(), i.minPercentage(), "Raise to " + trim(i.minPercentage()) + "%"));
            }
        }
    }
}