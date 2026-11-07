package com.demiurgio.formularium.formulas;

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
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class FormulasApiTest {
    @Autowired private MockMvc mvc;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private JwtEncoder encoder;

    private UUID alice;
    private UUID bob;
    private UUID water;
    private UUID glycerin;
    private UUID shea;
    private UUID bobsOwn;   // Bob's private ingredient

    @BeforeEach
    void seed() {
        for (String table : List.of("formulation_versions", "formulations", "community_posts", "user_stash", "user_containers", "favorite_ingredients", "user_starred_ingredients", "ingredients", "refresh_tokens", "app_users")) {
            jdbc.update("delete from " + table);
        }
        alice = user("alice");
        bob = user("bob");
        water = ingredient(null, "Aqua", "Distilled Water");
        glycerin = ingredient(null, "Glycerin", "Vegetable Glycerin");
        shea = ingredient(null, "Butyrospermum Parkii Butter", "Shea Butter");
        bobsOwn = ingredient(bob, "Bob Secret", "Bob's Secret");
    }

    // ---- helpers

    private UUID user(String name) {
        UUID id = UUID.randomUUID();
        jdbc.update("insert into app_users (id, email, username) values (?, ?, ?)", id, name + "@example.com", name);
        return id;
    }

    private UUID ingredient(UUID owner, String inci, String trade) {
        UUID id = UUID.randomUUID();
        jdbc.update("insert into ingredients (id, user_id, inci_name, trade_name, function, solubility) values (?, ?, ?, ?, 'Solvent', 'water')", id, owner, inci, trade);
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

    private static String line(UUID ingredient, String phase, String pct, boolean qs) {
        return "{\"ingredient_id\":\"" + ingredient + "\",\"phase_letter\":\"" + phase + "\",\"percentage\":" + pct + ",\"is_qs\":" + qs + "}";
    }

    private static final String NAME = "\"name\":\"Day Cream\",\"profile_id\":\"ow_lotion\",\"target_weight_g\":200,\"target_ph\":5.5";

    private String body(String extra, String... lines) {
        return "{" + NAME + (extra.isEmpty() ? "" : "," + extra) + ",\"ingredients\":[" + String.join(",", lines) + "]}";
    }

    private String lotion() {
        return body("", line(water, "A", "80", true), line(glycerin, "A", "5", false), line(shea, "B", "15", false));
    }

    private String create(UUID user, String body) throws Exception {
        MvcResult r = json(user, post("/api/v1/formulas"), body);
        assertThat(code(r)).as(r.getResponse().getContentAsString()).isEqualTo(201);
        return read(r, "$.id");
    }

    private long count(String sql, Object... args) { return jdbc.queryForObject(sql, Long.class, args); }

    // ---- access

    @Test
    void everythingNeedsSignIn() throws Exception {
        for (MockHttpServletRequestBuilder request : List.of(get("/api/v1/profiles"), get("/api/v1/formulas"), get("/api/v1/formulas/" + UUID.randomUUID()),
                delete("/api/v1/formulas/" + UUID.randomUUID()), get("/api/v1/formulas/" + UUID.randomUUID() + "/versions"))) {
            mvc.perform(request).andExpect(status().isUnauthorized());
        }
        mvc.perform(post("/api/v1/formulas").contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isUnauthorized());
    }

    // ---- product types

    @Test
    void listsTheProductTypes_andOneByItsId() throws Exception {
        MvcResult all = run(alice, get("/api/v1/profiles"));
        List<String> ids = read(all, "$[*].id");
        // the product types of the real reference data (supabase/migrations/20261101000001_reference_data.sql)
        assertThat(ids).containsExactlyInAnyOrder("body_butter", "body_wash", "facial_oil", "ow_lotion", "shampoo", "toner_mist", "water_serum", "wo_cream");

        MvcResult one = run(alice, get("/api/v1/profiles/ow_lotion"));
        assertThat((Boolean) read(one, "$.requires_water")).isTrue();
        assertThat(((Number) read(one, "$.max_oil_phase_percent")).intValue()).isEqualTo(30);
        assertThat(code(run(alice, get("/api/v1/profiles/nope")))).isEqualTo(404);
    }

    // ---- creating and reading

    @Test
    void createsADraftWithItsPhasesAndIngredients_readBackInTheShapeTheEditorReads() throws Exception {
        MvcResult created = json(alice, post("/api/v1/formulas"), lotion());
        assertThat(code(created)).isEqualTo(201);
        assertThat((String) read(created, "$.status")).isEqualTo("Draft");
        assertThat((String) read(created, "$.user_id")).isEqualTo(alice.toString());
        assertThat(((Number) read(created, "$.target_weight_g")).intValue()).isEqualTo(200);

        List<String> letters = read(created, "$.formulation_phases[*].phase_letter");
        assertThat(letters).containsExactly("A", "B");
        List<String> phaseA = read(created, "$.formulation_phases[?(@.phase_letter=='A')].formulation_ingredients[*].ingredients.inci_name");
        assertThat(phaseA).containsExactly("Aqua", "Glycerin");   // largest first
        List<Boolean> qs = read(created, "$.formulation_phases[?(@.phase_letter=='A')].formulation_ingredients[*].is_qs");
        assertThat(qs).containsExactly(true, false);
        assertThat(this.<List<String>>read(created, "$.formulation_phases[?(@.phase_letter=='B')].formulation_ingredients[0].ingredients.trade_name")).containsExactly("Shea Butter");
    }

    @Test
    void aNewFormulaDefaultsToAHundredGramsAndAcceptsNoPhOrProfile() throws Exception {
        MvcResult r = json(alice, post("/api/v1/formulas"), "{\"name\":\"Bare\",\"ingredients\":[]}");
        assertThat(code(r)).isEqualTo(201);
        assertThat(((Number) read(r, "$.target_weight_g")).intValue()).isEqualTo(100);
        assertThat(this.<Object>read(r, "$.profile_id")).isNull();
        assertThat(this.<List<?>>read(r, "$.formulation_phases")).isEmpty();
    }

    @Test
    void refusesWhatItShouldNot() throws Exception {
        assertThat(code(json(alice, post("/api/v1/formulas"), body("", line(water, "A", "101", false))))).isEqualTo(400);
        assertThat(code(json(alice, post("/api/v1/formulas"), body("", line(water, "A", "-1", false))))).isEqualTo(400);
        assertThat(code(json(alice, post("/api/v1/formulas"), body("", line(water, "TOOLONG", "5", false))))).isEqualTo(400);
        assertThat(code(json(alice, post("/api/v1/formulas"), "{\"name\":\"\",\"ingredients\":[]}"))).isEqualTo(400);
        assertThat(code(json(alice, post("/api/v1/formulas"), "{\"name\":\"x\",\"profile_id\":\"nope\",\"ingredients\":[]}"))).isEqualTo(400);
        assertThat(code(json(alice, post("/api/v1/formulas"), "{\"name\":\"x\",\"target_ph\":15,\"ingredients\":[]}"))).isEqualTo(400);
        assertThat(code(json(alice, post("/api/v1/formulas"), "{\"name\":\"x\"}"))).isEqualTo(400);   // no ingredients list
        assertThat(count("select count(*) from formulations")).isZero();
    }

    @Test
    void cannotUseAnIngredientThatIsSomeoneElsesPrivateOne_andNothingIsLeftBehind() throws Exception {
        MvcResult r = json(alice, post("/api/v1/formulas"), body("", line(water, "A", "50", false), line(bobsOwn, "A", "50", false)));
        assertThat(code(r)).isEqualTo(400);
        assertThat((String) read(r, "$.error.code")).isEqualTo("unknown_ingredient");
        assertThat(count("select count(*) from formulations")).isZero();
        assertThat(count("select count(*) from formulation_phases")).isZero();
    }

    @Test
    void showsAndListsOnlyYourOwnFormulas() throws Exception {
        String mine = create(alice, lotion());
        create(bob, lotion());

        assertThat(code(run(bob, get("/api/v1/formulas/" + mine)))).isEqualTo(404);
        assertThat(code(run(alice, get("/api/v1/formulas/" + mine)))).isEqualTo(200);

        List<String> ids = read(run(alice, get("/api/v1/formulas")), "$[*].id");
        assertThat(ids).containsExactly(mine);
    }

    @Test
    void listsNewestFirst_orByNameWithTheirLines() throws Exception {
        String b = create(alice, body("", line(water, "A", "100", false)).replace("Day Cream", "Beta"));
        String a = create(alice, body("", line(shea, "A", "100", false)).replace("Day Cream", "Alpha"));
        jdbc.update("update formulations set created_at = timestamp '2020-01-01 00:00:00' where id = ?", UUID.fromString(b));

        List<String> newestFirst = read(run(alice, get("/api/v1/formulas")), "$[*].name");
        assertThat(newestFirst).containsExactly("Alpha", "Beta");

        MvcResult withLines = run(alice, get("/api/v1/formulas?lines=true"));
        assertThat(this.<List<String>>read(withLines, "$[*].name")).containsExactly("Alpha", "Beta");
        assertThat(this.<List<String>>read(withLines, "$[0].formulation_phases[0].formulation_ingredients[*].ingredients.trade_name")).containsExactly("Shea Butter");
        assertThat(this.<List<String>>read(withLines, "$[?(@.id=='" + a + "')].id")).hasSize(1);
        assertThat(run(bob, get("/api/v1/formulas?lines=true")).getResponse().getContentAsString()).isEqualTo("[]");
    }

    // ---- saving

    @Test
    void savingReplacesTheContentsAndDetails_butKeepsTheStatusAndWhereItCameFrom() throws Exception {
        UUID post = UUID.randomUUID();
        jdbc.update("insert into community_posts (id, author_id, title) values (?, ?, 'Original')", post, bob);
        String id = create(alice, body("\"remixed_from_post_id\":\"" + post + "\"", line(water, "A", "100", false)));
        jdbc.update("update formulations set status = 'Stable' where id = ?", UUID.fromString(id));

        MvcResult saved = json(alice, put("/api/v1/formulas/" + id),
                "{\"name\":\"Renamed\",\"profile_id\":\"body_butter\",\"target_weight_g\":50,\"target_ph\":null,\"remixed_from_post_id\":null,\"ingredients\":[" + line(shea, "A", "100", false) + "]}");
        assertThat(code(saved)).isEqualTo(200);
        assertThat((String) read(saved, "$.name")).isEqualTo("Renamed");
        assertThat((String) read(saved, "$.status")).isEqualTo("Stable");
        assertThat((String) read(saved, "$.remixed_from_post_id")).isEqualTo(post.toString());   // the link is never changed by a save
        assertThat(this.<List<String>>read(saved, "$.formulation_phases[*].formulation_ingredients[*].ingredients.trade_name")).containsExactly("Shea Butter");
        assertThat(count("select count(*) from formulation_phases where formulation_id = ?", UUID.fromString(id))).isEqualTo(1);
    }

    @Test
    void aFailedSaveLeavesTheFormulaExactlyAsItWas() throws Exception {
        String id = create(alice, lotion());

        MvcResult failed = json(alice, put("/api/v1/formulas/" + id), "{\"name\":\"Ruined\",\"ingredients\":[" + line(water, "A", "50", false) + "," + line(bobsOwn, "A", "50", false) + "]}");
        assertThat(code(failed)).isEqualTo(400);

        MvcResult after = run(alice, get("/api/v1/formulas/" + id));
        assertThat((String) read(after, "$.name")).isEqualTo("Day Cream");
        assertThat(this.<List<String>>read(after, "$.formulation_phases[*].formulation_ingredients[*].ingredients.inci_name")).containsExactlyInAnyOrder("Aqua", "Glycerin", "Butyrospermum Parkii Butter");
    }

    @Test
    void youCannotSaveOverSomeoneElsesFormula() throws Exception {
        String id = create(alice, lotion());
        assertThat(code(json(bob, put("/api/v1/formulas/" + id), body("", line(water, "A", "100", false))))).isEqualTo(404);
        assertThat((String) read(run(alice, get("/api/v1/formulas/" + id)), "$.name")).isEqualTo("Day Cream");
        assertThat(code(json(alice, put("/api/v1/formulas/" + UUID.randomUUID()), lotion()))).isEqualTo(404);
    }

    // ---- copies

    @Test
    void aCopyRemembersWhatItCameFrom() throws Exception {
        UUID post = UUID.randomUUID();
        jdbc.update("insert into community_posts (id, author_id, title) values (?, ?, 'Recipe')", post, bob);
        String original = create(alice, lotion());

        MvcResult copy = json(alice, post("/api/v1/formulas"), body("\"cloned_from_formulation_id\":\"" + original + "\",\"remixed_from_post_id\":\"" + post + "\"", line(water, "A", "100", false)));
        assertThat((String) read(copy, "$.cloned_from_formulation_id")).isEqualTo(original);
        assertThat((String) read(copy, "$.remixed_from_post_id")).isEqualTo(post.toString());

        // Deleting the original only clears the link
        run(alice, delete("/api/v1/formulas/" + original));
        assertThat(this.<Object>read(run(alice, get("/api/v1/formulas/" + read(copy, "$.id"))), "$.cloned_from_formulation_id")).isNull();
    }

    @Test
    void youCanOnlyCopyYourOwnFormulas_andAPostThatIsGoneJustLosesItsLink() throws Exception {
        String bobs = create(bob, lotion());
        assertThat(code(json(alice, post("/api/v1/formulas"), body("\"cloned_from_formulation_id\":\"" + bobs + "\"", line(water, "A", "100", false))))).isEqualTo(400);

        MvcResult gone = json(alice, post("/api/v1/formulas"), body("\"remixed_from_post_id\":\"" + UUID.randomUUID() + "\"", line(water, "A", "100", false)));
        assertThat(code(gone)).isEqualTo(201);
        assertThat(this.<Object>read(gone, "$.remixed_from_post_id")).isNull();
    }

    @Test
    void copyingAnotherMembersRecipeLeavesOutTheirPrivateIngredients_insteadOfFailing() throws Exception {
        MvcResult r = json(alice, post("/api/v1/formulas?copy=true"), body("", line(water, "A", "60", false), line(bobsOwn, "A", "40", false)));
        assertThat(code(r)).isEqualTo(201);
        assertThat(this.<List<String>>read(r, "$.formulation_phases[*].formulation_ingredients[*].ingredients.inci_name")).containsExactly("Aqua");
    }

    // ---- sharing

    @Test
    void aFormulaCanOnlyBeLinkedToAPostYouWrote() throws Exception {
        String id = create(alice, lotion());
        UUID mine = UUID.randomUUID();
        UUID others = UUID.randomUUID();
        jdbc.update("insert into community_posts (id, author_id, title) values (?, ?, 'Mine')", mine, alice);
        jdbc.update("insert into community_posts (id, author_id, title) values (?, ?, 'Theirs')", others, bob);

        assertThat(code(json(alice, put("/api/v1/formulas/" + id + "/post"), "{\"community_post_id\":\"" + others + "\"}"))).isEqualTo(400);
        assertThat(code(json(bob, put("/api/v1/formulas/" + id + "/post"), "{\"community_post_id\":\"" + others + "\"}"))).isEqualTo(404);
        assertThat(code(json(alice, put("/api/v1/formulas/" + id + "/post"), "{\"community_post_id\":\"" + mine + "\"}"))).isEqualTo(204);
        assertThat((String) read(run(alice, get("/api/v1/formulas/" + id)), "$.community_post_id")).isEqualTo(mine.toString());
    }

    // ---- deleting

    @Test
    void deletingAFormulaRemovesItsPhasesIngredientsAndVersions_butNeverAnotherPersonsFormula() throws Exception {
        String id = create(alice, lotion());
        json(alice, post("/api/v1/formulas/" + id + "/versions"), "{\"name\":\"Day Cream\",\"lines\":[]}");

        assertThat(code(run(bob, delete("/api/v1/formulas/" + id)))).isEqualTo(404);
        assertThat(count("select count(*) from formulations")).isEqualTo(1);

        assertThat(code(run(alice, delete("/api/v1/formulas/" + id)))).isEqualTo(204);
        assertThat(count("select count(*) from formulations")).isZero();
        assertThat(count("select count(*) from formulation_phases")).isZero();
        assertThat(count("select count(*) from formulation_ingredients")).isZero();
        assertThat(count("select count(*) from formulation_versions")).isZero();
        assertThat(count("select count(*) from ingredients where user_id is null")).isEqualTo(3);
        assertThat(code(run(alice, delete("/api/v1/formulas/" + id)))).isEqualTo(404);
    }

    // ---- version history

    private String version(String note, String extraLine) {
        return "{\"note\":" + (note == null ? "null" : "\"" + note + "\"") + ",\"name\":\"Day Cream\",\"profile_id\":\"ow_lotion\",\"target_weight_g\":200,\"target_ph\":5.5,\"lines\":["
                + "{\"ingredient_id\":\"" + water + "\",\"inci_name\":\"Aqua\",\"trade_name\":\"Distilled Water\",\"phase\":\"A\",\"percentage\":80,\"is_qs\":true}"
                + extraLine + "]}";
    }

    @Test
    void keepsNumberedVersionsWithTheirNotes_newestFirst_andTheLinesComeBackAsAList() throws Exception {
        String id = create(alice, lotion());

        MvcResult first = json(alice, post("/api/v1/formulas/" + id + "/versions"), version("  First draft  ", ""));
        assertThat(code(first)).isEqualTo(201);
        assertThat(((Number) read(first, "$.version_number")).intValue()).isEqualTo(1);
        assertThat((String) read(first, "$.note")).isEqualTo("First draft");
        assertThat(this.<List<String>>read(first, "$.lines[*].inci_name")).containsExactly("Aqua");
        assertThat(((Number) read(first, "$.lines[0].percentage")).intValue()).isEqualTo(80);
        assertThat((Boolean) read(first, "$.lines[0].is_qs")).isTrue();

        json(alice, post("/api/v1/formulas/" + id + "/versions"), version(null, ",{\"ingredient_id\":\"" + glycerin + "\",\"inci_name\":\"Glycerin\",\"trade_name\":\"G\",\"phase\":\"A\",\"percentage\":5,\"is_qs\":false}"));

        MvcResult list = run(alice, get("/api/v1/formulas/" + id + "/versions"));
        assertThat(this.<List<Integer>>read(list, "$[*].version_number")).containsExactly(2, 1);
        assertThat(this.<Object>read(list, "$[0].note")).isNull();
        assertThat(this.<List<?>>read(list, "$[0].lines")).hasSize(2);
        assertThat(((Number) read(list, "$[0].target_ph")).doubleValue()).isEqualTo(5.5);
    }

    @Test
    void versionsBelongToTheOwnerOfTheFormula() throws Exception {
        String id = create(alice, lotion());
        String versionId = read(json(alice, post("/api/v1/formulas/" + id + "/versions"), version("mine", "")), "$.id");

        assertThat(code(run(bob, get("/api/v1/formulas/" + id + "/versions")))).isEqualTo(404);
        assertThat(code(json(bob, post("/api/v1/formulas/" + id + "/versions"), version("sneaky", "")))).isEqualTo(404);
        assertThat(code(run(bob, delete("/api/v1/formulas/" + id + "/versions/" + versionId)))).isEqualTo(404);
        assertThat(count("select count(*) from formulation_versions")).isEqualTo(1);

        assertThat(code(run(alice, delete("/api/v1/formulas/" + id + "/versions/" + versionId)))).isEqualTo(204);
        assertThat(code(run(alice, delete("/api/v1/formulas/" + id + "/versions/" + versionId)))).isEqualTo(404);
    }

    @Test
    void refusesAVersionWithBadLines() throws Exception {
        String id = create(alice, lotion());
        assertThat(code(json(alice, post("/api/v1/formulas/" + id + "/versions"), "{\"name\":\"x\"}"))).isEqualTo(400);
        assertThat(code(json(alice, post("/api/v1/formulas/" + id + "/versions"), "{\"name\":\"x\",\"lines\":[{\"ingredient_id\":\"" + water + "\",\"phase\":\"A\",\"percentage\":500}]}"))).isEqualTo(400);
        assertThat(code(json(alice, post("/api/v1/formulas/" + id + "/versions"), "{\"name\":\"\",\"lines\":[]}"))).isEqualTo(400);
        assertThat(count("select count(*) from formulation_versions")).isZero();
    }

    @Test
    void deletingTheAccountRemovesItsFormulasAndVersions() throws Exception {
        String id = create(alice, lotion());
        json(alice, post("/api/v1/formulas/" + id + "/versions"), version("kept", ""));
        run(alice, delete("/api/v1/auth/me"));
        assertThat(count("select count(*) from formulations")).isZero();
        assertThat(count("select count(*) from formulation_versions")).isZero();
    }

    @Test
    void percentagesKeepTheirDecimals() throws Exception {
        String id = create(alice, body("", line(water, "A", "75.7", true), line(glycerin, "A", "0.3", false)));
        List<Number> amounts = read(run(alice, get("/api/v1/formulas/" + id)), "$.formulation_phases[0].formulation_ingredients[*].percentage");
        assertThat(amounts.stream().map(n -> new BigDecimal(n.toString())).toList()).usingElementComparator(BigDecimal::compareTo).containsExactly(new BigDecimal("75.7"), new BigDecimal("0.3"));
    }
}
