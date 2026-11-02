package com.demiurgio.formularium.rules.interactions;

import com.demiurgio.formularium.dto.FormulaIngredient;

import com.demiurgio.formularium.dto.Fix;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.regex.Pattern;

import static com.demiurgio.formularium.rules.interactions.Tag.*;

/** pH windows, oxidation, pH drift, sun care and skin comfort. */
public final class StabilityChecks {

    private StabilityChecks() {}

    // PhCompatibilityRule already raises errors for these; don't repeat them here
    private static final Pattern REPORTED_ABOVE_5_5 = Pattern.compile("sodium benzoate|potassium sorbate|salicylic acid", Pattern.CASE_INSENSITIVE);
    private static final Pattern REPORTED_BELOW_5 = Pattern.compile("niacinamide", Pattern.CASE_INSENSITIVE);

    public static void run(FormulaContext c) {
        phWindows(c);
        oxidation(c);
        drift(c);
        sunCare(c);
        comfort(c);
    }

    private static void phWindows(FormulaContext c) {
        if (!c.hasWater()) return; // pH has no meaning in anhydrous products
        List<FormulaIngredient> windowed = c.items().stream().map(FormulaContext.Item::ingredient)
                .filter(i -> i.optimalPhMin() != null && i.optimalPhMax() != null && i.optimalPhMax() - i.optimalPhMin() < 10)
                .toList();
        Double ph = c.targetPh();

        if (ph != null) {
            List<FormulaIngredient> outside = windowed.stream()
                    .filter(i -> ph < i.optimalPhMin() || ph > i.optimalPhMax())
                    .filter(i -> !(ph > 5.5 && REPORTED_ABOVE_5_5.matcher(i.name()).find()))
                    .filter(i -> !(ph < 5 && REPORTED_BELOW_5.matcher(i.name()).find()))
                    .toList();
            if (!outside.isEmpty()) {
                String detail = String.join("; ", outside.stream()
                        .map(i -> i.displayName() + " " + range(i)).toList());
                c.conflict("Outside the pH Window",
                        "At your target pH of " + num(ph) + " these ingredients won't work properly or may break down: " + detail + ".",
                        "Adjust the target pH, or replace the ingredients whose window doesn't fit.",
                phFix(windowed));
            }
        } else if (windowed.size() >= 2) {
            FormulaIngredient highestMin = windowed.stream().max(Comparator.comparingDouble(FormulaIngredient::optimalPhMin)).orElseThrow();
            FormulaIngredient lowestMax = windowed.stream().min(Comparator.comparingDouble(FormulaIngredient::optimalPhMax)).orElseThrow();
            if (highestMin.optimalPhMin() > lowestMax.optimalPhMax()) {
                c.conflict("No pH Suits Every Ingredient",
                        highestMin.displayName() + " needs pH " + range(highestMin) + " but " + lowestMax.displayName() + " needs " + range(lowestMax) + ". No single pH works for both.",
                        "Move one of them to a separate product, or swap it for an alternative with a compatible pH range.");
            }
        }
    }

    private static void oxidation(FormulaContext c) {
        if (c.has(FRAGILE_OIL) && !c.has(OIL_ANTIOXIDANT)) {
            String acetateNote = c.has(TOCOPHERYL_ACETATE) ? " Tocopheryl acetate doesn't protect oils; only free tocopherol does." : "";
            c.tip("Protect Fragile Oils",
                    c.names(FRAGILE_OIL) + " is rich in polyunsaturated fats and goes rancid quickly." + acetateNote,
                    "Add 0.5% tocopherol (vitamin E) or 0.1-0.2% rosemary CO2 extract to the oil phase.",
                Fix.add("antioxidant", "Add an antioxidant"));
        }
        if (c.has(OXIDATION_PRONE) && !c.has(OIL_ANTIOXIDANT)) {
            c.tip("Shield Sensitive Actives",
                    c.names(OXIDATION_PRONE) + " degrades with air and light.",
                    "Add 0.5% tocopherol, add it during cool-down and use opaque, airless packaging.",
                Fix.add("antioxidant", "Add an antioxidant"));
        }
        if (c.has(L_ASCORBIC_ACID) && c.hasWater()) {
            c.tip("L-Ascorbic Acid Oxidizes in Water",
                    "Water-based L-ascorbic acid serums typically turn yellow-brown within weeks.",
                    "Make small batches, keep the pH at or below 3.5, add ferulic acid and vitamin E, and use airless packaging. A derivative (SAP, MAP, ethyl ascorbic acid) lasts far longer.");
        }
        if (c.has(KOJIC_ACID) && !c.has(CHELATOR)) {
            c.tip("Kojic Acid Browning",
                    "Kojic acid reacts with trace metals and turns products yellow-brown.",
                    "Add 0.1-0.2% chelator plus an antioxidant, or switch to kojic dipalmitate, which doesn't discolor.",
                Fix.add("chelator", "Add a chelator"));
        }
    }

    private static void drift(FormulaContext c) {
        if (!c.hasWater()) return;
        if (c.has(UREA) && !c.has(BUFFER)) {
            c.tip("Buffer the Urea",
                    "Urea slowly breaks down into ammonia, pushing the pH up and causing an odor.",
                    "Add a lactic acid / sodium lactate buffer, keep heat below 40°C, or use hydroxyethyl urea instead.");
        }
        if (c.has(GLUCONOLACTONE)) {
            c.tip("pH Drifts Down",
                    "Gluconolactone slowly turns into gluconic acid in water, lowering the pH over the following days.",
                    "Re-check the pH after 24-48 hours, or add a buffer such as sodium citrate.");
        }
        if (c.has(ZINC_OXIDE)) {
            c.tip("pH Drifts Up",
                    "Zinc oxide slowly raises the pH of water-based products.",
                    "Keep the target pH above 6.5 so it doesn't dissolve, and re-check the pH after a few days.");
        }
    }

    private static void sunCare(FormulaContext c) {
        if (c.has(AVOBENZONE)) {
            if (!c.has(PHOTOSTABILIZER)) {
                c.conflict("Unstable Avobenzone",
                        "Avobenzone loses most of its UVA protection within an hour of sun exposure unless it is stabilized.",
                        "Add octocrylene or bemotrizinol (Tinosorb S).",
                Fix.add("photostabilizer", "Add a stabilizer"));
            }
            if (c.has(MINERAL_UV)) {
                c.conflict("Avobenzone + Mineral Filters",
                        "Uncoated " + c.names(MINERAL_UV) + " can speed up avobenzone breakdown and cause discoloration.",
                        "Use coated zinc oxide or titanium dioxide grades.");
            }
        }
        if (c.has(UV_FILTER)) {
            c.tip("SPF Must Be Tested",
                    "The protection a sunscreen gives depends on dispersion and film formation, not just filter percentages, so home-made sunscreens are often far below the expected SPF.",
                    "Don't put an SPF claim on the product without lab testing.");
        }
    }

    private static void comfort(FormulaContext c) {
        if (!c.leaveOn()) return;
        if (c.has(PHOTOTOXIC_OIL)) {
            c.conflict("Phototoxic Citrus Oil",
                    c.names(PHOTOTOXIC_OIL) + " contains furocoumarins that can cause burns and dark patches on sun-exposed skin.",
                    "Use the furocoumarin-free (FCF) grade or a steam-distilled citrus oil.");
        }
        double fragrance = c.percent(FRAGRANCE);
        if (fragrance > 1) {
            c.tip("High Fragrance Level",
                    String.format(Locale.ROOT, "%.1f%% fragrance and essential oils is a lot for a leave-on product.", fragrance),
                    "Stay below about 1% for body and 0.5% for face, and check IFRA limits for each oil.");
        }
        List<FormulaIngredient> comedogenic = c.with(HIGH_COMEDOGENIC);
        if (comedogenic.stream().mapToDouble(FormulaIngredient::percentage).sum() > 5) {
            c.tip("Pore-Clogging Oils",
                    FormulaContext.list(comedogenic) + " has a high comedogenic rating.",
                    "Fine for body products; for faces prone to breakouts choose squalane, hemp seed or caprylic/capric triglyceride.");
        }
        if (c.percent(ALCOHOL_DENAT) > 10) {
            c.tip("Drying Alcohol Level",
                    "More than 10% alcohol in a leave-on product can dry and irritate the skin.",
                    "Balance it with glycerin or reduce the alcohol.");
        }
    }

    /** A pH inside every ingredient's window, when one exists. */
    private static Fix phFix(List<FormulaIngredient> windowed) {
        double low = windowed.stream().mapToDouble(FormulaIngredient::optimalPhMin).max().orElse(0);
        double high = windowed.stream().mapToDouble(FormulaIngredient::optimalPhMax).min().orElse(14);
        if (low > high) return null;
        double middle = Math.min(Math.max(Math.round((low + high) / 2 * 10) / 10.0, low), high);
        return Fix.setPh(middle, "Set pH to " + num(middle));
    }

    private static String range(FormulaIngredient i) {
        return "(pH " + num(i.optimalPhMin()) + "-" + num(i.optimalPhMax()) + ")";
    }

    private static String num(Double v) {
        Objects.requireNonNull(v);
        return v == Math.rint(v) ? String.valueOf(v.intValue()) : String.format(Locale.ROOT, "%.1f", v);
    }
}
