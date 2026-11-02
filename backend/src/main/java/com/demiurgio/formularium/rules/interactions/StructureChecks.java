package com.demiurgio.formularium.rules.interactions;

import com.demiurgio.formularium.dto.FormulaIngredient;

import java.util.List;
import java.util.Locale;

import static com.demiurgio.formularium.rules.interactions.Tag.*;

/** Charge clashes, thickeners, emulsions, surfactant systems and solubility. */
public final class StructureChecks {

    private StructureChecks() {}

    public static void run(FormulaContext c) {
        charge(c);
        thickeners(c);
        emulsions(c);
        surfactants(c);
        solubility(c);
    }

    private static void charge(FormulaContext c) {
        if (c.has(CATIONIC_CONDITIONER) && c.has(ANIONIC_SURFACTANT)) {
            c.conflict("Cationic + Anionic Clash",
                    c.names(CATIONIC_CONDITIONER) + " (positive) and " + c.names(ANIONIC_SURFACTANT) + " (negative) neutralize each other, forming a gummy, insoluble residue.",
                    "For a conditioning shampoo use a shampoo-compatible polymer such as Polyquaternium-10 or cationic guar instead.");
        }
        if (c.has(CATIONIC_CONDITIONER) && c.has(ANIONIC_THICKENER)) {
            c.conflict("Cationic Conditioner + Anionic Thickener",
                    c.names(ANIONIC_THICKENER) + " is negatively charged and will clump or lose its thickening power next to " + c.names(CATIONIC_CONDITIONER) + ".",
                    "Use a non-ionic thickener: hydroxyethylcellulose (HEC), HPMC, guar gum or sclerotium gum.");
        }
        if (c.has(SHAMPOO_SAFE_CATIONIC) && c.has(ANIONIC_SURFACTANT)) {
            c.synergy("2-in-1 Conditioning",
                    c.names(SHAMPOO_SAFE_CATIONIC) + " is designed to stay compatible with " + c.names(ANIONIC_SURFACTANT) + " and deposits on hair as you rinse.",
                    "Hydrate the polymer fully in the water phase before adding the surfactants.");
        }
    }

    private static void thickeners(FormulaContext c) {
        List<FormulaIngredient> electrolytes = c.with(ELECTROLYTE).stream().filter(i -> i.percentage() >= 0.2).toList();
        if (c.has(ELECTROLYTE_SENSITIVE) && !electrolytes.isEmpty()) {
            c.conflict("Electrolytes Will Thin Your Gel",
                    FormulaContext.list(electrolytes) + " contains salts that collapse " + c.names(ELECTROLYTE_SENSITIVE) + ", so the product can turn watery.",
                    "Switch to a salt-tolerant thickener (sclerotium gum, Sepimax Zen, HEC) or reduce the electrolytes.");
        }
        if (c.has(CARBOMER) && !c.has(NEUTRALIZER)) {
            c.tip("Carbomer Needs Neutralizing",
                    c.names(CARBOMER) + " stays thin and cloudy until the pH is raised to about 6-7.",
                    "Add sodium hydroxide (10-20% solution), triethanolamine or L-arginine drop by drop until it thickens.");
        }
        if (c.has(POWDER_THICKENER)) {
            if (c.has(LIQUID_HUMECTANT)) {
                c.tip("Make a Slurry First",
                        "Stir " + c.names(POWDER_THICKENER) + " into " + c.names(LIQUID_HUMECTANT) + " before adding it to the water.",
                        "This wets every particle separately, so the gum hydrates without lumps.");
            } else {
                c.tip("Lump Risk",
                        c.names(POWDER_THICKENER) + " forms lumps (\"fish eyes\") when sprinkled straight into water.",
                        "Pre-disperse it in a little glycerin or oil, or sprinkle it slowly onto the water while blending.");
            }
        }
        if (c.has(SODIUM_BICARBONATE) && c.has(CITRIC_ACID)) {
            if (c.hasWater()) {
                c.conflict("Fizzing in the Jar",
                        "Baking soda and citric acid react as soon as they meet water, so this product will fizz and go flat before it is used.",
                        "Keep fizzing products completely anhydrous (bath bombs, fizzing powders).");
            } else {
                c.tip("Keep It Dry",
                        "Baking soda and citric acid react with moisture, even humidity in the air.",
                        "Mist sparingly with witch hazel or alcohol while moulding, and store airtight.");
            }
        }
    }

    private static void emulsions(FormulaContext c) {
        if (c.has(LOW_HLB_EMULSIFIER)) {
            if (c.has(MAGNESIUM_SULFATE)) {
                c.synergy("Stabilized W/O Emulsion",
                        "Magnesium sulfate in the water phase stabilizes the water-in-oil emulsion made with " + c.names(LOW_HLB_EMULSIFIER) + ".",
                        null);
            } else if (c.hasWater() && !c.has(STEARETH_20)) {
                c.tip("Stabilize Your W/O Emulsion",
                        c.names(LOW_HLB_EMULSIFIER) + " makes water-in-oil emulsions, which separate easily without help.",
                        "Add 0.5-1% magnesium sulfate to the water phase and add the water slowly while stirring.");
            }
        }
        if (c.has(STEARETH_2) && c.has(STEARETH_20)) {
            c.synergy("Steareth-2 + Steareth-20",
                    "This low/high HLB emulsifier pair forms liquid crystal structures and very stable emulsions.",
                    "A common starting ratio is about 1.5 : 1 (Steareth-2 : Steareth-20).");
        }

        // Oil in water without anything to hold it there
        List<FormulaIngredient> oils = c.with(OIL_SOLUBLE).stream().filter(i -> i.percentage() >= 0.1).toList();
        if (c.hasWater() && !oils.isEmpty() && !c.hasAny(EMULSIFIER, SOLUBILIZER)) {
            c.conflict("Oil Will Separate",
                    FormulaContext.list(oils) + " won't mix into the water phase without an emulsifier or solubilizer.",
                    "For a clear product add a solubilizer (about 3-5x the oil weight); for a lotion add an emulsifier.");
        }
        double fragranceInWater = c.percent(FRAGRANCE);
        double solubilizer = c.with(SOLUBILIZER).stream().filter(i -> !String.valueOf(i.function()).toLowerCase(Locale.ROOT).contains("surfactant")).mapToDouble(FormulaIngredient::percentage).sum();
        if (c.hasWater() && fragranceInWater > 0 && !c.has(EMULSIFIER) && solubilizer > 0 && solubilizer < fragranceInWater * 3) {
            c.tip("Not Enough Solubilizer",
                    String.format(Locale.ROOT, "%.2f%% solubilizer for %.2f%% fragrance or essential oil will usually leave the product cloudy.", solubilizer, fragranceInWater),
                    "Use at least 3-5 times as much solubilizer as oil, and premix them before adding to the water.");
        }
    }

    private static void surfactants(FormulaContext c) {
        if (c.has(ANIONIC_SURFACTANT) && c.has(AMPHOTERIC_SURFACTANT)) {
            c.synergy("Anionic + Amphoteric Blend",
                    c.names(AMPHOTERIC_SURFACTANT) + " makes " + c.names(ANIONIC_SURFACTANT) + " milder and boosts foam and viscosity.",
                    "A common ratio is about 3 : 1 anionic to amphoteric.");
        } else if (c.has(SULFATE_SURFACTANT)) {
            c.tip("Soften the Sulfate",
                    c.names(SULFATE_SURFACTANT) + " cleanses strongly on its own.",
                    "Add an amphoteric co-surfactant (CAPB or coco betaine) at about a quarter of the sulfate level to reduce irritation.");
        }
        if (c.has(GLUCOSIDE_SURFACTANT)) {
            c.tip("Glucosides Are Alkaline",
                    c.names(GLUCOSIDE_SURFACTANT) + " has a pH of about 11-12 out of the bottle.",
                    "Adjust the finished product down to pH 5-6 with citric or lactic acid solution.");
        }
    }

    private static void solubility(FormulaContext c) {
        if (c.has(NEEDS_SOLVENT) && !c.has(SOLVENT)) {
            c.tip("Pre-Dissolve Before Adding",
                    c.names(NEEDS_SOLVENT) + " barely dissolves in water and will form crystals or grit.",
                    "Dissolve it first in propanediol, butylene glycol, dimethyl isosorbide or alcohol, then add to the batch.");
        }
        List<FormulaIngredient> caffeine = c.with(CAFFEINE).stream().filter(i -> i.percentage() > 2).toList();
        if (!caffeine.isEmpty() && !c.has(SOLVENT)) {
            c.tip("Caffeine May Crystallize",
                    "Above about 2% caffeine can crystallize out of the product as it cools.",
                    "Dissolve it in hot water and add a co-solvent such as propanediol.");
        }
    }
}
