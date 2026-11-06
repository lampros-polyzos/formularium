package com.demiurgio.formularium.batches;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class BatchesApiTest {
    @Autowired private MockMvc mvc;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private JwtEncoder encoder;

    private UUID alice;
    private UUID bob;
    private UUID water;
    private UUID glycerin;
    private UUID shea;
    private UUID waterLot;     // Alice's stash: 500 g at 0.001 per g
    private UUID glycerinLot;  // 3 g at 0.02 per g
    private UUID sheaLot;      // 100 g at 0.03 per g
    private UUID bobsLot;

    @BeforeEach
    void seed() {
        for (String table : List.of("batch_checks", "batch_stash_usage", "batch_ingredients", "batches", "formulation_versions", "formulations", "community_posts", "user_stash",
                "user_containers", "favorite_ingredients", "user_starred_ingredients", "ingredients", "refresh_tokens", "app_users")) {
            jdbc.update("delete from " + table);
        }
        alice = user("alice");
        bob = user("bob");
        water = ingredient("Aqua", "Distilled Water");
        glycerin = ingredient("Glycerin", "Glycerin");
        shea = ingredient("Butyrospermum Parkii Butter", "Shea Butter");
        waterLot = lot(alice, water, "500", "0.001");
        glycerinLot = lot(alice, glycerin, "3", "0.02");
        sheaLot = lot(alice, shea, "100", "0.03");
        bobsLot = lot(bob, water, "200", "0.5");
    }

    // ---- helpers

    private UUID user(String name) {
        UUID id = UUID.randomUUID();
        jdbc.update("insert into app_users (id, email, username) values (?, ?, ?)", id, name + "@example.com", name);
        return id;
    }

    private UUID ingredient(String inci, String trade) {
        UUID id = UUID.randomUUID();
        jdbc.update("insert into ingredients (id, inci_name, trade_name, function, solubility) values (?, ?, ?, 'x', 'water')", id, inci, trade);
        return id;
    }

    private UUID lot(UUID owner, UUID ingredient, String grams, String price) {
        UUID id = UUID.randomUUID();
        jdbc.update("insert into user_stash (id, user_id, ingredient_id, amount_left_g, price_per_g) values (?, ?, ?, ?, ?)", id, owner, ingredient, new BigDecimal(grams), new BigDecimal(price));
        return id;
    }

    private String token(UUID user) {
        Instant now = Instant.now();
        JwtClaimsSet claims = JwtClaimsSet.builder().issuer("formularium-test").subject(user.toString()).issuedAt(now).expiresAt(now.plusSeconds(600)).build();
        return encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims)).getTokenValue();
    }

    private MvcResult run(UUID user, MockHttpServletRequestBuilder request) throws Exception {
        return mvc.perform(request.header("Authorization", "Bearer " + token(user))).andReturn();
    }

    private MvcResult json(UUID user, MockHttpServletRequestBuilder request, String body) throws Exception {
        return run(user, request.contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private static int code(MvcResult r) { return r.getResponse().getStatus(); }

    private <T> T read(MvcResult r, String path) throws Exception { return JsonPath.read(r.getResponse().getContentAsString(), path); }

    private BigDecimal grams(UUID lot) { return jdbc.queryForObject("select amount_left_g from user_stash where id = ?", BigDecimal.class, lot); }

    private long count(String sql, Object... args) { return jdbc.queryForObject(sql, Long.class, args); }

    private static String line(UUID ingredient, String name, String phase, String pct, String planned, String allocations, String extra) {
        return "{\"ingredient_id\":\"" + ingredient + "\",\"name\":\"" + name + "\",\"inci_name\":\"" + name + "\",\"phase\":\"" + phase + "\",\"percentage\":" + pct
                + ",\"planned_g\":" + planned + ",\"actual_g\":" + planned + ",\"allocations\":[" + allocations + "]" + extra + "}";
    }

    private static String take(UUID lot, String grams) { return "{\"stash_id\":\"" + lot + "\",\"grams\":" + grams + ",\"label\":\"lot\"}"; }

    /** 100 g: water 70 g (all from the stash), glycerin 5 g (only 3 g in the stash), shea 25 g (all from the stash). */
    private String hundredGrams(String lotNumber) {
        return "{\"name\":\"Day Cream\",\"lot_number\":\"" + lotNumber + "\",\"batch_size_g\":100,\"target_ph\":5.5,\"notes\":\"  first try  \",\"lines\":["
                + line(water, "Distilled Water", "A", "70", "70", take(waterLot, "70"), "") + ","
                + line(glycerin, "Glycerin", "A", "5", "5", take(glycerinLot, "3"), ",\"est_price_per_g\":0.01") + ","
                + line(shea, "Shea Butter", "B", "25", "25", take(sheaLot, "25"), "") + "]}";
    }

    private String start(UUID user, String body) throws Exception {
        MvcResult r = json(user, post("/api/v1/batches"), body);
        assertThat(code(r)).as(r.getResponse().getContentAsString()).isEqualTo(201);
        return read(r, "$.id");
    }

    // ---- access

    @Test
    void everythingNeedsSignIn() throws Exception {
        for (MockHttpServletRequestBuilder request : List.of(get("/api/v1/batches"), get("/api/v1/batches/lines"), get("/api/v1/batches/checks/due"), get("/api/v1/batches/checks/due/count"),
                get("/api/v1/batches/lot-numbers?prefix=1"), get("/api/v1/batches/" + UUID.randomUUID()), delete("/api/v1/batches/" + UUID.randomUUID()),
                post("/api/v1/batches/" + UUID.randomUUID() + "/void"))) {
            mvc.perform(request).andExpect(status().isUnauthorized());
        }
        mvc.perform(post("/api/v1/batches").contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isUnauthorized());
    }

    // ---- starting a batch

    @Test
    void startingABatchTakesTheGramsOutOfTheStash_andWorksOutWhatItCost() throws Exception {
        String id = start(alice, hundredGrams("261106-1"));

        assertThat(grams(waterLot)).isEqualByComparingTo("430");
        assertThat(grams(glycerinLot)).isEqualByComparingTo("0");
        assertThat(grams(sheaLot)).isEqualByComparingTo("75");
        assertThat(grams(bobsLot)).as("someone else's stash is never touched").isEqualByComparingTo("200");

        MvcResult detail = run(alice, get("/api/v1/batches/" + id));
        assertThat((String) read(detail, "$.batch.name")).isEqualTo("Day Cream");
        assertThat((String) read(detail, "$.batch.notes")).isEqualTo("first try");
        assertThat((Boolean) read(detail, "$.batch.stash_deducted")).isTrue();
        assertThat((String) read(detail, "$.batch.status")).isEqualTo("active");

        // water: 70 g x 0.001 = 0.07. glycerin: 3 g x 0.02 = 0.06, plus the 2 g not in the stash estimated at 0.01 = 0.02. shea: 25 g x 0.03 = 0.75.
        assertThat(this.<List<Number>>read(detail, "$.lines[?(@.name=='Distilled Water')].cost").get(0).doubleValue()).isEqualTo(0.07);
        assertThat(this.<List<Number>>read(detail, "$.lines[?(@.name=='Glycerin')].cost").get(0).doubleValue()).isEqualTo(0.08);
        assertThat(this.<List<Number>>read(detail, "$.lines[?(@.name=='Shea Butter')].cost").get(0).doubleValue()).isEqualTo(0.75);
        assertThat(this.<List<Boolean>>read(detail, "$.lines[?(@.name=='Glycerin')].cost_estimated")).containsExactly(true);
        assertThat(this.<List<Boolean>>read(detail, "$.lines[?(@.name=='Shea Butter')].cost_estimated")).containsExactly(false);
        assertThat(((Number) read(detail, "$.batch.ingredient_cost")).doubleValue()).isEqualTo(0.9);
        assertThat(((Number) read(detail, "$.batch.unpriced_count")).intValue()).isZero();
        assertThat(this.<List<?>>read(detail, "$.usage")).hasSize(3);
    }

    @Test
    void aBatchStartsWithFourCheckInsCountedFromTheDayItWasMade() throws Exception {
        LocalDate day = LocalDate.of(2026, 11, 1);
        String id = start(alice, hundredGrams("L1").replace("\"batch_size_g\":100", "\"batch_size_g\":100,\"made_on\":\"" + day + "\""));
        MvcResult detail = run(alice, get("/api/v1/batches/" + id));
        assertThat(this.<List<String>>read(detail, "$.checks[*].label")).containsExactly("24 hours", "1 week", "4 weeks", "12 weeks");
        assertThat(this.<List<String>>read(detail, "$.checks[*].due_on")).containsExactly("2026-11-02", "2026-11-08", "2026-11-29", "2027-01-24");
    }

    @Test
    void aLineWithNoAllocationsIsOnlyRecorded_andCostsNothingUnlessThereIsAnEstimate() throws Exception {
        String body = "{\"name\":\"Test\",\"lot_number\":\"T1\",\"batch_size_g\":10,\"lines\":["
                + line(water, "Distilled Water", "A", "60", "6", "", "") + "," + line(glycerin, "Glycerin", "A", "40", "4", "", ",\"est_price_per_g\":0.5") + "]}";
        String id = start(alice, body);
        MvcResult detail = run(alice, get("/api/v1/batches/" + id));

        assertThat((Boolean) read(detail, "$.batch.stash_deducted")).isFalse();
        assertThat(this.<List<Object>>read(detail, "$.lines[?(@.name=='Distilled Water')].cost")).containsNull();
        assertThat(this.<List<Number>>read(detail, "$.lines[?(@.name=='Glycerin')].cost").get(0).doubleValue()).isEqualTo(2.0);
        assertThat(((Number) read(detail, "$.batch.unpriced_count")).intValue()).isEqualTo(1);
        assertThat(grams(waterLot)).isEqualByComparingTo("500");
    }

    @Test
    void ifAnyLotNoLongerHoldsEnough_nothingIsTakenAndNothingIsRecorded() throws Exception {
        jdbc.update("update user_stash set amount_left_g = 10 where id = ?", sheaLot);   // the shea changed since the window opened

        MvcResult r = json(alice, post("/api/v1/batches"), hundredGrams("L2"));
        assertThat(code(r)).isEqualTo(409);
        assertThat((String) read(r, "$.error.code")).isEqualTo("stash_changed");
        assertThat((String) read(r, "$.error.message")).contains("Shea Butter");

        assertThat(grams(waterLot)).as("the water taken before the failure was put back").isEqualByComparingTo("500");
        assertThat(grams(glycerinLot)).isEqualByComparingTo("3");
        assertThat(count("select count(*) from batches")).isZero();
        assertThat(count("select count(*) from batch_ingredients")).isZero();
        assertThat(count("select count(*) from batch_stash_usage")).isZero();
        assertThat(count("select count(*) from batch_checks")).isZero();
    }

    @Test
    void youCannotTakeFromSomeoneElsesStash() throws Exception {
        String body = "{\"name\":\"Sneaky\",\"lot_number\":\"S1\",\"batch_size_g\":10,\"lines\":[" + line(water, "Distilled Water", "A", "100", "10", take(bobsLot, "10"), "") + "]}";
        MvcResult r = json(alice, post("/api/v1/batches"), body);
        assertThat(code(r)).isEqualTo(409);
        assertThat(grams(bobsLot)).isEqualByComparingTo("200");
        assertThat(count("select count(*) from batches")).isZero();
    }

    @Test
    void oneWaterLotCanFeedTwoLines_butNotMoreThanItHolds() throws Exception {
        String body = "{\"name\":\"Twice\",\"lot_number\":\"W1\",\"batch_size_g\":10,\"lines\":["
                + line(water, "Distilled Water", "A", "50", "300", take(waterLot, "300"), "") + "," + line(water, "Distilled Water", "B", "50", "300", take(waterLot, "300"), "") + "]}";
        assertThat(code(json(alice, post("/api/v1/batches"), body))).isEqualTo(409);   // 600 g from a 500 g lot
        assertThat(grams(waterLot)).isEqualByComparingTo("500");
    }

    @Test
    void aLotNumberCanOnlyBeUsedOnce_butTwoPeopleMayUseTheSame() throws Exception {
        start(alice, hundredGrams("DUP"));
        MvcResult again = json(alice, post("/api/v1/batches"), "{\"name\":\"x\",\"lot_number\":\"DUP\",\"batch_size_g\":1,\"lines\":[" + line(water, "w", "A", "100", "1", "", "") + "]}");
        assertThat(code(again)).isEqualTo(409);
        assertThat((String) read(again, "$.error.code")).isEqualTo("lot_number_taken");
        assertThat(code(json(bob, post("/api/v1/batches"), "{\"name\":\"x\",\"lot_number\":\"DUP\",\"batch_size_g\":1,\"lines\":[" + line(water, "w", "A", "100", "1", "", "") + "]}"))).isEqualTo(201);
    }

    @Test
    void refusesWhatItShouldNot() throws Exception {
        String ok = line(water, "w", "A", "100", "1", "", "");
        assertThat(code(json(alice, post("/api/v1/batches"), "{\"name\":\"x\",\"lot_number\":\"1\",\"batch_size_g\":1,\"lines\":[]}"))).isEqualTo(400);
        assertThat(code(json(alice, post("/api/v1/batches"), "{\"name\":\"x\",\"lot_number\":\"1\",\"batch_size_g\":0,\"lines\":[" + ok + "]}"))).isEqualTo(400);
        assertThat(code(json(alice, post("/api/v1/batches"), "{\"name\":\"\",\"lot_number\":\"1\",\"batch_size_g\":1,\"lines\":[" + ok + "]}"))).isEqualTo(400);
        assertThat(code(json(alice, post("/api/v1/batches"), "{\"name\":\"x\",\"lot_number\":\" \",\"batch_size_g\":1,\"lines\":[" + ok + "]}"))).isEqualTo(400);
        assertThat(code(json(alice, post("/api/v1/batches"), "{\"name\":\"x\",\"lot_number\":\"1\",\"batch_size_g\":1,\"lines\":[" + line(water, "w", "A", "100", "1", take(waterLot, "-5"), "") + "]}"))).isEqualTo(400);
        assertThat(code(json(alice, post("/api/v1/batches"), "{\"name\":\"x\",\"lot_number\":\"1\",\"batch_size_g\":1,\"lines\":[" + line(UUID.randomUUID(), "w", "A", "100", "1", "", "") + "]}"))).isEqualTo(400);
        assertThat(code(json(alice, post("/api/v1/batches"), "{\"name\":\"x\",\"lot_number\":\"1\",\"batch_size_g\":1,\"formulation_id\":\"" + UUID.randomUUID() + "\",\"lines\":[" + ok + "]}"))).isEqualTo(400);
        assertThat(count("select count(*) from batches")).isZero();
    }

    @Test
    void remembersWhatItWasFilledInto_evenIfTheContainerIsDeletedLater() throws Exception {
        UUID bottle = UUID.randomUUID();
        jdbc.update("insert into user_containers (id, user_id, name, container_type, volume_ml) values (?, ?, '30 ml dropper', 'Bottle', 30)", bottle, alice);
        String body = hundredGrams("C1").replace("\"batch_size_g\":100", "\"batch_size_g\":100,\"container\":{\"id\":\"" + bottle + "\",\"name\":\"30 ml dropper\",\"volume_ml\":30,\"count\":3.3,\"unit_price\":0.8,\"density_g_ml\":0.95}");
        String id = start(alice, body);

        jdbc.update("delete from user_containers where id = ?", bottle);
        MvcResult detail = run(alice, get("/api/v1/batches/" + id));
        assertThat((String) read(detail, "$.batch.container_name")).isEqualTo("30 ml dropper");
        assertThat(((Number) read(detail, "$.batch.container_count")).doubleValue()).isEqualTo(3.3);
        assertThat(this.<Object>read(detail, "$.batch.container_id")).isNull();
    }

    // ---- reading

    @Test
    void listsOnlyYourBatches_newestFirst_eachWithItsCheckIns() throws Exception {
        String older = start(alice, hundredGrams("A1").replace("\"batch_size_g\":100", "\"batch_size_g\":100,\"made_on\":\"2026-10-01\""));
        String newer = start(bob, "{\"name\":\"Bob\",\"lot_number\":\"B1\",\"batch_size_g\":1,\"lines\":[" + line(water, "w", "A", "100", "1", "", "") + "]}");
        String mine = start(alice, "{\"name\":\"Newest\",\"lot_number\":\"A2\",\"batch_size_g\":1,\"made_on\":\"2026-11-02\",\"lines\":[" + line(water, "w", "A", "100", "1", "", "") + "]}");

        MvcResult list = run(alice, get("/api/v1/batches"));
        assertThat(this.<List<String>>read(list, "$[*].id")).containsExactly(mine, older);
        assertThat(this.<List<?>>read(list, "$[0].batch_checks")).hasSize(4);
        assertThat(this.<List<String>>read(list, "$[0].batch_checks[*].label")).containsExactly("24 hours", "1 week", "4 weeks", "12 weeks");
        assertThat(list.getResponse().getContentAsString()).doesNotContain(newer);

        assertThat(code(run(bob, get("/api/v1/batches/" + mine)))).isEqualTo(404);
    }

    @Test
    void suggestsLotNumbersByPrefix_treatingPercentAndUnderscoreAsPlainText() throws Exception {
        start(alice, hundredGrams("261106-1"));
        start(alice, "{\"name\":\"x\",\"lot_number\":\"261106-2\",\"batch_size_g\":1,\"lines\":[" + line(water, "w", "A", "100", "1", "", "") + "]}");
        start(alice, "{\"name\":\"x\",\"lot_number\":\"261107-1\",\"batch_size_g\":1,\"lines\":[" + line(water, "w", "A", "100", "1", "", "") + "]}");
        start(bob, "{\"name\":\"x\",\"lot_number\":\"261106-9\",\"batch_size_g\":1,\"lines\":[" + line(water, "w", "A", "100", "1", "", "") + "]}");

        assertThat(this.<List<String>>read(run(alice, get("/api/v1/batches/lot-numbers?prefix=261106-")), "$")).containsExactlyInAnyOrder("261106-1", "261106-2");
        assertThat(this.<List<String>>read(run(alice, get("/api/v1/batches/lot-numbers?prefix=%25")), "$")).isEmpty();   // "%" is not a wildcard
    }

    @Test
    void givesEveryLineOfEveryBatchForTheMetrics() throws Exception {
        start(alice, hundredGrams("M1"));
        start(bob, "{\"name\":\"x\",\"lot_number\":\"M2\",\"batch_size_g\":1,\"lines\":[" + line(water, "Bob water", "A", "100", "1", "", "") + "]}");
        MvcResult lines = run(alice, get("/api/v1/batches/lines"));
        assertThat(this.<List<String>>read(lines, "$[*].name")).containsExactlyInAnyOrder("Distilled Water", "Glycerin", "Shea Butter");
    }

    // ---- undoing and deleting

    @Test
    void undoingABatchPutsTheGramsBack_onceOnly() throws Exception {
        String id = start(alice, hundredGrams("U1"));
        assertThat(grams(sheaLot)).isEqualByComparingTo("75");

        assertThat(code(run(alice, post("/api/v1/batches/" + id + "/void")))).isEqualTo(204);
        assertThat(grams(waterLot)).isEqualByComparingTo("500");
        assertThat(grams(glycerinLot)).isEqualByComparingTo("3");
        assertThat(grams(sheaLot)).isEqualByComparingTo("100");
        assertThat((String) read(run(alice, get("/api/v1/batches/" + id)), "$.batch.status")).isEqualTo("voided");

        assertThat(code(run(alice, post("/api/v1/batches/" + id + "/void")))).as("a second undo must not put the grams back again").isEqualTo(404);
        assertThat(grams(sheaLot)).isEqualByComparingTo("100");
    }

    @Test
    void undoingSkipsALotThatWasDeleted_andSomeoneElsesBatchCannotBeUndone() throws Exception {
        String id = start(alice, hundredGrams("U2"));
        jdbc.update("delete from user_stash where id = ?", sheaLot);

        assertThat(code(run(bob, post("/api/v1/batches/" + id + "/void")))).isEqualTo(404);
        assertThat(code(run(alice, post("/api/v1/batches/" + id + "/void")))).isEqualTo(204);
        assertThat(grams(waterLot)).isEqualByComparingTo("500");
    }

    @Test
    void deletingABatchRemovesItsLinesUsageAndCheckIns_butNeverTouchesTheStash() throws Exception {
        String id = start(alice, hundredGrams("D1"));
        assertThat(code(run(bob, delete("/api/v1/batches/" + id)))).isEqualTo(404);
        assertThat(code(run(alice, delete("/api/v1/batches/" + id)))).isEqualTo(204);

        assertThat(count("select count(*) from batches")).isZero();
        assertThat(count("select count(*) from batch_ingredients")).isZero();
        assertThat(count("select count(*) from batch_stash_usage")).isZero();
        assertThat(count("select count(*) from batch_checks")).isZero();
        assertThat(grams(sheaLot)).as("deleting does not give the stash back: undo it first").isEqualByComparingTo("75");
        assertThat(code(run(alice, delete("/api/v1/batches/" + id)))).isEqualTo(404);
    }

    // ---- editing

    @Test
    void editsTheMeasurementsAndStatus_butNotAnUndoneBatch_andNeverToVoided() throws Exception {
        String id = start(alice, hundredGrams("E1"));
        assertThat(code(json(alice, patch("/api/v1/batches/" + id), "{\"measured_ph\":5.6,\"final_weight_g\":98.5,\"notes\":\"Thick\"}"))).isEqualTo(204);
        MvcResult detail = run(alice, get("/api/v1/batches/" + id));
        assertThat(((Number) read(detail, "$.batch.measured_ph")).doubleValue()).isEqualTo(5.6);
        assertThat(((Number) read(detail, "$.batch.final_weight_g")).doubleValue()).isEqualTo(98.5);
        assertThat((String) read(detail, "$.batch.notes")).isEqualTo("Thick");

        assertThat(code(json(alice, patch("/api/v1/batches/" + id), "{\"status\":\"archived\"}"))).isEqualTo(204);
        assertThat(code(json(alice, patch("/api/v1/batches/" + id), "{\"status\":\"voided\"}"))).as("only undoing a batch can void it").isEqualTo(400);
        assertThat(code(json(alice, patch("/api/v1/batches/" + id), "{\"measured_ph\":20}"))).isEqualTo(400);
        assertThat(code(json(bob, patch("/api/v1/batches/" + id), "{\"notes\":\"mine now\"}"))).isEqualTo(404);

        run(alice, post("/api/v1/batches/" + id + "/void"));
        assertThat(code(json(alice, patch("/api/v1/batches/" + id), "{\"status\":\"active\"}"))).as("an undone batch cannot be brought back to life").isEqualTo(404);
    }

    @Test
    void changingALotNumberToOneAlreadyUsedIsRefused() throws Exception {
        String first = start(alice, hundredGrams("N1"));
        start(alice, "{\"name\":\"x\",\"lot_number\":\"N2\",\"batch_size_g\":1,\"lines\":[" + line(water, "w", "A", "100", "1", "", "") + "]}");
        assertThat(code(json(alice, patch("/api/v1/batches/" + first), "{\"lot_number\":\"N2\"}"))).isEqualTo(409);
        assertThat(code(json(alice, patch("/api/v1/batches/" + first), "{\"lot_number\":\"N3\"}"))).isEqualTo(204);
    }

    // ---- check-ins

    @Test
    void showsTheCheckInsThatAreDue_andCountsThem_onBatchesStillInProgress() throws Exception {
        LocalDate old = LocalDate.now().minusDays(10);
        String id = start(alice, hundredGrams("K1").replace("\"batch_size_g\":100", "\"batch_size_g\":100,\"made_on\":\"" + old + "\""));
        String discarded = start(alice, "{\"name\":\"Old\",\"lot_number\":\"K2\",\"batch_size_g\":1,\"made_on\":\"" + old + "\",\"lines\":[" + line(water, "w", "A", "100", "1", "", "") + "]}");
        run(alice, patch("/api/v1/batches/" + discarded).contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"discarded\"}"));
        start(bob, "{\"name\":\"Bob\",\"lot_number\":\"K3\",\"batch_size_g\":1,\"made_on\":\"" + old + "\",\"lines\":[" + line(water, "w", "A", "100", "1", "", "") + "]}");

        // 24 hours and 1 week are due (10 days on); 4 and 12 weeks are not
        MvcResult due = run(alice, get("/api/v1/batches/checks/due"));
        assertThat(this.<List<String>>read(due, "$[*].label")).containsExactly("24 hours", "1 week");
        assertThat(this.<List<String>>read(due, "$[*].batch.id")).containsOnly(id);
        assertThat((String) read(due, "$[0].batch.lot_number")).isEqualTo("K1");
        assertThat(((Number) read(due, "$[0].batch.target_ph")).doubleValue()).isEqualTo(5.5);
        assertThat(((Number) read(run(alice, get("/api/v1/batches/checks/due/count")), "$.count")).intValue()).isEqualTo(2);

        assertThat(this.<List<?>>read(run(alice, get("/api/v1/batches/checks/due?limit=1")), "$")).hasSize(1);
        // a date far from the server's own is ignored, so nobody can ask the future (or the past) what is due
        assertThat(((Number) read(run(alice, get("/api/v1/batches/checks/due/count?today=" + LocalDate.now().plusDays(60))), "$.count")).intValue()).isEqualTo(2);
        assertThat(code(run(alice, get("/api/v1/batches/checks/due?today=not-a-date")))).isEqualTo(400);
    }

    @Test
    void answeringACheckInRecordsItAndStopsItFromBeingDue() throws Exception {
        String id = start(alice, hundredGrams("K4").replace("\"batch_size_g\":100", "\"batch_size_g\":100,\"made_on\":\"" + LocalDate.now().minusDays(3) + "\""));
        MvcResult due = run(alice, get("/api/v1/batches/checks/due"));
        assertThat(this.<List<?>>read(due, "$")).hasSize(1);
        String checkId = read(due, "$[0].id");

        assertThat(code(json(bob, put("/api/v1/batches/checks/" + checkId), "{\"result\":\"good\"}"))).isEqualTo(404);
        assertThat(code(json(alice, put("/api/v1/batches/checks/" + checkId), "{\"result\":\"fine\"}"))).isEqualTo(400);
        assertThat(code(json(alice, put("/api/v1/batches/checks/" + checkId), "{\"result\":\"minor\",\"observations\":[\"separation\",\"odor\"],\"measured_ph\":5.2,\"notes\":\"  a bit thin  \"}"))).isEqualTo(204);

        MvcResult detail = run(alice, get("/api/v1/batches/" + id));
        assertThat(this.<List<String>>read(detail, "$.checks[?(@.id=='" + checkId + "')].result")).containsExactly("minor");
        assertThat(this.<List<List<String>>>read(detail, "$.checks[?(@.id=='" + checkId + "')].observations").get(0)).containsExactly("separation", "odor");
        assertThat(this.<List<String>>read(detail, "$.checks[?(@.id=='" + checkId + "')].notes")).containsExactly("a bit thin");
        assertThat(this.<List<String>>read(detail, "$.checks[?(@.id=='" + checkId + "')].checked_at").get(0)).isNotBlank();
        assertThat(((Number) read(run(alice, get("/api/v1/batches/checks/due/count")), "$.count")).intValue()).isZero();   // made 3 days ago: only the 24-hour check was due
    }

    @Test
    void anExtraCheckInCanBeAddedToYourOwnBatch() throws Exception {
        String id = start(alice, hundredGrams("K5"));
        assertThat(code(json(alice, post("/api/v1/batches/" + id + "/checks"), "{\"label\":\"  6 months  \",\"due_on\":\"2027-05-06\"}"))).isEqualTo(201);
        assertThat(this.<List<String>>read(run(alice, get("/api/v1/batches/" + id)), "$.checks[*].label")).contains("6 months");
        assertThat(code(json(bob, post("/api/v1/batches/" + id + "/checks"), "{\"label\":\"x\",\"due_on\":\"2027-05-06\"}"))).isEqualTo(404);
        assertThat(code(json(alice, post("/api/v1/batches/" + id + "/checks"), "{\"label\":\"\",\"due_on\":\"2027-05-06\"}"))).isEqualTo(400);
    }

    @Test
    void deletingTheAccountRemovesItsBatches() throws Exception {
        start(alice, hundredGrams("Z1"));
        run(alice, delete("/api/v1/auth/me"));
        assertThat(count("select count(*) from batches")).isZero();
        assertThat(count("select count(*) from batch_ingredients")).isZero();
        assertThat(count("select count(*) from batch_checks")).isZero();
    }
}
