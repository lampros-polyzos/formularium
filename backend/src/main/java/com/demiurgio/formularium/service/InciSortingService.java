package com.demiurgio.formularium.service;

import com.demiurgio.formularium.dto.FormulaIngredient;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

@Service
public class InciSortingService {

    /** One entry of the label ingredient list, with duplicates merged. */
    public record InciEntry(String inci, double percentage) {}

    /**
     * Label order (EU Reg. 1223/2009 Art. 19): ingredients above 1% in descending order of weight,
     * then those at or below 1% (any order allowed; alphabetical here for a clean read).
     */
    public List<InciEntry> labelOrder(List<FormulaIngredient> ingredients) {
        Map<String, InciEntry> merged = new LinkedHashMap<>();
        for (FormulaIngredient ing : ingredients) {
            if (ing == null || ing.percentage() <= 0) continue;
            // Blends are declared as their components. Their split isn't known, so each is ranked by the blend's %
            for (String inci : splitBlend(inciOf(ing))) {
                merged.merge(inci.toLowerCase(), new InciEntry(inci, ing.percentage()),
                        (a, b) -> new InciEntry(a.inci(), a.percentage() + b.percentage()));
            }
        }

        List<InciEntry> aboveOne = new ArrayList<>();
        List<InciEntry> belowOne = new ArrayList<>();
        for (InciEntry entry : merged.values()) {
            (entry.percentage() > 1.0 ? aboveOne : belowOne).add(entry);
        }
        aboveOne.sort((a, b) -> Double.compare(b.percentage(), a.percentage()));
        belowOne.sort((a, b) -> a.inci().compareToIgnoreCase(b.inci()));

        List<InciEntry> combined = new ArrayList<>(aboveOne);
        combined.addAll(belowOne);
        return combined;
    }

    public String generateInciString(List<FormulaIngredient> ingredients) {
        return String.join(", ", labelOrder(ingredients).stream().map(InciEntry::inci).filter(Objects::nonNull).toList());
    }

    /** True when the ingredient is a supplier blend of several INCI components. */
    public boolean isBlend(FormulaIngredient ing) {
        return splitBlend(inciOf(ing)).size() > 1;
    }

    /** "A (and) B", "A, B" -> [A, B]; commas inside parentheses (e.g. CI numbers) are kept. */
    static List<String> splitBlend(String inci) {
        List<String> parts = new ArrayList<>();
        for (String chunk : inci.split("(?i)\\s*\\(and\\)\\s*")) {
            int depth = 0;
            StringBuilder current = new StringBuilder();
            for (char c : chunk.toCharArray()) {
                if (c == '(') depth++;
                if (c == ')') depth = Math.max(0, depth - 1);
                if (c == ',' && depth == 0) {
                    addPart(parts, current.toString());
                    current.setLength(0);
                } else {
                    current.append(c);
                }
            }
            addPart(parts, current.toString());
        }
        return parts;
    }

    private static void addPart(List<String> parts, String part) {
        String trimmed = part.trim();
        if (!trimmed.isEmpty()) parts.add(trimmed);
    }

    private static String inciOf(FormulaIngredient ing) {
        if (ing.inciName() != null && !ing.inciName().isBlank()) {
            // Grade tags like "[Raw]" are catalogue details, not part of the INCI name
            return ing.inciName().replaceAll("\\s*\\[[^\\]]*\\]", "").trim();
        }
        return ing.name() == null ? "Unknown" : ing.name();
    }
}
