package com.demiurgio.formularium.starter;

import java.math.BigDecimal;
import java.util.List;

/**
 * The formulas every new account starts with: three small recipes to open, change and learn from. They were created by a trigger inside the
 * database; the recipes below are the same ones, now part of the application where they can be read, tested and changed.
 *
 * Each line names an ingredient by its INCI name, which must be in the shared library. Every formula adds up to 100%.
 */
public final class StarterFormulas {
    private StarterFormulas() { }

    /** One ingredient in one phase. `qs` means "the rest": the amount fills the batch up to 100%. */
    public record Line(String inciName, String percentage, boolean qs) {
        public BigDecimal amount() { return new BigDecimal(percentage); }
    }

    public record Phase(String letter, List<Line> lines) { }

    public record Formula(String name, String profileId, BigDecimal targetPh, List<Phase> phases) { }

    private static Line line(String inci, String percentage) { return new Line(inci, percentage, false); }
    private static Line rest(String inci, String percentage) { return new Line(inci, percentage, true); }

    public static final List<Formula> ALL = List.of(
            new Formula("Starter: Whipped Body Butter", "body_butter", null, List.of(
                    new Phase("A", List.of(line("Butyrospermum Parkii Butter", "61.0"), line("Simmondsia Chinensis Seed Oil", "38.0"))),
                    new Phase("C", List.of(line("Tocopherol", "1.0"))))),

            new Formula("Starter: Hydrating Gel Cream", "ow_lotion", new BigDecimal("5.5"), List.of(
                    new Phase("A", List.of(rest("Aqua", "75.7"), line("Glycerin", "3.0"), line("Xanthan Gum", "0.3"))),
                    new Phase("B", List.of(line("Caprylic/Capric Triglyceride", "10.0"), line("Cetearyl Alcohol (and) Ceteareth-20", "10.0"))),
                    new Phase("C", List.of(line("Phenoxyethanol (and) Ethylhexylglycerin", "1.0"))))),

            new Formula("Starter: Gentle Daily Face Wash", "body_wash", new BigDecimal("5.5"), List.of(
                    new Phase("A", List.of(rest("Aqua", "64.5"), line("Glycerin", "3.0"), line("Xanthan Gum", "1.0"))),
                    new Phase("B", List.of(line("Cocamidopropyl Betaine", "15.0"), line("Decyl Glucoside", "15.0"))),
                    new Phase("C", List.of(line("Phenoxyethanol (and) Ethylhexylglycerin", "1.0"), line("Citric Acid", "0.5"))))));
}
