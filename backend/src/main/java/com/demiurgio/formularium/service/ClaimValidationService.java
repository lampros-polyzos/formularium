package com.demiurgio.formularium.service;

import com.demiurgio.formularium.dto.ClaimViolation;
import com.demiurgio.formularium.dto.FormulaIngredient;
import com.demiurgio.formularium.dto.MarketingClaim;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

@Service
public class ClaimValidationService {

    public List<ClaimViolation> validateClaims(List<FormulaIngredient> ingredients, List<MarketingClaim> targetClaims) {
        List<ClaimViolation> violations = new ArrayList<>();

        if (targetClaims == null || targetClaims.isEmpty() || ingredients == null || ingredients.isEmpty()) {
            return violations;
        }

        for (FormulaIngredient ing : ingredients) {
            for (MarketingClaim claim : targetClaims) {
                switch (claim) {
                    case VEGAN -> {
                        if (Boolean.FALSE.equals(ing.isVegan())) {
                            violations.add(new ClaimViolation(claim, ing.name(), "Ingredient is animal-derived or a byproduct."));
                        }
                    }
                    case SULFATE_FREE -> {
                        if (Boolean.TRUE.equals(ing.isSulfate())) {
                            violations.add(new ClaimViolation(claim, ing.name(), "Ingredient is an alkyl or ether sulfate."));
                        }
                    }
                    case SILICONE_FREE -> {
                        if (Boolean.TRUE.equals(ing.isSilicone())) {
                            violations.add(new ClaimViolation(claim, ing.name(), "Ingredient contains siloxane or synthetic polymer chains."));
                        }
                    }
                    case PARABEN_FREE -> {
                        if (Boolean.TRUE.equals(ing.isParaben())) {
                            violations.add(new ClaimViolation(claim, ing.name(), "Ingredient is a paraben ester."));
                        }
                    }
                    case FRAGRANCE_FREE -> {
                        if (Boolean.TRUE.equals(ing.isFragrance())) {
                            violations.add(new ClaimViolation(claim, ing.name(), "Ingredient is a synthetic fragrance or essential oil."));
                        }
                    }
                    case COSMOS -> {
                        if (Boolean.FALSE.equals(ing.cosmosCompliant())) {
                            violations.add(new ClaimViolation(claim, ing.name(), "Ingredient is not COSMOS Natural/Organic certified."));
                        }
                    }
                    case NON_COMEDOGENIC -> {
                        int rating = ing.comedogenicRating() != null ? ing.comedogenicRating() : 0;
                        if (rating > 2) {
                            violations.add(new ClaimViolation(claim, ing.name(), "Comedogenic rating is " + rating + " (threshold is ≤2)."));
                        }
                    }
                }
            }
        }
        return violations;
    }
}