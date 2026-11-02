package com.demiurgio.formularium.rules;

import com.demiurgio.formularium.dto.FormulaIngredient;
import com.demiurgio.formularium.dto.ProfileConfig;
import com.demiurgio.formularium.dto.ValidationRequest;
import com.demiurgio.formularium.dto.ValidationResponse;
import com.demiurgio.formularium.dto.ValidationResponse.Recommendation;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Ingredient data below mirrors rows from the Formularium ingredient library. */
class IngredientInteractionRuleTest {

    private final IngredientInteractionRule rule = new IngredientInteractionRule();

    // ---------- Fixtures ----------

    private static FormulaIngredient ing(String inci, String trade, String function, double pct, String solubility,
                                         String charge, Double phMin, Double phMax) {
        return ing(inci, trade, function, pct, solubility, charge, phMin, phMax, false, null);
    }

    private static FormulaIngredient ing(String inci, String trade, String function, double pct, String solubility,
                                         String charge, Double phMin, Double phMax, boolean fragrance, Integer comedogenic) {
        return new FormulaIngredient(null, inci + " " + trade, function, "A", pct, solubility, null, null, null,
                true, false, false, false, fragrance, true, comedogenic, inci, trade, null, charge, phMin, phMax);
    }

    private static final FormulaIngredient WATER = ing("Aqua", "Distilled Water", "Solvent", 70, "water", "non-ionic", 1.0, 14.0);
    private static final FormulaIngredient GLYCERIN = ing("Glycerin", "Vegetable Glycerin 99.5%", "Humectant", 3, "water", "non-ionic", 3.0, 10.0);
    private static final FormulaIngredient PE9010 = ing("Phenoxyethanol (and) Ethylhexylglycerin", "Euxyl PE 9010", "Preservative", 1, "dispersible", "non-ionic", 3.0, 12.0);
    private static final FormulaIngredient OLIVEM = ing("Cetearyl Olivate, Sorbitan Olivate", "Olivem 1000", "Emulsifier", 4, "oil", "non-ionic", 3.0, 12.0);
    private static final FormulaIngredient JOJOBA = ing("Simmondsia Chinensis Seed Oil", "Jojoba Oil", "Carrier Oil", 10, "oil", "non-ionic", null, null);

    private static final FormulaIngredient LAA = ing("Ascorbic Acid", "L-Ascorbic Acid", "Active (Antioxidant)", 10, "water", "non-ionic", 2.5, 3.5);
    private static final FormulaIngredient ETHYL_C = ing("3-O-Ethyl Ascorbic Acid", "Ethyl Ascorbic Acid", "Active (Brightening)", 2, "water", "non-ionic", 4.0, 6.0);
    private static final FormulaIngredient NIACINAMIDE = ing("Niacinamide", "Niacinamide USP", "Active (Brightening)", 4, "water", "non-ionic", 5.0, 6.0);
    private static final FormulaIngredient RETINOL = ing("Retinol", "Retinol", "Active (Anti-Aging)", 0.3, "oil", "non-ionic", 5.5, 6.5);
    private static final FormulaIngredient GLYCOLIC = ing("Glycolic Acid", "Glycolic Acid 70%", "Active (AHA)", 8, "water", "non-ionic", 3.5, 4.5);
    private static final FormulaIngredient SALICYLIC = ing("Salicylic Acid", "Salicylic Acid USP", "Active (BHA)", 2, "alcohol", "non-ionic", 3.0, 4.0);
    private static final FormulaIngredient LACTIC_ADJUSTER = ing("Lactic Acid", "Lactic Acid 80%", "Active (AHA) / pH Adjuster", 0.2, "water", "anionic", 3.5, 4.5);
    private static final FormulaIngredient GHK_CU = ing("Copper Tripeptide-1", "GHK-Cu", "Active (Repair)", 0.5, "water", "cationic", 5.0, 7.0);
    private static final FormulaIngredient EDTA = ing("Disodium EDTA", "Disodium EDTA", "Chelating Agent", 0.1, "water", "anionic", 3.0, 10.0);
    private static final FormulaIngredient TOCOPHEROL = ing("Tocopherol", "Vitamin E", "Antioxidant", 0.5, "oil", "non-ionic", null, null);
    private static final FormulaIngredient FERULIC = ing("Ferulic Acid", "Ferulic Acid", "Active (Antioxidant)", 0.5, "alcohol", "non-ionic", 3.0, 5.0);
    private static final FormulaIngredient PROPANEDIOL = ing("Propanediol", "Zemea", "Humectant / Solvent", 5, "water", "non-ionic", 3.0, 10.0);

    private static final FormulaIngredient SLES = ing("Sodium Laureth Sulfate", "SLES", "Surfactant (Anionic)", 12, "water", "anionic", 4.5, 8.0);
    private static final FormulaIngredient CAPB = ing("Cocamidopropyl Betaine", "CAPB", "Surfactant (Amphoteric)", 4, "water", "amphoteric", 4.0, 6.0);
    private static final FormulaIngredient BTMS = ing("Behentrimonium Methosulfate (and) Cetyl Alcohol (and) Butylene Glycol", "BTMS-50", "Cationic Emulsifier", 4, "oil", "cationic", 4.0, 6.0);
    private static final FormulaIngredient POLYQUAT10 = ing("Polyquaternium-10", "Polyquat-10", "Conditioning Polymer", 0.3, "water", "cationic", 4.0, 7.0);
    private static final FormulaIngredient XANTHAN = ing("Xanthan Gum", "Xanthan Gum Soft", "Rheology Modifier", 0.3, "water", "anionic", 2.0, 12.0);
    private static final FormulaIngredient CARBOMER = ing("Carbomer", "Carbopol 940", "Rheology Modifier", 0.4, "dispersible", "anionic", 5.0, 10.0);
    private static final FormulaIngredient SODIUM_PCA = ing("Sodium PCA", "Sodium PCA 50%", "Humectant", 2, "water", "anionic", 4.0, 7.0);
    private static final FormulaIngredient NAOH = ing("Sodium Hydroxide", "Lye", "pH Adjuster (Base)", 0.1, "water", "non-ionic", null, null);

    private static final FormulaIngredient SORBATE = ing("Potassium Sorbate", "Potassium Sorbate", "Preservative (Antifungal)", 0.3, "water", "anionic", 3.0, 5.5);
    private static final FormulaIngredient PENTYLENE = ing("Pentylene Glycol", "Pentylene Glycol", "Solvent / Preservative Booster", 3, "water", "non-ionic", 3.0, 10.0);
    private static final FormulaIngredient KAOLIN = ing("Kaolin", "Kaolin Clay", "Absorbent", 20, "dispersible", "anionic", 4.0, 8.0);
    private static final FormulaIngredient SPECTRASTAT = ing("Caprylhydroxamic Acid (and) Glyceryl Caprylate (and) Glycerin", "Spectrastat G2", "Preservative", 1.2, "dispersible", "non-ionic", 4.0, 8.0);

    private static final FormulaIngredient HEMP = ing("Cannabis Sativa Seed Oil", "Hemp Seed Oil", "Carrier Oil", 20, "oil", "non-ionic", null, null);
    private static final FormulaIngredient AVOBENZONE = ing("Butyl Methoxydibenzoylmethane", "Avobenzone", "Active / UV Filter", 3, "oil", "non-ionic", 5.0, 7.5);
    private static final FormulaIngredient LEMON = ing("Citrus Limon Peel Oil", "Lemon Essential Oil", "Fragrance / Active", 0.5, "oil", "non-ionic", null, null, true, 0);
    private static final FormulaIngredient BERGAMOT_FCF = ing("Citrus Aurantium Bergamia (Bergamot) Fruit Oil", "Bergamot Essential Oil (FCF)", "Fragrance / Active", 0.3, "oil", "non-ionic", null, null, true, 0);

    // ---------- Helpers ----------

    private List<Recommendation> run(Double ph, ProfileConfig profile, FormulaIngredient... ingredients) {
        ValidationResponse response = new ValidationResponse();
        rule.evaluate(new ValidationRequest("Test", 100.0, null, profile, new ArrayList<>(Arrays.asList(ingredients)), List.of(), 100, 0, 0, ph), response);
        return response.getRecommendations();
    }

    private List<Recommendation> run(Double ph, FormulaIngredient... ingredients) {
        return run(ph, null, ingredients);
    }

    private static boolean has(List<Recommendation> recs, String type, String title) {
        return recs.stream().anyMatch(r -> r.type().equals(type) && r.title().equals(title));
    }

    private static Recommendation find(List<Recommendation> recs, String title) {
        return recs.stream().filter(r -> r.title().equals(title)).findFirst().orElseThrow(() -> new AssertionError("missing: " + title + " in " + recs));
    }

    // ---------- Actives ----------

    @Test
    void pureVitaminCWithNiacinamideIsAConflict() {
        assertTrue(has(run(null, WATER, LAA, NIACINAMIDE, PE9010), "conflict", "L-Ascorbic Acid + Niacinamide"));
    }

    @Test
    void vitaminCDerivativeWithNiacinamideIsASynergyNotAConflict() {
        List<Recommendation> recs = run(5.5, WATER, ETHYL_C, NIACINAMIDE, PE9010);
        assertFalse(has(recs, "conflict", "L-Ascorbic Acid + Niacinamide"), "ethyl ascorbic acid is not L-ascorbic acid");
        assertTrue(has(recs, "synergy", "Brightening Team"));
    }

    @Test
    void acidsWithRetinoidConflictAndPromptSoothers() {
        List<Recommendation> recs = run(null, WATER, GLYCOLIC, RETINOL, OLIVEM, PE9010);
        assertTrue(has(recs, "conflict", "Exfoliating Acids + Retinoid"));
        assertTrue(has(recs, "tip", "Add a Soothing Ingredient"));
        assertTrue(has(recs, "tip", "Sun Sensitivity"));
    }

    @Test
    void lacticAcidUsedOnlyAsAPhAdjusterIsNotAnExfoliant() {
        List<Recommendation> recs = run(null, WATER, LACTIC_ADJUSTER, RETINOL, OLIVEM, PE9010, TOCOPHEROL);
        assertFalse(has(recs, "conflict", "Exfoliating Acids + Retinoid"));
    }

    @Test
    void copperPeptidesClashWithVitaminCAcidsAndChelators() {
        List<Recommendation> recs = run(null, WATER, GHK_CU, LAA, SALICYLIC, EDTA, PE9010);
        assertTrue(has(recs, "conflict", "Copper Peptides + Vitamin C"));
        assertTrue(has(recs, "conflict", "Copper Peptides + Low pH"));
        assertTrue(has(recs, "conflict", "Copper Peptides + Chelator"));
    }

    @Test
    void highExfoliantLoadIsFlaggedOnlyForLeaveOnProducts() {
        FormulaIngredient strongGlycolic = ing("Glycolic Acid", "Glycolic Acid 70%", "Active (AHA)", 12, "water", "non-ionic", 3.5, 4.5);
        assertTrue(has(run(null, WATER, strongGlycolic, PE9010), "conflict", "High Exfoliant Load"));

        ProfileConfig wash = new ProfileConfig("body_wash", "Body Wash or Gel Cleanser", true, false, false, true, 4.5, 6.5, null);
        assertFalse(has(run(null, wash, WATER, strongGlycolic, PE9010), "conflict", "High Exfoliant Load"));
    }

    @Test
    void completeVitaminCTrioIsASynergy() {
        assertTrue(has(run(3.0, WATER, LAA, TOCOPHEROL, FERULIC, PROPANEDIOL, PE9010), "synergy", "Vitamin C + E + Ferulic Acid"));
        assertTrue(has(run(3.0, WATER, LAA, TOCOPHEROL, PE9010), "tip", "Complete the C + E + Ferulic Trio"));
    }

    // ---------- Structure ----------

    @Test
    void cationicConditionerWithAnionicSurfactantClashes() {
        assertTrue(has(run(null, WATER, SLES, BTMS, PE9010), "conflict", "Cationic + Anionic Clash"));
    }

    @Test
    void shampooSafePolyquatIsASynergyWithAnionicSurfactants() {
        List<Recommendation> recs = run(null, WATER, SLES, CAPB, POLYQUAT10, PE9010);
        assertFalse(has(recs, "conflict", "Cationic + Anionic Clash"));
        assertTrue(has(recs, "synergy", "2-in-1 Conditioning"));
        assertTrue(has(recs, "synergy", "Anionic + Amphoteric Blend"));
    }

    @Test
    void cationicEmulsifierWithXanthanClashes() {
        assertTrue(has(run(null, WATER, BTMS, XANTHAN, PE9010), "conflict", "Cationic Conditioner + Anionic Thickener"));
    }

    @Test
    void electrolytesThinCarbomerAndCarbomerNeedsNeutralizing() {
        List<Recommendation> recs = run(null, WATER, CARBOMER, SODIUM_PCA, PE9010);
        assertTrue(has(recs, "conflict", "Electrolytes Will Thin Your Gel"));
        assertTrue(has(recs, "tip", "Carbomer Needs Neutralizing"));
        assertFalse(has(run(null, WATER, CARBOMER, NAOH, PE9010), "tip", "Carbomer Needs Neutralizing"));
    }

    @Test
    void gumWithGlycerinGetsTheSlurryTip() {
        assertTrue(has(run(null, WATER, XANTHAN, GLYCERIN, PE9010), "tip", "Make a Slurry First"));
    }

    @Test
    void oilInWaterWithoutEmulsifierSeparates() {
        assertTrue(has(run(null, WATER, JOJOBA, PE9010), "conflict", "Oil Will Separate"));
        assertFalse(has(run(null, WATER, JOJOBA, OLIVEM, PE9010), "conflict", "Oil Will Separate"));
    }

    @Test
    void poorlySolubleActivesNeedASolvent() {
        assertTrue(has(run(null, WATER, SALICYLIC, PE9010), "tip", "Pre-Dissolve Before Adding"));
        assertFalse(has(run(null, WATER, SALICYLIC, PROPANEDIOL, PE9010), "tip", "Pre-Dissolve Before Adding"));
    }

    // ---------- Preservation ----------

    @Test
    void waterBasedFormulaWithoutPreservativeIsFlagged() {
        assertTrue(has(run(null, WATER, GLYCERIN), "conflict", "No Preservative"));
        assertTrue(has(run(null, WATER, GLYCERIN, PENTYLENE), "conflict", "Booster Is Not a Preservative"));
    }

    @Test
    void anhydrousFormulasNeedNoPreservative() {
        assertFalse(has(run(null, JOJOBA, TOCOPHEROL), "conflict", "No Preservative"));
    }

    @Test
    void antifungalOnlyPreservativeLeavesBacteriaUncovered() {
        List<Recommendation> recs = run(5.0, WATER, GLYCERIN, SORBATE);
        assertTrue(has(recs, "conflict", "No Protection Against Bacteria"));
        assertFalse(has(recs, "conflict", "No Protection Against Mold"));
    }

    @Test
    void sorbicAcidBlendedWithBenzylAlcoholIsABroadPreservative() {
        // Geogard ECT: benzyl alcohol covers bacteria, so there must be no "No Protection Against Bacteria" warning
        FormulaIngredient geogardEct = ing("Benzyl Alcohol, Salicylic Acid, Glycerin, Sorbic Acid", "Geogard ECT", "Preservative", 0.8, "dispersible", "non-ionic", 3.0, 8.0);
        List<Recommendation> recs = run(5.0, WATER, GLYCERIN, geogardEct);
        assertFalse(has(recs, "conflict", "No Protection Against Bacteria"));
        assertFalse(has(recs, "conflict", "No Protection Against Mold"));
    }

    @Test
    void preservativeWithBoosterAndChelatorAreSynergies() {
        List<Recommendation> recs = run(null, WATER, PE9010, PENTYLENE, EDTA);
        assertTrue(has(recs, "synergy", "Boosted Preservation"));
        assertTrue(has(recs, "synergy", "Preservative + Chelator"));
    }

    @Test
    void clayWithCaprylhydroxamicAcidDiscolors() {
        List<Recommendation> recs = run(null, WATER, KAOLIN, SPECTRASTAT);
        assertTrue(has(recs, "conflict", "Clay + Caprylhydroxamic Acid"));
        assertTrue(has(recs, "tip", "Add a Chelator"));
    }

    // ---------- Stability ----------

    @Test
    void ingredientsOutsideTheTargetPhAreNamed() {
        Recommendation rec = find(run(6.5, WATER, GLYCOLIC, OLIVEM, PE9010), "Outside the pH Window");
        assertTrue(rec.message().contains("Glycolic Acid 70% (pH 3.5-4.5)"), rec.message());
    }

    @Test
    void incompatiblePhWindowsAreFlaggedWhenNoTargetIsSet() {
        assertTrue(has(run(null, WATER, LAA, GHK_CU, PE9010), "conflict", "No pH Suits Every Ingredient"));
    }

    @Test
    void phRuleDoesNotRepeatWhatPhCompatibilityRuleReports() {
        List<Recommendation> recs = run(4.0, WATER, NIACINAMIDE, PE9010);
        assertFalse(has(recs, "conflict", "Outside the pH Window"), "niacinamide below pH 5 is already an alert");
    }

    @Test
    void fragileOilsNeedAnAntioxidant() {
        assertTrue(has(run(null, HEMP, JOJOBA), "tip", "Protect Fragile Oils"));
        assertFalse(has(run(null, HEMP, JOJOBA, TOCOPHEROL), "tip", "Protect Fragile Oils"));
    }

    @Test
    void avobenzoneNeedsAPhotostabilizer() {
        List<Recommendation> recs = run(null, AVOBENZONE, JOJOBA);
        assertTrue(has(recs, "conflict", "Unstable Avobenzone"));
        assertTrue(has(recs, "tip", "SPF Must Be Tested"));
    }

    @Test
    void phototoxicCitrusIsFlaggedButFcfBergamotIsNot() {
        assertTrue(has(run(null, JOJOBA, LEMON), "conflict", "Phototoxic Citrus Oil"));
        assertFalse(has(run(null, JOJOBA, BERGAMOT_FCF), "conflict", "Phototoxic Citrus Oil"));
    }

    // ---------- Output ----------

    @Test
    void conflictsComeFirstThenSynergiesThenTips() {
        List<Recommendation> recs = run(null, WATER, LAA, NIACINAMIDE, XANTHAN, GLYCERIN, PE9010, EDTA);
        List<String> types = recs.stream().map(Recommendation::type).toList();
        List<String> sorted = new ArrayList<>(types);
        sorted.sort((a, b) -> List.of("conflict", "synergy", "tip").indexOf(a) - List.of("conflict", "synergy", "tip").indexOf(b));
        assertEquals(sorted, types);
    }

    @Test
    void simpleWellBuiltLotionHasNoConflicts() {
        List<Recommendation> recs = run(5.5, WATER, GLYCERIN, OLIVEM, JOJOBA, PE9010, EDTA, TOCOPHEROL);
        assertTrue(recs.stream().noneMatch(r -> r.type().equals("conflict")), recs.toString());
    }
}
