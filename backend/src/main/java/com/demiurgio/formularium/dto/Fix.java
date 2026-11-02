package com.demiurgio.formularium.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;
import java.util.Objects;

/**
 * A one-click remedy attached to an alert or insight. The server says what should change; the editor carries it out.
 *
 * <ul>
 *   <li>{@code move-phase}: put {@code ingredientIds} into {@code phase}</li>
 *   <li>{@code set-percentage}: set the ingredient in {@code ingredientIds[0]} to {@code value}</li>
 *   <li>{@code set-ph}: set the target pH to {@code value}</li>
 *   <li>{@code balance}: open the balance preview</li>
 *   <li>{@code add-ingredient}: suggest ingredients of a {@code category}</li>
 *   <li>{@code remove-ingredient}: take {@code ingredientIds} out of the formula</li>
 * </ul>
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record Fix(String kind, String label, List<String> ingredientIds, Double value, String phase, String category) {

    public static Fix moveToPhase(List<String> ingredientIds, String phase, String label) {
        return withIds(new Fix("move-phase", label, ids(ingredientIds), null, phase, null));
    }

    public static Fix setPercentage(String ingredientId, double value, String label) {
        return withIds(new Fix("set-percentage", label, ids(ingredientId == null ? List.of() : List.of(ingredientId)), value, null, null));
    }

    public static Fix setPh(double value, String label) {
        return new Fix("set-ph", label, null, value, null, null);
    }

    public static Fix balance(String label) {
        return new Fix("balance", label, null, null, null, null);
    }

    public static Fix add(String category, String label) {
        return new Fix("add-ingredient", label, null, null, null, category);
    }

    public static Fix remove(List<String> ingredientIds, String label) {
        return withIds(new Fix("remove-ingredient", label, ids(ingredientIds), null, null, null));
    }

    private static List<String> ids(List<String> raw) {
        return raw.stream().filter(Objects::nonNull).distinct().toList();
    }

    /** Fixes that act on ingredients are useless without ids (e.g. an unsaved row), so they are dropped. */
    private static Fix withIds(Fix fix) {
        return fix.ingredientIds() == null || fix.ingredientIds().isEmpty() ? null : fix;
    }
}
