package com.demiurgio.formularium.library;

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
class LibraryApiTest {
    @Autowired private MockMvc mvc;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private JwtEncoder encoder;

    private UUID alice;
    private UUID bob;
    private UUID water;      // shared
    private UUID glycerin;   // shared
    private UUID olive;      // shared
    private UUID alicesOwn;  // Alice's custom ingredient

    @BeforeEach
    void seed() {
        for (String table : List.of("user_stash", "user_containers", "favorite_ingredients", "user_starred_ingredients", "ingredients", "refresh_tokens", "app_users")) {
            jdbc.update("delete from " + table);
        }
        alice = user("alice");
        bob = user("bob");
        water = ingredient(null, "Aqua", "Distilled Water", "Solvent");
        glycerin = ingredient(null, "Glycerin", "Vegetable Glycerin 99.5%", "Humectant");
        olive = ingredient(null, "Olea Europaea (Olive) Fruit Oil", "Olive Oil", "Carrier Oil");
        alicesOwn = ingredient(alice, "Alice Secret Extract", "Alice's Extract", "Active");
    }

    // ---- helpers

    private UUID user(String name) {
        UUID id = UUID.randomUUID();
        jdbc.update("insert into app_users (id, email, username) values (?, ?, ?)", id, name + "@example.com", name);
        return id;
    }

    private UUID ingredient(UUID owner, String inci, String trade, String function) {
        UUID id = UUID.randomUUID();
        jdbc.update("insert into ingredients (id, user_id, inci_name, trade_name, function, solubility, max_usage_pct, is_vegan) values (?, ?, ?, ?, ?, 'water', 5.5, true)", id, owner, inci, trade, function);
        return id;
    }

    private String token(UUID user) {
        Instant now = Instant.now();
        JwtClaimsSet claims = JwtClaimsSet.builder().issuer("formularium-test").subject(user.toString()).issuedAt(now).expiresAt(now.plusSeconds(600)).build();
        return encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims)).getTokenValue();
    }

    private MockHttpServletRequestBuilder as(UUID user, MockHttpServletRequestBuilder request) {
        return request.header("Authorization", "Bearer " + token(user));
    }

    private MvcResult run(UUID user, MockHttpServletRequestBuilder request) throws Exception {
        return mvc.perform(as(user, request)).andReturn();
    }

    private MvcResult json(UUID user, MockHttpServletRequestBuilder request, String body) throws Exception {
        return run(user, request.contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private <T> T read(MvcResult result, String path) throws Exception {
        return JsonPath.read(result.getResponse().getContentAsString(), path);
    }

    private static int code(MvcResult result) { return result.getResponse().getStatus(); }

    private List<String> names(MvcResult result) throws Exception {
        return JsonPath.read(result.getResponse().getContentAsString(), "$[*].trade_name");
    }

    // ---- the library

    @Test
    void everythingNeedsSignIn() throws Exception {
        for (MockHttpServletRequestBuilder request : List.of(get("/api/v1/ingredients"), get("/api/v1/ingredients/starred"), get("/api/v1/ingredients/favorites"),
                get("/api/v1/stash"), get("/api/v1/containers"), delete("/api/v1/stash/" + UUID.randomUUID()), put("/api/v1/ingredients/" + water + "/star"))) {
            mvc.perform(request).andExpect(status().isUnauthorized());
        }
        mvc.perform(post("/api/v1/ingredients/search").contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isUnauthorized());
    }

    @Test
    void theLibraryShowsSharedIngredientsAndYourOwn_andNeverSomeoneElses() throws Exception {
        MvcResult aliceSees = run(alice, get("/api/v1/ingredients"));
        assertThat(names(aliceSees)).containsExactly("Alice's Extract", "Distilled Water", "Olive Oil", "Vegetable Glycerin 99.5%");   // sorted by trade name

        assertThat(names(run(bob, get("/api/v1/ingredients")))).containsExactly("Distilled Water", "Olive Oil", "Vegetable Glycerin 99.5%");
    }

    @Test
    void ingredientsComeOutAsPlainJson() throws Exception {
        MvcResult result = run(alice, get("/api/v1/ingredients"));
        String body = result.getResponse().getContentAsString();
        assertThat(this.<List<String>>read(result, "$[?(@.inci_name=='Aqua')].solubility")).containsExactly("water");
        assertThat(this.<List<Number>>read(result, "$[?(@.inci_name=='Aqua')].max_usage_pct").get(0).doubleValue()).isEqualTo(5.5);
        assertThat(this.<List<Boolean>>read(result, "$[?(@.inci_name=='Aqua')].is_vegan")).containsExactly(true);
        assertThat(body).doesNotContain("\"type\":").doesNotContain("PGobject");
    }

    @Test
    void searchesBySeveralFiltersAtOnce_ignoringCase() throws Exception {
        MvcResult result = json(bob, post("/api/v1/ingredients/search"), """
                {"anyOf":[{"column":"trade_name","op":"ilike","value":"%GLYCER%"},{"column":"function","op":"ilike","value":"carrier%"}],"orderBy":"trade_name"}""");
        assertThat(code(result)).isEqualTo(200);
        assertThat(names(result)).containsExactly("Olive Oil", "Vegetable Glycerin 99.5%");

        MvcResult exact = json(bob, post("/api/v1/ingredients/search"), """
                {"anyOf":[{"column":"inci_name","op":"eq","value":"Aqua"}],"limit":1}""");
        assertThat(names(exact)).containsExactly("Distilled Water");
        assertThat(names(json(bob, post("/api/v1/ingredients/search"), """
                {"anyOf":[{"column":"inci_name","op":"eq","value":"aqua"}]}"""))).isEmpty();   // eq is exact
    }

    @Test
    void searchNeverReturnsSomeoneElsesIngredients() throws Exception {
        String body = "{\"anyOf\":[{\"column\":\"trade_name\",\"op\":\"ilike\",\"value\":\"%extract%\"}]}";
        assertThat(names(json(alice, post("/api/v1/ingredients/search"), body))).containsExactly("Alice's Extract");
        assertThat(names(json(bob, post("/api/v1/ingredients/search"), body))).isEmpty();
        assertThat(names(json(bob, post("/api/v1/ingredients/search"), "{\"ids\":[\"" + alicesOwn + "\"]}"))).isEmpty();
    }

    @Test
    void searchCanBeNarrowedToSomeIdsAndCappedByALimit() throws Exception {
        String ids = "[\"" + water + "\",\"" + glycerin + "\"]";
        assertThat(names(json(alice, post("/api/v1/ingredients/search"), "{\"ids\":" + ids + ",\"orderBy\":\"trade_name\"}"))).containsExactly("Distilled Water", "Vegetable Glycerin 99.5%");
        assertThat(names(json(alice, post("/api/v1/ingredients/search"), "{\"anyOf\":[{\"column\":\"function\",\"op\":\"ilike\",\"value\":\"%\"}],\"ids\":" + ids + ",\"limit\":1}"))).hasSize(1);
        assertThat(names(json(alice, post("/api/v1/ingredients/search"), "{\"anyOf\":[{\"column\":\"function\",\"op\":\"ilike\",\"value\":\"%\"}],\"ids\":[\"" + olive + "\"]}"))).containsExactly("Olive Oil");
        assertThat(json(alice, post("/api/v1/ingredients/search"), "{}").getResponse().getContentAsString()).isEqualTo("[]");   // no question, no answer
    }

    @Test
    void searchRefusesColumnsAndOperatorsOutsideTheAllowedList_andTreatsTextAsText() throws Exception {
        assertThat(code(json(alice, post("/api/v1/ingredients/search"), "{\"anyOf\":[{\"column\":\"user_id\",\"op\":\"eq\",\"value\":\"x\"}]}"))).isEqualTo(400);
        assertThat(code(json(alice, post("/api/v1/ingredients/search"), "{\"anyOf\":[{\"column\":\"trade_name\",\"op\":\"like\",\"value\":\"x\"}]}"))).isEqualTo(400);
        assertThat(code(json(alice, post("/api/v1/ingredients/search"), "{\"anyOf\":[{\"column\":\"trade_name; drop table ingredients\",\"op\":\"eq\",\"value\":\"x\"}]}"))).isEqualTo(400);
        assertThat(code(json(alice, post("/api/v1/ingredients/search"), "{\"limit\":100000,\"ids\":[]}"))).isEqualTo(400);

        MvcResult attack = json(alice, post("/api/v1/ingredients/search"), "{\"anyOf\":[{\"column\":\"trade_name\",\"op\":\"eq\",\"value\":\"x'; drop table ingredients; --\"}]}");
        assertThat(code(attack)).isEqualTo(200);
        assertThat(jdbc.queryForObject("select count(*) from ingredients", Long.class)).isEqualTo(4);
    }

    @Test
    void fetchesSomeIngredientsByTheirIds_skippingThoseYouCannotSee() throws Exception {
        MvcResult result = json(bob, post("/api/v1/ingredients/by-ids"), "{\"ids\":[\"" + water + "\",\"" + alicesOwn + "\",\"" + UUID.randomUUID() + "\"]}");
        assertThat(names(result)).containsExactly("Distilled Water");
        assertThat(code(json(bob, post("/api/v1/ingredients/by-ids"), "{}"))).isEqualTo(400);
    }

    @Test
    void addsACustomIngredientThatBelongsToTheCaller() throws Exception {
        MvcResult created = json(bob, post("/api/v1/ingredients"), """
                {"trade_name":"Bob's Butter","inci_name":"Bobus Butyrum","function":"Butter","solubility":"Oil","default_min_usage":1,"default_max_usage":10,
                 "notes":"Mine","is_vegan":true,"user_id":"%s"}""".formatted(alice));
        assertThat(code(created)).isEqualTo(201);
        assertThat((String) read(created, "$.user_id")).isEqualTo(bob.toString());   // taken from the sign-in, never from the request
        assertThat((String) read(created, "$.solubility")).isEqualTo("oil");
        assertThat((Boolean) read(created, "$.is_vegan")).isTrue();

        assertThat(names(run(bob, get("/api/v1/ingredients")))).contains("Bob's Butter");
        assertThat(names(run(alice, get("/api/v1/ingredients")))).doesNotContain("Bob's Butter");
    }

    @Test
    void refusesACustomIngredientThatIsInvalidOrAlreadyInTheLibrary() throws Exception {
        String base = "\"trade_name\":\"X\",\"inci_name\":\"Xus\"";
        assertThat(code(json(bob, post("/api/v1/ingredients"), "{" + base + ",\"solubility\":\"gas\"}"))).isEqualTo(400);
        assertThat(code(json(bob, post("/api/v1/ingredients"), "{" + base + ",\"default_max_usage\":150}"))).isEqualTo(400);
        assertThat(code(json(bob, post("/api/v1/ingredients"), "{\"trade_name\":\"\",\"inci_name\":\"Xus\"}"))).isEqualTo(400);
        assertThat(code(json(bob, post("/api/v1/ingredients"), "{\"trade_name\":\"Another Water\",\"inci_name\":\"Aqua\"}"))).isEqualTo(409);
    }

    // ---- starred and favourite ingredients

    @Test
    void starsAreYourOwn_andStarringTwiceIsFine() throws Exception {
        assertThat(code(run(alice, put("/api/v1/ingredients/" + water + "/star")))).isEqualTo(204);
        assertThat(code(run(alice, put("/api/v1/ingredients/" + water + "/star")))).isEqualTo(204);
        assertThat(code(run(alice, put("/api/v1/ingredients/" + glycerin + "/star")))).isEqualTo(204);

        List<String> starred = JsonPath.read(run(alice, get("/api/v1/ingredients/starred")).getResponse().getContentAsString(), "$");
        assertThat(starred).containsExactlyInAnyOrder(water.toString(), glycerin.toString());
        assertThat(run(bob, get("/api/v1/ingredients/starred")).getResponse().getContentAsString()).isEqualTo("[]");

        assertThat(code(run(alice, delete("/api/v1/ingredients/" + water + "/star")))).isEqualTo(204);
        assertThat(code(run(alice, delete("/api/v1/ingredients/" + water + "/star")))).isEqualTo(204);   // already gone: still fine
        List<String> left = JsonPath.read(run(alice, get("/api/v1/ingredients/starred")).getResponse().getContentAsString(), "$");
        assertThat(left).containsExactly(glycerin.toString());
    }

    @Test
    void cannotStarAnIngredientYouCannotSee() throws Exception {
        assertThat(code(run(bob, put("/api/v1/ingredients/" + alicesOwn + "/star")))).isEqualTo(404);
        assertThat(code(run(bob, put("/api/v1/ingredients/" + UUID.randomUUID() + "/favorite")))).isEqualTo(404);
    }

    @Test
    void favouritesComeBackAsFullIngredients() throws Exception {
        run(alice, put("/api/v1/ingredients/" + olive + "/favorite"));
        run(alice, put("/api/v1/ingredients/" + olive + "/favorite"));
        run(alice, put("/api/v1/ingredients/" + alicesOwn + "/favorite"));

        assertThat(names(run(alice, get("/api/v1/ingredients/favorites")))).containsExactly("Alice's Extract", "Olive Oil");
        assertThat(names(run(bob, get("/api/v1/ingredients/favorites")))).isEmpty();

        run(alice, delete("/api/v1/ingredients/" + olive + "/favorite"));
        assertThat(names(run(alice, get("/api/v1/ingredients/favorites")))).containsExactly("Alice's Extract");
    }

    // ---- stash

    private static String lot(UUID ingredient, String amount, String extra) {
        return "{\"ingredient_id\":\"" + ingredient + "\",\"amount_left_g\":" + amount + extra + "}";
    }

    @Test
    void keepsTrackOfWhatYouOwn_newestFirst_withTheIngredientNamed() throws Exception {
        MvcResult first = json(alice, post("/api/v1/stash"), lot(water, "500", ",\"supplier_name\":\"Acme\",\"batch_lot_number\":\"L1\",\"price_per_g\":0.002,\"expiration_date\":\"2027-05-01\",\"notes\":\"n\""));
        assertThat(code(first)).isEqualTo(201);
        assertThat((String) read(first, "$.user_id")).isEqualTo(alice.toString());
        assertThat((String) read(first, "$.expiration_date")).isEqualTo("2027-05-01");
        assertThat((String) read(first, "$.ingredients.trade_name")).isEqualTo("Distilled Water");
        assertThat((String) read(first, "$.ingredients.inci_name")).isEqualTo("Aqua");
        assertThat(((Number) read(first, "$.amount_left_g")).doubleValue()).isEqualTo(500.0);

        jdbc.update("update user_stash set created_at = timestamp '2020-01-01 00:00:00'");   // the first lot is now the older one
        json(alice, post("/api/v1/stash"), lot(glycerin, "100", ""));

        MvcResult list = run(alice, get("/api/v1/stash"));
        List<String> order = JsonPath.read(list.getResponse().getContentAsString(), "$[*].ingredients.trade_name");
        assertThat(order).containsExactly("Vegetable Glycerin 99.5%", "Distilled Water");
        assertThat(((Number) JsonPath.read(list.getResponse().getContentAsString(), "$[0].price_per_g")).doubleValue()).isZero();   // no price given: 0, as before
        assertThat(run(bob, get("/api/v1/stash")).getResponse().getContentAsString()).isEqualTo("[]");
    }

    @Test
    void changesAndRemovesOnlyYourOwnLots() throws Exception {
        String id = read(json(alice, post("/api/v1/stash"), lot(water, "500", "")), "$.id");

        MvcResult changed = json(alice, put("/api/v1/stash/" + id), lot(glycerin, "250", ",\"price_per_g\":0.01"));
        assertThat(code(changed)).isEqualTo(200);
        assertThat(((Number) read(changed, "$.amount_left_g")).doubleValue()).isEqualTo(250.0);
        assertThat((String) read(changed, "$.ingredients.trade_name")).isEqualTo("Vegetable Glycerin 99.5%");

        assertThat(code(json(bob, put("/api/v1/stash/" + id), lot(water, "1", "")))).isEqualTo(404);
        assertThat(code(run(bob, delete("/api/v1/stash/" + id)))).isEqualTo(404);
        assertThat(jdbc.queryForObject("select count(*) from user_stash", Long.class)).isEqualTo(1);

        assertThat(code(run(alice, delete("/api/v1/stash/" + id)))).isEqualTo(204);
        assertThat(code(run(alice, delete("/api/v1/stash/" + id)))).isEqualTo(404);
    }

    @Test
    void refusesBadStashEntries() throws Exception {
        assertThat(code(json(alice, post("/api/v1/stash"), lot(water, "-5", "")))).isEqualTo(400);
        assertThat(code(json(alice, post("/api/v1/stash"), lot(water, "5", ",\"price_per_g\":-1")))).isEqualTo(400);
        assertThat(code(json(alice, post("/api/v1/stash"), lot(water, "5", ",\"expiration_date\":\"not a date\"")))).isEqualTo(400);
        assertThat(code(json(alice, post("/api/v1/stash"), "{\"amount_left_g\":5}"))).isEqualTo(400);   // no ingredient
        assertThat(code(json(alice, post("/api/v1/stash"), lot(UUID.randomUUID(), "5", "")))).isEqualTo(400);   // not in the library
        assertThat(code(json(bob, post("/api/v1/stash"), lot(alicesOwn, "5", "")))).isEqualTo(400);   // someone else's custom ingredient
        assertThat(jdbc.queryForObject("select count(*) from user_stash", Long.class)).isZero();
    }

    // ---- containers

    private static final String BOTTLE = """
            {"name":"30 ml dropper","container_type":"Bottle","material":"Glass","volume_ml":30,"quantity":12,"price_per_unit":0.8,"supplier_name":"S","image_url":"https://example.com/b.jpg","notes":"n","low_stock_threshold":5}""";

    @Test
    void keepsTrackOfYourContainers() throws Exception {
        MvcResult created = json(alice, post("/api/v1/containers"), BOTTLE);
        assertThat(code(created)).isEqualTo(201);
        assertThat((String) read(created, "$.user_id")).isEqualTo(alice.toString());
        assertThat(((Number) read(created, "$.volume_ml")).doubleValue()).isEqualTo(30.0);
        assertThat((Integer) read(created, "$.quantity")).isEqualTo(12);

        String id = read(created, "$.id");
        MvcResult changed = json(alice, put("/api/v1/containers/" + id), BOTTLE.replace("\"quantity\":12", "\"quantity\":3"));
        assertThat((Integer) read(changed, "$.quantity")).isEqualTo(3);

        assertThat(run(alice, get("/api/v1/containers")).getResponse().getContentAsString()).contains("30 ml dropper");
        assertThat(run(bob, get("/api/v1/containers")).getResponse().getContentAsString()).isEqualTo("[]");
        assertThat(code(json(bob, put("/api/v1/containers/" + id), BOTTLE))).isEqualTo(404);
        assertThat(code(run(bob, delete("/api/v1/containers/" + id)))).isEqualTo(404);
        assertThat(code(run(alice, delete("/api/v1/containers/" + id)))).isEqualTo(204);
        assertThat(run(alice, get("/api/v1/containers")).getResponse().getContentAsString()).isEqualTo("[]");
    }

    @Test
    void refusesBadContainers_includingPictureAddressesThatAreNotWebAddresses() throws Exception {
        assertThat(code(json(alice, post("/api/v1/containers"), BOTTLE.replace("https://example.com/b.jpg", "javascript:alert(1)")))).isEqualTo(400);
        assertThat(code(json(alice, post("/api/v1/containers"), BOTTLE.replace("https://example.com/b.jpg", "data:text/html;base64,AAAA")))).isEqualTo(400);
        assertThat(code(json(alice, post("/api/v1/containers"), BOTTLE.replace("\"volume_ml\":30", "\"volume_ml\":-1")))).isEqualTo(400);
        assertThat(code(json(alice, post("/api/v1/containers"), BOTTLE.replace("\"name\":\"30 ml dropper\"", "\"name\":\"\"")))).isEqualTo(400);
        assertThat(code(json(alice, post("/api/v1/containers"), BOTTLE.replace("\"quantity\":12", "\"quantity\":-2")))).isEqualTo(400);
        assertThat(jdbc.queryForObject("select count(*) from user_containers", Long.class)).isZero();
    }

    @Test
    void deletingYourAccountRemovesYourLibraryData() throws Exception {
        json(alice, post("/api/v1/containers"), BOTTLE);
        json(alice, post("/api/v1/stash"), lot(water, "5", ""));
        run(alice, put("/api/v1/ingredients/" + water + "/star"));
        run(alice, delete("/api/v1/auth/me"));

        assertThat(jdbc.queryForObject("select count(*) from user_containers", Long.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from user_stash", Long.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from user_starred_ingredients", Long.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from ingredients where user_id is not null", Long.class)).isZero();   // her custom ingredient goes too
        assertThat(jdbc.queryForObject("select count(*) from ingredients", Long.class)).isEqualTo(3);   // the shared ones stay
    }
}
