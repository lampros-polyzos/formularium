import { serve } from "http/server.ts";
import { createClient } from "@supabase/supabase-js";

interface FormulaIngredient {
  name: string;
  function: string;
  phase: string;
  solubility: string;
  max_heating_temp_c?: number;
  // Add other properties (percentage, id, etc.)
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
    const { profileId, ingredients, targetPh, totalPercentage } = await req
      .json();

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
      i.function.includes("AHA")
    );
    const hasBHA = ingredients.some((i: FormulaIngredient) =>
      i.function.includes("BHA")
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

    // Removed the old 'tip' recommendation for heat-sensitive ingredients since the alert below handles it better.

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
      i.phase === "A" ||
      i.solubility === "water" ||
      (i.function === "Solvent" && i.name.toLowerCase().includes("water"))
    );

    const hasOil = ingredients.some((i: FormulaIngredient) =>
      i.phase === "B" ||
      i.solubility === "oil" ||
      i.function === "Carrier Oil" ||
      i.function === "Butter"
    );

    const hasEmulsifier = ingredients.some((i: FormulaIngredient) =>
      i.function === "Emulsifier" || i.function === "Co-emulsifier" ||
      i.function === "Cationic Emulsifier"
    );

    const hasPreservative = ingredients.some((i: FormulaIngredient) =>
      i.function === "Preservative"
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
