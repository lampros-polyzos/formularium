package com.demiurgio.formularium.rules;

import com.demiurgio.formularium.dto.ValidationRequest;
import com.demiurgio.formularium.dto.ValidationResponse;
import org.springframework.stereotype.Component;

@Component
public class IngredientInteractionRule implements ValidationRule {
    @Override
    public void evaluate(ValidationRequest request, ValidationResponse response) {
        String allNames = request.ingredients().stream().map(i -> i.name().toLowerCase()).reduce("", (a,b) -> a + " " + b);
        String allFuncs = request.ingredients().stream().map(i -> i.function() == null ? "" : i.function().toLowerCase()).reduce("", (a,b) -> a + " " + b);

        boolean hasVitC = allNames.contains("ascorbic acid");
        boolean hasNiacinamide = allNames.contains("niacinamide");
        boolean hasAha = allFuncs.contains("aha") || allNames.contains("glycolic") || allNames.contains("lactic");
        boolean hasBha = allFuncs.contains("bha") || allNames.contains("salicylic");
        boolean hasPeptides = allNames.contains("peptide") || allNames.contains("palmitoyl");
        boolean hasRetinol = allNames.contains("retinol") || allNames.contains("retinoid");
        boolean hasCationic = allFuncs.contains("cationic") || allNames.contains("btms");
        boolean hasAnionic = allFuncs.contains("anionic") || allNames.contains("sodium lauryl");
        boolean hasGum = allNames.contains("xanthan") || allNames.contains("guar");
        boolean hasHumectant = allNames.contains("glycerin") || allNames.contains("propanediol");

        // Conflicts
        if (hasVitC && hasNiacinamide) {
            response.addRecommendation("conflict", "Niacinamide + L-Ascorbic Acid", "Combining pure Vitamin C with Niacinamide at a low pH can cause flushing.", "Use a stabilized Vitamin C derivative.");
        }
        if ((hasAha || hasBha) && hasPeptides) {
            response.addRecommendation("conflict", "Acids + Peptides", "Low pH required for acids can hydrolyze delicate peptides.", "Formulate separately.");
        }
        if ((hasAha || hasBha) && hasRetinol) {
            response.addRecommendation("conflict", "Acids + Retinoids", "Combines strong exfoliants with retinoids increases irritation risk.", "Alternate use morning/night.");
        }
        if (hasAnionic && hasCationic) {
            response.addRecommendation("conflict", "Anionic + Cationic Clash", "Oppositely charged ingredients form an insoluble precipitate.", "Use non-ionic ingredients instead.");
        }

        // Synergies & Tips
        if (hasAha && hasBha) {
            response.addRecommendation("synergy", "AHA + BHA", "Highly effective exfoliation but increases irritation risk.", "Ensure total acid is <10% and add soothing agents.");
        }
        if (hasGum && hasHumectant) {
            response.addRecommendation("synergy", "Polymer Slurry", "You have a gum and liquid humectant.", "Pre-disperse gum into humectant to prevent clumping.");
        } else if (hasGum) {
            response.addRecommendation("tip", "Gum Clumping Risk", "Adding gums directly to water causes clumps.", "Add Glycerin to create a slurry.");
        }
    }
}