package com.demiurgio.formularium.rules;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import com.demiurgio.formularium.TestAuthConfig;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** What the editor receives from POST /api/v1/validate: alerts and insights carry structured one-click fixes. */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestAuthConfig.class)   // the API needs sign-in; these tests are about what the endpoints do, not who calls them
class FixesContractTest {

    @Autowired private MockMvc mvc;

    private static String ingredient(String id, String inci, String fn, String phase, double pct, String solubility,
                                     Double maxTemp, Double min, Double max, Double phMin, Double phMax) {
        return String.format(java.util.Locale.ROOT,
                "{\"id\":%s,\"name\":\"%s\",\"inciName\":\"%s\",\"tradeName\":\"%s\",\"function\":\"%s\",\"phase\":\"%s\",\"percentage\":%s,"
                        + "\"solubility\":\"%s\",\"maxHeatingTempC\":%s,\"minPercentage\":%s,\"maxPercentage\":%s,\"optimalPhMin\":%s,\"optimalPhMax\":%s}",
                id == null ? "null" : "\"" + id + "\"", inci, inci, inci, fn, phase, pct, solubility, maxTemp, min, max, phMin, phMax);
    }

    private ResultActions validate(String profileJson, Double targetPh, double total, String... ingredients) throws Exception {
        String body = String.format(java.util.Locale.ROOT,
                "{\"projectName\":\"t\",\"targetWeight\":100,\"profileId\":\"p\",\"profile\":%s,\"targetPh\":%s,\"targetClaims\":[],"
                        + "\"ingredients\":[%s],\"totalPercentage\":%s,\"oilPhasePercentage\":0,\"waterPhasePercentage\":0}",
                profileJson, targetPh, String.join(",", ingredients), total);
        return mvc.perform(post("/api/v1/validate").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isOk());
    }

    private static final String LOTION = "{\"id\":\"ow_lotion\",\"name\":\"O/W Lotion\",\"requires_water\":true,\"requires_oil\":true,"
            + "\"requires_emulsifier\":true,\"requires_preservative\":true,\"default_ph_min\":5.0,\"default_ph_max\":6.0,\"max_oil_phase_percent\":30}";

    @Test
    void organicAcidPreservativesAreFlaggedAboveTheirPhAndOfferTheLowerPh() throws Exception {
        for (String acid : new String[] {"Sorbic Acid", "Benzoic Acid"}) {
            validate(LOTION, 6.5, 100,
                    ingredient("water", "Aqua", "Solvent", "A", 99, "water", 100.0, 1.0, 100.0, null, null),
                    ingredient("acid", acid, "Preservative", "C", 0.5, "alcohol", 80.0, 0.1, 0.6, 3.0, 5.5))
                    .andExpect(jsonPath("$.alerts[?(@.message =~ /.*Preservative failure risk.*/)]", hasSize(1)))
                    .andExpect(jsonPath("$.alerts[?(@.message =~ /.*Preservative failure risk.*/)].fix.kind", contains("set-ph")));
        }
    }

    @Test
    void organicAcidPreservativesAreFineAtAMildlyAcidicPh() throws Exception {
        validate(LOTION, 5.0, 100,
                ingredient("water", "Aqua", "Solvent", "A", 99, "water", 100.0, 1.0, 100.0, null, null),
                ingredient("acid", "Sorbic Acid", "Preservative", "C", 0.5, "alcohol", 80.0, 0.1, 0.6, 3.0, 6.0))
                .andExpect(jsonPath("$.alerts[?(@.message =~ /.*Preservative failure risk.*/)]", hasSize(0)));
    }

    @Test
    void misplacedHeatSensitiveIngredientsOfferAMoveToPhaseC() throws Exception {
        validate(LOTION, 5.5, 100,
                ingredient("water", "Aqua", "Solvent", "A", 94, "water", 100.0, 1.0, 100.0, null, null),
                ingredient("vitE", "Tocopherol", "Antioxidant", "B", 0.5, "oil", 40.0, 0.1, 1.0, null, null),
                ingredient("lav", "Lavender Oil", "Fragrance", "A", 0.5, "oil", 40.0, 0.1, 1.0, null, null),
                ingredient("ok", "Shea Butter", "Butter", "B", 5, "oil", 60.0, 1.0, 100.0, null, null))
                .andExpect(jsonPath("$.alerts[?(@.fix.kind == 'move-phase')].fix.ingredientIds[*]", containsInAnyOrder("vitE", "lav")))
                .andExpect(jsonPath("$.alerts[?(@.fix.kind == 'move-phase')].fix.phase", contains("C")))
                .andExpect(jsonPath("$.alerts[?(@.fix.kind == 'move-phase')].fix.label", contains("Move to Phase C")));
    }

    @Test
    void usageRateAlertsOfferTheLimitAsTheNewValue() throws Exception {
        validate(LOTION, 5.5, 100,
                ingredient("glycerin", "Glycerin", "Humectant", "A", 12, "water", 90.0, 1.0, 10.0, null, null),
                ingredient("preservative", "Euxyl PE 9010", "Preservative", "C", 0.2, "water", 80.0, 0.5, 1.1, null, null))
                .andExpect(jsonPath("$.alerts[?(@.fix.ingredientIds[0] == 'glycerin')].fix.value", contains(10.0)))
                .andExpect(jsonPath("$.alerts[?(@.fix.ingredientIds[0] == 'glycerin')].fix.label", contains("Lower to 10%")))
                .andExpect(jsonPath("$.alerts[?(@.fix.ingredientIds[0] == 'preservative')].fix.value", contains(0.5)))
                .andExpect(jsonPath("$.alerts[?(@.fix.ingredientIds[0] == 'preservative')].fix.label", contains("Raise to 0.5%")));
    }

    @Test
    void aTotalOffTargetOffersToBalance() throws Exception {
        validate(LOTION, 5.5, 82.2,
                ingredient("water", "Aqua", "Solvent", "A", 82.2, "water", 100.0, 1.0, 100.0, null, null))
                .andExpect(jsonPath("$.alerts[?(@.fix.kind == 'balance')].fix.label", org.hamcrest.Matchers.hasItem("Balance to 100%")));
    }

    @Test
    void missingPartsOfTheProfileOfferToAddThem() throws Exception {
        validate(LOTION, 5.5, 100,
                ingredient("water", "Aqua", "Solvent", "A", 100, "water", 100.0, 1.0, 100.0, null, null))
                .andExpect(jsonPath("$.alerts[?(@.fix.category == 'emulsifier')].fix.kind", contains("add-ingredient")))
                .andExpect(jsonPath("$.alerts[?(@.fix.category == 'preservative')].fix.label", contains("Add a preservative")))
                .andExpect(jsonPath("$.alerts[?(@.fix.category == 'oil')]", hasSize(1)));
    }

    @Test
    void phProblemsOfferASuitableTargetPh() throws Exception {
        validate(LOTION, 4.5, 100,
                ingredient("water", "Aqua", "Solvent", "A", 95, "water", 100.0, 1.0, 100.0, null, null),
                ingredient("niacinamide", "Niacinamide", "Active (Brightening)", "A", 5, "water", 70.0, 2.0, 5.0, 5.0, 6.0))
                .andExpect(jsonPath("$.alerts[?(@.fix.kind == 'set-ph')]", hasSize(2)))
                .andExpect(jsonPath("$.alerts[?(@.fix.kind == 'set-ph')].fix.value", contains(5.5, 5.5)))
                .andExpect(jsonPath("$.alerts[?(@.fix.label == 'Set pH to 5.5')]", hasSize(2)));
    }

    @Test
    void insightsCarryFixesToo() throws Exception {
        validate("null", 5.5, 100,
                ingredient("water", "Aqua", "Solvent", "A", 90, "water", 100.0, 1.0, 100.0, null, null),
                ingredient("glycerin", "Glycerin", "Humectant", "A", 3, "water", 90.0, 1.0, 10.0, null, null))
                .andExpect(jsonPath("$.recommendations[?(@.title == 'No Preservative')].fix.category", contains("preservative")))
                .andExpect(jsonPath("$.recommendations[?(@.title == 'No Preservative')].fix.kind", contains("add-ingredient")));
    }

    @Test
    void insightsOutsideThePhWindowOfferTheOverlappingPh() throws Exception {
        validate("null", 7.0, 100,
                ingredient("water", "Aqua", "Solvent", "A", 90, "water", 100.0, 1.0, 100.0, 1.0, 14.0),
                ingredient("niacinamide", "Niacinamide", "Active (Brightening)", "A", 4, "water", 70.0, 2.0, 5.0, 5.0, 6.0),
                ingredient("lactic", "Glycolic Acid", "Active (AHA)", "A", 4, "water", 80.0, 1.0, 10.0, 3.5, 5.5))
                .andExpect(jsonPath("$.recommendations[?(@.title == 'Outside the pH Window')].fix.kind", contains("set-ph")))
                .andExpect(jsonPath("$.recommendations[?(@.title == 'Outside the pH Window')].fix.value", contains(5.3)));
    }

    @Test
    void anIngredientWithoutAnIdGetsNoIngredientFix() throws Exception {
        validate(LOTION, 5.5, 100,
                ingredient(null, "Tocopherol", "Antioxidant", "B", 0.5, "oil", 40.0, 0.1, 1.0, null, null))
                .andExpect(jsonPath("$.alerts[?(@.message =~ /Heat-sensitive.*/)]", hasSize(1)))
                .andExpect(jsonPath("$.alerts[?(@.fix.kind == 'move-phase')]", hasSize(0)))
                // the alert is still there, and the field is left out rather than sent as null
                .andExpect(content().string(not(containsString("\"fix\":null"))));
    }
}
