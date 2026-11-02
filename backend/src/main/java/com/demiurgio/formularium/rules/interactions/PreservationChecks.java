package com.demiurgio.formularium.rules.interactions;

import com.demiurgio.formularium.dto.FormulaIngredient;

import java.util.List;

import static com.demiurgio.formularium.rules.interactions.Tag.*;

/** Whether the preservative system actually covers the formula. */
public final class PreservationChecks {

    private PreservationChecks() {}

    public static void run(FormulaContext c) {
        if (!c.hasWater()) return;

        List<FormulaIngredient> preservatives = c.with(PRESERVATIVE);
        if (preservatives.isEmpty()) {
            if (c.has(PRESERVATIVE_BOOSTER)) {
                c.conflict("Booster Is Not a Preservative",
                        c.names(PRESERVATIVE_BOOSTER) + " strengthens preservatives but can't protect a water-based product on its own.",
                        "Add a broad-spectrum preservative and keep the booster alongside it.");
            } else if (!c.profileRequiresPreservative()) {
                // Profiles that require one already raise an error
                c.conflict("No Preservative",
                        "This formula contains water but no preservative, so bacteria, yeast and mold can grow in it within days.",
                        "Add a broad-spectrum preservative at the supplier's recommended rate.");
            }
        } else {
            spectrum(c);
            if (c.has(PRESERVATIVE_BOOSTER)) {
                c.synergy("Boosted Preservation",
                        c.names(PRESERVATIVE_BOOSTER) + " strengthens " + c.names(PRESERVATIVE) + ", giving more reliable protection.",
                        "You can often use the preservative at the lower end of its range.");
            }
            if (c.has(CHELATOR)) {
                c.synergy("Preservative + Chelator",
                        c.names(CHELATOR) + " binds metal ions that would otherwise weaken " + c.names(PRESERVATIVE) + " and darken the product.",
                        null);
            } else if (c.hasAny(CLAY, BOTANICAL)) {
                c.tip("Add a Chelator",
                        c.names(CLAY, BOTANICAL) + " brings in trace metals that weaken preservatives and cause discoloration.",
                        "Add 0.1-0.2% disodium EDTA, sodium phytate or GLDA.");
            }
        }

        if (c.has(CLAY) && c.has(CAPRYLHYDROXAMIC_ACID)) {
            c.conflict("Clay + Caprylhydroxamic Acid",
                    c.names(CAPRYLHYDROXAMIC_ACID) + " binds the iron in " + c.names(CLAY) + " and turns the product orange or red.",
                    "Choose a different preservative for clay products, such as phenoxyethanol & ethylhexylglycerin.");
        }
    }

    private static void spectrum(FormulaContext c) {
        // Broad-spectrum preservatives cover both; narrow ones cover one side only
        boolean bacteria = c.items().stream().anyMatch(i -> i.tags().contains(PRESERVATIVE) && !i.tags().contains(ANTIFUNGAL_ONLY));
        boolean fungi = c.items().stream().anyMatch(i -> i.tags().contains(PRESERVATIVE) && !i.tags().contains(ANTIBACTERIAL_ONLY));
        if (!bacteria) {
            c.conflict("No Protection Against Bacteria",
                    c.names(PRESERVATIVE) + " mainly protects against yeast and mold.",
                    "Pair it with an antibacterial preservative such as phenoxyethanol, benzyl alcohol or a glyceryl caprylate system.");
        }
        if (!fungi) {
            c.conflict("No Protection Against Mold",
                    c.names(PRESERVATIVE) + " is weak against mold and yeast.",
                    "Pair it with an antifungal such as potassium sorbate or sodium dehydroacetate (check the pH range).");
        }
    }
}
