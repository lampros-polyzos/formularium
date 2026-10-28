package com.demiurgio.formularium.service;

import com.demiurgio.formularium.dto.FormulaIngredient;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class InciSortingService {

    public String generateInciString(List<FormulaIngredient> ingredients) {
        List<FormulaIngredient> aboveOne = new ArrayList<>();
        List<FormulaIngredient> belowOne = new ArrayList<>();

        for (FormulaIngredient ing : ingredients) {
            if (ing.percentage() > 1.0) {
                aboveOne.add(ing);
            } else {
                belowOne.add(ing);
            }
        }

        // Sort > 1% in descending order mathematically
        aboveOne.sort((a, b) -> Double.compare(b.percentage(), a.percentage()));
        
        // Sort <= 1% alphabetically for clean presentation
        belowOne.sort((a, b) -> a.name().compareToIgnoreCase(b.name()));

        List<FormulaIngredient> combined = new ArrayList<>(aboveOne);
        combined.addAll(belowOne);

        return combined.stream()
                .filter(java.util.Objects::nonNull) // Guarantees no null objects enter the map
                .map(ing -> ing.name())
                .collect(Collectors.joining(", "));
    }
}