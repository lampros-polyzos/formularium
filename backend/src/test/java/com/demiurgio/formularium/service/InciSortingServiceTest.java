package com.demiurgio.formularium.service;

import com.demiurgio.formularium.dto.FormulaIngredient;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class InciSortingServiceTest {

    private final InciSortingService service = new InciSortingService();

    private static FormulaIngredient ing(String inci, double pct) {
        return new FormulaIngredient(null, inci + " Trade", "Other", "A", pct, "water", null, null, null,
                null, null, null, null, null, null, null, inci, inci + " Trade", null);
    }

    @Test
    void splitsBlendsButKeepsCommasInsideParentheses() {
        assertEquals(List.of("Sodium Benzoate", "Potassium Sorbate"), InciSortingService.splitBlend("Sodium Benzoate (and) Potassium Sorbate"));
        assertEquals(List.of("Cetearyl Olivate", "Sorbitan Olivate"), InciSortingService.splitBlend("Cetearyl Olivate, Sorbitan Olivate"));
        assertEquals(List.of("Iron Oxides (CI 77491, CI 77492)"), InciSortingService.splitBlend("Iron Oxides (CI 77491, CI 77492)"));
    }

    @Test
    void ordersAboveOnePercentByWeightThenTheRestAlphabetically() {
        List<String> order = service.labelOrder(List.of(
                ing("Glycerin", 3),
                ing("Aqua", 80),
                ing("Xanthan Gum", 0.3),
                ing("Butyrospermum Parkii Butter [Raw]", 6),
                ing("Bisabolol", 0.5)
        )).stream().map(InciSortingService.InciEntry::inci).toList();

        assertEquals(List.of("Aqua", "Butyrospermum Parkii Butter", "Glycerin", "Bisabolol", "Xanthan Gum"), order);
    }

    @Test
    void mergesTheSameInciFromDifferentGrades() {
        var entries = service.labelOrder(List.of(ing("Glycerin", 3), ing("Glycerin [Palm-Free / Organic]", 2)));
        assertEquals(1, entries.size());
        assertEquals(5, entries.get(0).percentage(), 1e-9);
    }

    @Test
    void detectsBlends() {
        assertTrue(service.isBlend(ing("Phenoxyethanol, Ethylhexylglycerin", 1)));
    }
}
