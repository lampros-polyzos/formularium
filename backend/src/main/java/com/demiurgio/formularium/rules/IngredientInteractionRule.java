package com.demiurgio.formularium.rules;

import com.demiurgio.formularium.dto.ValidationRequest;
import com.demiurgio.formularium.dto.ValidationResponse;
import com.demiurgio.formularium.rules.interactions.ActiveChecks;
import com.demiurgio.formularium.rules.interactions.FormulaContext;
import com.demiurgio.formularium.rules.interactions.PreservationChecks;
import com.demiurgio.formularium.rules.interactions.StabilityChecks;
import com.demiurgio.formularium.rules.interactions.StructureChecks;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.function.Consumer;

/**
 * Ingredient interactions shown in the editor's "Ingredient Insights" panel:
 * conflicts, synergies and practical formulation tips. Each check group lives in rules/interactions.
 */
@Component
public class IngredientInteractionRule implements ValidationRule {

    private static final List<Consumer<FormulaContext>> CHECKS = List.of(
            ActiveChecks::run,
            StructureChecks::run,
            PreservationChecks::run,
            StabilityChecks::run);

    @Override
    public void evaluate(ValidationRequest request, ValidationResponse response) {
        FormulaContext context = new FormulaContext(request);
        CHECKS.forEach(check -> check.accept(context));
        context.results().forEach(r -> response.addRecommendation(r.type(), r.title(), r.message(), r.action(), r.fix()));
    }
}
