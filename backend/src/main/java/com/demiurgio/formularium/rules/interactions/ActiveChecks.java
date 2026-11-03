package com.demiurgio.formularium.rules.interactions;

import com.demiurgio.formularium.dto.Fix;
import com.demiurgio.formularium.dto.FormulaIngredient;
import java.util.Locale;

import static com.demiurgio.formularium.rules.interactions.Tag.*;

/** Conflicts and synergies between skin actives. */
public final class ActiveChecks {

    private ActiveChecks() {}

    private static final double MAX_LEAVE_ON_EXFOLIANT_PCT = 10;

    public static void run(FormulaContext c) {
        conflicts(c);
        exfoliation(c);
        synergies(c);
    }

    private static void conflicts(FormulaContext c) {
        if (c.has(L_ASCORBIC_ACID) && c.has(NIACINAMIDE)) {
            c.conflict("L-Ascorbic Acid + Niacinamide",
                    "These need opposite pH: L-ascorbic acid works at pH 2.5-3.5, niacinamide at 5-6. At a compromise pH both perform poorly, and at low pH niacinamide can turn into nicotinic acid, which causes flushing.",
                    "Pair niacinamide with a vitamin C derivative (SAP, MAP, ascorbyl glucoside or ethyl ascorbic acid), or keep them in separate products.");
        }
        if (c.has(L_ASCORBIC_ACID) && c.has(RETINOID)) {
            c.conflict("Vitamin C + Retinoid",
                    c.names(L_ASCORBIC_ACID) + " needs a very low pH, while " + c.names(RETINOID) + " is most stable around pH 5.5-6.5. Together they are also a common cause of irritation.",
                    "Use vitamin C in a morning product and the retinoid in an evening product.");
        }
        if (c.has(COPPER_PEPTIDE)) {
            if (c.hasAny(L_ASCORBIC_ACID, VITAMIN_C_DERIVATIVE)) {
                c.conflict("Copper Peptides + Vitamin C",
                        "Copper ions speed up the oxidation of " + c.names(L_ASCORBIC_ACID, VITAMIN_C_DERIVATIVE) + ", and vitamin C can reduce the copper so the peptide loses activity.",
                        "Keep copper peptides and vitamin C in separate products.");
            }
            if (c.hasAny(AHA, BHA, PHA) || c.phBelow(5)) {
                c.conflict("Copper Peptides + Low pH",
                        "The copper complex in " + c.names(COPPER_PEPTIDE) + " falls apart below about pH 5, which happens with exfoliating acids.",
                        "Keep the pH at 5-7 and use exfoliating acids in a different product.");
            }
            if (c.has(CHELATOR)) {
                c.conflict("Copper Peptides + Chelator",
                        c.names(CHELATOR) + " binds metal ions and will pull the copper out of " + c.names(COPPER_PEPTIDE) + ".",
                        "Leave the chelator out of copper peptide formulas.",
                Fix.remove(c.with(CHELATOR).stream().map(FormulaIngredient::id).toList(), "Remove the chelator"));
            }
        }
        if (c.has(PEPTIDE) && c.has(L_ASCORBIC_ACID)) {
            c.conflict("Peptides + L-Ascorbic Acid",
                    c.names(L_ASCORBIC_ACID) + " needs a very low pH (about 2.5-3.5), which slowly breaks down " + c.names(PEPTIDE) + ".",
                    "Use a vitamin C derivative (SAP, MAP, ethyl ascorbic acid), or keep the peptide and the vitamin C in separate products.");
        }
        if (c.has(PEPTIDE) && (c.hasAny(AHA, BHA) || c.phBelow(4))) {
            c.conflict("Peptides + Acids",
                    "The low pH needed for exfoliating acids slowly breaks down " + c.names(PEPTIDE) + ".",
                    "Keep peptides at pH 5-7 and put the acids in a separate product.");
        }
        if (c.hasAny(AHA, BHA) && c.has(RETINOID) && c.leaveOn()) {
            c.conflict("Exfoliating Acids + Retinoid",
                    c.names(AHA, BHA) + " together with " + c.names(RETINOID) + " is a lot of exfoliation in one product and greatly raises the risk of irritation and a damaged skin barrier.",
                    "Alternate them on different nights, or replace the acid with a gentle PHA.");
        }
        if (c.has(BENZOYL_PEROXIDE) && c.has(RETINOID)) {
            c.conflict("Benzoyl Peroxide + Retinoid",
                    "Benzoyl peroxide oxidizes and deactivates retinol and most retinoids.",
                    "Use them at different times of day, or switch to a more stable retinoid such as HPR.");
        }
        if (c.has(ENZYME) && c.hasWater()) {
            c.conflict("Enzymes in a Water-Based Formula",
                    c.names(ENZYME) + " loses its activity within days once dissolved in water.",
                    "Make a dry powder product (e.g. an enzyme cleansing powder) that is activated with water at the moment of use.");
        }
    }

    private static void exfoliation(FormulaContext c) {
        if (!c.leaveOn()) return;
        double exfoliants = c.percent(AHA, BHA, PHA);
        int kinds = (c.has(AHA) ? 1 : 0) + (c.has(BHA) ? 1 : 0) + (c.has(PHA) ? 1 : 0);

        if (exfoliants > MAX_LEAVE_ON_EXFOLIANT_PCT) {
            c.conflict("High Exfoliant Load",
                    String.format(Locale.ROOT, "Your leave-on product contains %.1f%% exfoliating acids (%s). Above about 10%% the risk of irritation rises sharply for home use.",
                            exfoliants, c.names(AHA, BHA, PHA)),
                    "Bring the total below 10% and keep the pH at 3.5 or higher.");
        }
        if (exfoliants > 0 && c.phBelow(3.5)) {
            c.conflict("Very Low pH Exfoliant",
                    "A target pH below 3.5 with " + c.names(AHA, BHA, PHA) + " makes a leave-on product much more irritating.",
                    "Aim for pH 3.5-4 for AHA/BHA products.");
        }
        if (kinds >= 2) {
            c.synergy("Combined Exfoliation",
                    c.names(AHA, BHA, PHA) + " work on different layers: AHAs on the surface, BHA inside pores, PHAs gently with extra hydration.",
                    "Keep the total acid level moderate and include soothing ingredients such as panthenol or allantoin.");
        }
        if (c.hasAny(AHA, STRONG_RETINOID)) {
            c.tip("Sun Sensitivity",
                    c.names(AHA, STRONG_RETINOID) + " makes skin more sensitive to the sun.",
                    "Label it for evening use and remind users to wear sunscreen during the day.");
        }
    }

    private static void synergies(FormulaContext c) {
        if (c.has(L_ASCORBIC_ACID) && c.has(VITAMIN_E) && c.has(FERULIC_ACID)) {
            c.synergy("Vitamin C + E + Ferulic Acid",
                    "This classic trio stabilizes vitamin C and roughly doubles its antioxidant photoprotection.",
                    "Keep the pH around 3 and use airless or opaque packaging.");
        } else if (c.has(L_ASCORBIC_ACID) && (c.has(VITAMIN_E) || c.has(FERULIC_ACID))) {
            c.tip("Complete the C + E + Ferulic Trio",
                    "You have " + c.names(L_ASCORBIC_ACID, VITAMIN_E, FERULIC_ACID) + ". Adding the missing partner makes vitamin C much more stable and effective.",
                    c.has(FERULIC_ACID) ? "Add 0.5-1% tocopherol." : "Add 0.5% ferulic acid, pre-dissolved in propanediol or alcohol.",
                c.has(FERULIC_ACID) ? Fix.add("antioxidant", "Add vitamin E") : Fix.add("ferulic", "Add ferulic acid"));
        }
        if (c.has(NIACINAMIDE) && c.hasAny(ACETYL_GLUCOSAMINE, VITAMIN_C_DERIVATIVE, TRANEXAMIC_ACID, ARBUTIN, LICORICE)) {
            c.synergy("Brightening Team",
                    "Niacinamide blocks pigment transfer, while " + c.names(ACETYL_GLUCOSAMINE, VITAMIN_C_DERIVATIVE, TRANEXAMIC_ACID, ARBUTIN, LICORICE)
                            + " reduces pigment production. Together they fade dark spots better than either alone.",
                    "Keep the pH at 5-6.5, where all of them are stable.");
        }
        if (c.has(NIACINAMIDE) && c.has(ZINC_PCA)) {
            c.synergy("Niacinamide + Zinc PCA",
                    "A well-studied pair for oily and acne-prone skin: both reduce sebum and calm redness.",
                    null);
        }
        if (c.has(NIACINAMIDE) && c.has(AZELAIC)) {
            c.synergy("Niacinamide + Azelaic Acid",
                    "Both calm redness and post-acne marks, and niacinamide offsets azelaic acid's tingling.",
                    null);
        }
        if (c.has(NIACINAMIDE) && c.has(RETINOID)) {
            c.synergy("Niacinamide + Retinoid",
                    "Niacinamide strengthens the skin barrier and reduces the dryness and irritation retinoids can cause.",
                    null);
        }
        if (c.has(HYALURONIC) && c.has(LIQUID_HUMECTANT)) {
            c.synergy("Layered Hydration",
                    c.names(HYALURONIC) + " holds water on the surface while " + c.names(LIQUID_HUMECTANT) + " draws it into the skin.",
                    "Seal it in with an emollient or occlusive in dry climates.");
        }

        // Body-contouring extracts are traditionally paired with caffeine
        if (c.has(CAFFEINE) && c.has(CONTOURING_EXTRACT)) {
            c.synergy("Body-Contouring Team",
                    c.names(CAFFEINE) + " is traditionally paired with " + c.names(CONTOURING_EXTRACT) + " in leg and body-contouring products.",
                    "Dissolve the caffeine in hot water (it crystallizes above about 2%). Evidence that these products change body shape is limited, so avoid claims such as 'burns fat' or 'removes cellulite'.");
        }

        // Skin-identical lipids work best together
        boolean ceramide = c.has(CERAMIDE), cholesterol = c.has(CHOLESTEROL), fattyAcid = c.has(BARRIER_FATTY_ACID);
        if (ceramide && cholesterol && fattyAcid) {
            c.synergy("Barrier Lipid Trio",
                    c.names(CERAMIDE, CHOLESTEROL, BARRIER_FATTY_ACID) + " mirror the skin's own lipid mix and repair the barrier far better together.",
                    "The ideal ratio is roughly 3:1:1 ceramides : cholesterol : fatty acids.");
        } else if (ceramide || cholesterol) {
            c.tip("Incomplete Barrier Lipids",
                    c.names(CERAMIDE, CHOLESTEROL, BARRIER_FATTY_ACID) + " works best alongside the other skin lipids.",
                    "Add " + (ceramide ? "" : "ceramides, ") + (cholesterol ? "" : "cholesterol, ") + (fattyAcid ? "" : "a fatty acid such as stearic acid, ")
                            + "aiming for a 3:1:1 ratio.");
        }

        // Irritating actives need something calming alongside
        boolean irritating = c.hasAny(AHA, BHA, STRONG_RETINOID, L_ASCORBIC_ACID, BENZOYL_PEROXIDE);
        if (irritating && c.leaveOn()) {
            if (c.has(SOOTHER)) {
                c.synergy("Actives + Soothers",
                        c.names(SOOTHER) + " helps offset the irritation potential of " + c.names(AHA, BHA, STRONG_RETINOID, L_ASCORBIC_ACID, BENZOYL_PEROXIDE) + ".",
                        null);
            } else {
                c.tip("Add a Soothing Ingredient",
                        c.names(AHA, BHA, STRONG_RETINOID, L_ASCORBIC_ACID, BENZOYL_PEROXIDE) + " can irritate, and nothing in the formula calms the skin.",
                        "Add 1-5% panthenol, 0.1-0.5% allantoin or 0.2-0.5% bisabolol.",
                Fix.add("soother", "Add a soother"));
            }
        }
    }
}
