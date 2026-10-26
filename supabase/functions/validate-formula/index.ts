import { serve } from "http/server.ts";
import { createClient } from "@supabase/supabase-js";

interface FormulaIngredient {
  name: string;
  function: string;
  phase: string;
  solubility: string;
  max_heating_temp_c?: number;
  percentage?: number;
  min_percentage?: number;
  max_percentage?: number;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const {
      profileId,
      ingredients,
      targetPh,
      totalPercentage,
      oilPhasePercentage,
      waterPhasePercentage,
    } = await req.json();

    // 1. Initialize Supabase client using the Auth context of the user calling it
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      },
    );

    // 2. Fetch the specific constraints for the selected product profile
    const { data: profile, error } = await supabaseClient
      .from("formulation_profiles")
      .select("*")
      .eq("id", profileId)
      .single();

    if (error || !profile) {
      throw new Error("Profile not found");
    }

    const alerts = [];
    const recommendations: Array<{
      type: "conflict" | "synergy" | "tip";
      title: string;
      message: string;
      action?: string;
    }> = [];

    // Added explicit typing here for i: FormulaIngredient and n: string
    const ingredientNames = ingredients.map((i: FormulaIngredient) =>
      i.name.toLowerCase()
    );
    const hasVitaminC = ingredientNames.some((n: string) =>
      n.includes("ascorbic acid")
    );
    const hasNiacinamide = ingredientNames.some((n: string) =>
      n.includes("niacinamide")
    );

    const hasAHA = ingredients.some((i: FormulaIngredient) =>
      i.function.includes("AHA") || i.name.toLowerCase().includes("glycolic") ||
      i.name.toLowerCase().includes("lactic")
    );
    const hasBHA = ingredients.some((i: FormulaIngredient) =>
      i.function.includes("BHA") || i.name.toLowerCase().includes("salicylic")
    );

    const hasPeptides = ingredientNames.some((n: string) =>
      n.includes("peptide") || n.includes("palmitoyl")
    );
    const hasRetinol = ingredientNames.some((n: string) =>
      n.includes("retinol") || n.includes("retinal") || n.includes("retinoid")
    );
    const hasCarbomer = ingredientNames.some((n: string) =>
      n.includes("carbomer")
    );
    const hasElectrolytes = ingredientNames.some((n: string) =>
      n.includes("sodium chloride") ||
      n.includes("magnesium") ||
      n.includes("aloe barbadensis")
    );

    // Surfactant / Polymer Charges
    const hasCationic = ingredients.some((i: FormulaIngredient) =>
      i.function.toLowerCase().includes("cationic") ||
      i.name.toLowerCase().includes("btms") ||
      i.name.toLowerCase().includes("behentrimonium")
    );
    const hasAnionic = ingredients.some((i: FormulaIngredient) =>
      i.function.toLowerCase().includes("anionic") ||
      i.name.toLowerCase().includes("sodium lauryl") ||
      i.name.toLowerCase().includes("sodium laureth") ||
      i.name.toLowerCase().includes("sls")
    );

    // Specific Actives
    const hasCopperPeptide = ingredientNames.some((n: string) =>
      n.includes("copper peptide") || n.includes("copper tripeptide")
    );
    const hasVitaminE = ingredientNames.some((n: string) =>
      n.includes("tocopherol") || n.includes("vitamin e")
    );
    const hasFerulic = ingredientNames.some((n: string) =>
      n.includes("ferulic")
    );

    // pH-Dependent Preservatives
    const hasOrganicAcidPreservative = ingredientNames.some((n: string) =>
      n.includes("sodium benzoate") ||
      n.includes("potassium sorbate") ||
      n.includes("salicylic acid")
    );

    if (hasVitaminC && hasNiacinamide) {
      recommendations.push({
        type: "conflict",
        title: "Niacinamide + L-Ascorbic Acid",
        message:
          "Combining pure Vitamin C with Niacinamide at a low pH can cause flushing or form niacin (though modern formulations often stabilize them).",
        action:
          "Consider moving one to a different product, or use a stabilized Vitamin C derivative.",
      });
    }

    if (hasAHA && hasBHA) {
      recommendations.push({
        type: "synergy",
        title: "AHA + BHA Combination",
        message:
          "AHAs target surface exfoliation while BHAs clear pores. This is highly effective but increases irritation risk.",
        action:
          "Ensure the total acid concentration remains under 10% and add soothing agents like Panthenol or Allantoin.",
      });
    }

    if ((hasAHA || hasBHA) && hasPeptides) {
      recommendations.push({
        type: "conflict",
        title: "Acids + Peptides",
        message:
          "The low pH required for AHAs/BHAs to function can hydrolyze (denature) delicate peptides, rendering them ineffective.",
        action:
          "Formulate these into separate products, or use acid-stable peptide derivatives.",
      });
    }

    if ((hasAHA || hasBHA) && hasRetinol) {
      recommendations.push({
        type: "conflict",
        title: "Acids + Retinoids",
        message:
          "Combining strong exfoliating acids with retinoids significantly increases the risk of severe skin barrier damage and irritation.",
        action:
          "Recommend alternating use (e.g., acids in the morning, retinoids at night) rather than combining in one formula.",
      });
    }

    if (hasCarbomer && hasElectrolytes) {
      recommendations.push({
        type: "conflict",
        title: "Carbomer + Electrolytes",
        message:
          "Carbomer is highly sensitive to electrolytes (like salts, aloe vera, or specific minerals). The ions will break the polymer chain, turning your gel into a liquid.",
        action:
          "Use an electrolyte-tolerant thickener (like Xanthan Gum or Hydroxyethylcellulose) instead of Carbomer.",
      });
    }

    if (hasAnionic && hasCationic) {
      recommendations.push({
        type: "conflict",
        title: "Anionic + Cationic Clash",
        message:
          "You have combined oppositely charged ingredients (e.g., an anionic cleanser with a cationic conditioning agent). They will bind together, form an insoluble precipitate, and neutralize each other.",
        action:
          "Use non-ionic or amphoteric ingredients with your charged phase to prevent complexation.",
      });
    }

    if (hasCopperPeptide && hasVitaminC) {
      recommendations.push({
        type: "conflict",
        title: "Copper Peptides + L-Ascorbic Acid",
        message:
          "Copper ions rapidly catalyze the oxidation of ascorbic acid, degrading the Vitamin C and rendering both ingredients ineffective.",
        action:
          "Separate these into different routines, or use a highly stable Vitamin C derivative (like THD Ascorbate) instead of pure L-Ascorbic Acid.",
      });
    }

    if (hasVitaminC && hasVitaminE && hasFerulic) {
      recommendations.push({
        type: "synergy",
        title: "The Golden Antioxidant Trio",
        message:
          "Excellent combination. Ferulic Acid and Vitamin E work together to stabilize the highly volatile L-Ascorbic Acid while doubling its photoprotection capabilities.",
        action:
          "Ensure the final pH is under 3.5 to keep the L-Ascorbic Acid protonated and capable of penetrating the skin.",
      });
    } else if (hasVitaminC && !hasVitaminE) {
      recommendations.push({
        type: "tip",
        title: "Stabilize your Vitamin C",
        message:
          "Pure L-Ascorbic Acid oxidizes rapidly in water-based formulas.",
        action:
          "Consider adding Tocopherol (Vitamin E) and Ferulic Acid to stabilize the formula and boost its efficacy.",
      });
    }

    const misplacedHeatSensitive = ingredients.filter((i: FormulaIngredient) =>
      i.max_heating_temp_c &&
      i.max_heating_temp_c < 50 &&
      i.phase !== "C"
    );

    if (misplacedHeatSensitive.length > 0) {
      const sensitiveNames = misplacedHeatSensitive.map((
        i: FormulaIngredient,
      ) => i.name).join(", ");

      alerts.push({
        type: "error",
        message:
          `Heat-sensitive ingredients misplaced: ${sensitiveNames} degrade at high temperatures. Move them to Phase C (Cool Down).`,
      });
    }

    // 3. Analyze the formula against the constraints
    const hasWater = ingredients.some((i: FormulaIngredient) =>
      (i.percentage || 0) > 0 && (
        i.phase === "A" ||
        i.solubility === "water" ||
        (i.function === "Solvent" && i.name.toLowerCase().includes("water"))
      )
    );

    const hasOil = ingredients.some((i: FormulaIngredient) =>
      (i.percentage || 0) > 0 && (
        i.phase === "B" ||
        i.solubility === "oil" ||
        i.function === "Carrier Oil" ||
        i.function === "Butter"
      )
    );

    const hasEmulsifier = ingredients.some((i: FormulaIngredient) =>
      (i.percentage || 0) > 0 && (
        i.function === "Emulsifier" || i.function === "Co-emulsifier" ||
        i.function === "Cationic Emulsifier"
      )
    );

    const hasPreservative = ingredients.some((i: FormulaIngredient) =>
      (i.percentage || 0) > 0 && i.function === "Preservative"
    );

    const hasChelator = ingredients.some((i: FormulaIngredient) =>
      i.function.toLowerCase().includes("chelating") ||
      i.name.toLowerCase().includes("edta") ||
      i.name.toLowerCase().includes("phytate") ||
      i.name.toLowerCase().includes("phytic")
    );

    const hasGum = ingredients.some((i: FormulaIngredient) =>
      i.name.toLowerCase().includes("xanthan") ||
      i.name.toLowerCase().includes("guar") ||
      i.name.toLowerCase().includes("cellulose")
    );

    const hasLiquidHumectant = ingredients.some((i: FormulaIngredient) =>
      i.name.toLowerCase().includes("glycerin") ||
      i.name.toLowerCase().includes("propanediol") ||
      i.name.toLowerCase().includes("propylene glycol")
    );

    // Profile Requirement Checks
    if (profile.requires_water && !hasWater) {
      alerts.push({
        type: "error",
        message: `Profile '${profile.name}' requires a water phase.`,
      });
    }
    if (!profile.requires_water && hasWater) {
      alerts.push({
        type: "error",
        message:
          `Water detected in an anhydrous profile. This will cause separation.`,
      });
    }
    if (profile.requires_oil && !hasOil) {
      alerts.push({
        type: "warning",
        message:
          `Profile '${profile.name}' usually requires an oil or lipid phase.`,
      });
    }
    if (profile.requires_emulsifier && !hasEmulsifier) {
      alerts.push({
        type: "error",
        message: `Missing emulsifier. The water and oil phases will separate.`,
      });
    }
    if (profile.requires_preservative && !hasPreservative) {
      alerts.push({
        type: "error",
        message:
          `Missing broad-spectrum preservative. This formulation is unsafe for long-term storage.`,
      });
    }
    // Phase Balance & Structural Stability Checks
    if (
      profile.max_oil_phase_percent !== null &&
      oilPhasePercentage > profile.max_oil_phase_percent
    ) {
      alerts.push({
        type: "error",
        message: `Oil phase (${
          oilPhasePercentage.toFixed(2)
        }%) exceeds the maximum allowed (${profile.max_oil_phase_percent}%) for this product type.`,
      });
    }

    if (profileId === "ow_lotion" && oilPhasePercentage > 35) {
      alerts.push({
        type: "warning",
        message: `High oil phase (${
          oilPhasePercentage.toFixed(2)
        }%). In an O/W emulsion, exceeding 35% oil risks phase inversion, separation, and an overly greasy texture.`,
      });
    }

    if (profileId === "wo_cream" && oilPhasePercentage < 20) {
      alerts.push({
        type: "error",
        message: `Low oil phase (${
          oilPhasePercentage.toFixed(2)
        }%). Water-in-Oil (W/O) emulsions require at least 20-25% lipids to form a stable continuous outer phase.`,
      });
    }

    if (
      (profileId === "toner_mist" || profileId === "water_serum") &&
      oilPhasePercentage > 5
    ) {
      alerts.push({
        type: "error",
        message: `High oil phase (${
          oilPhasePercentage.toFixed(2)
        }%). Thin aqueous products cannot hold more than 5% lipids without specialized solubilizers; this will separate.`,
      });
    }

    // Basic Math & pH Checks
    if (totalPercentage !== 100) {
      alerts.push({
        type: "warning",
        message:
          `Formula total is ${totalPercentage}%. It must equal exactly 100.00%.`,
      });
    }
    if (
      targetPh && profile.default_ph_min && targetPh < profile.default_ph_min
    ) {
      alerts.push({
        type: "warning",
        message:
          `Target pH is below the recommended minimum (${profile.default_ph_min}) for this product type.`,
      });
    }

    // Organic acid preservatives (Sodium Benzoate, Potassium Sorbate) are inactive at higher pH levels.
    if (hasOrganicAcidPreservative && targetPh && targetPh > 5.5) {
      alerts.push({
        type: "error",
        message:
          "Preservative failure risk: Organic acids (like Sodium Benzoate or Potassium Sorbate) require a pH below 5.5 to convert into their active antimicrobial state.",
      });
    }

    if (hasWater && hasPreservative && !hasChelator) {
      recommendations.push({
        type: "tip",
        title: "Boost Preservative Efficacy",
        message:
          "Water and botanical extracts contain trace metal ions that can degrade your preservative system and cause oxidation.",
        action:
          "Add a small amount (0.1% - 0.2%) of a chelating agent like Disodium EDTA or Sodium Phytate to the water phase.",
      });
    }

    if (hasGum && hasLiquidHumectant) {
      recommendations.push({
        type: "synergy",
        title: "Polymer Slurry Technique",
        message: "You have both a thickening gum and a liquid humectant.",
        action:
          "To prevent clumping ('fish-eyes'), pre-disperse your gum into the humectant (like Glycerin) to create a slurry before introducing it to the water phase.",
      });
    } else if (hasGum && !hasLiquidHumectant) {
      recommendations.push({
        type: "tip",
        title: "Gum Clumping Risk",
        message:
          "Adding gums directly to water often results in unmixable clumps.",
        action:
          "Consider adding Glycerin or Propanediol to your formula to create a pre-dispersion slurry.",
      });
    }

    if (hasNiacinamide && targetPh && targetPh < 5.0) {
      alerts.push({
        type: "error",
        message:
          "Niacinamide risk: At a target pH below 5.0, Niacinamide hydrolyzes into nicotinic acid, which causes severe skin flushing and irritation. Raise your target pH.",
      });
    }

    ingredients.forEach((i: FormulaIngredient) => {
      if (i.percentage === undefined || i.percentage === 0) return;

      if (i.max_percentage && i.percentage > i.max_percentage) {
        alerts.push({
          type: "error",
          message:
            `${i.name} is at ${i.percentage}%, exceeding its maximum safe usage rate of ${i.max_percentage}%. This may cause irritation or formula instability.`,
        });
      }

      if (i.min_percentage && i.percentage < i.min_percentage) {
        // Preservatives and emulsifiers get errors; actives get warnings
        const alertType =
          (i.function === "Preservative" || i.function === "Emulsifier")
            ? "error"
            : "warning";
        const impact = alertType === "error"
          ? "fail to protect/stabilize the formula"
          : "be ineffective";

        alerts.push({
          type: alertType,
          message:
            `${i.name} is at ${i.percentage}%, below its minimum effective rate of ${i.min_percentage}%. It will likely ${impact}.`,
        });
      }
    });

    // 4. Return the alerts to the frontend
    return new Response(
      JSON.stringify({ alerts, recommendations }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error
      ? error.message
      : "An unknown error occurred";

    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
