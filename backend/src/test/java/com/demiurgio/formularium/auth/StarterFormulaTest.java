package com.demiurgio.formularium.auth;

import com.demiurgio.formularium.starter.StarterFormulas;
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

@SpringBootTest
@AutoConfigureMockMvc
class StarterFormulaTest {

    /** What the fake "Google" says about each token. */
    static final Map<String, Jwt> GOOGLE = new java.util.concurrent.ConcurrentHashMap<>();

    @TestConfiguration
    static class Config {
        @Bean @Primary GoogleTokenVerifier fakeGoogleForStarters() {
            return new GoogleTokenVerifier(token -> {
                Jwt jwt = GOOGLE.get(token);
                if (jwt == null) throw new BadJwtException("not a Google token");
                return jwt;
            });
        }
    }

    @Autowired private MockMvc mvc;
    @Autowired private JdbcTemplate jdbc;

    @BeforeEach
    void seed() {
        for (String table : List.of("formulations", "user_stash", "user_containers", "favorite_ingredients", "user_starred_ingredients", "ingredients", "refresh_tokens", "app_users")) {
            jdbc.update("delete from " + table);
        }
        GOOGLE.clear();
        // Every ingredient the starter formulas use is in the shared library
        StarterFormulas.ALL.stream().flatMap(f -> f.phases().stream()).flatMap(p -> p.lines().stream()).map(StarterFormulas.Line::inciName).distinct()
                .forEach(inci -> jdbc.update("insert into ingredients (id, inci_name, trade_name) values (?, ?, ?)", UUID.randomUUID(), inci, inci));
    }

    private static final String PASSWORD = "correct horse battery";

    private MvcResult register(String email) throws Exception {
        return mvc.perform(post("/api/v1/auth/register").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"" + email + "\",\"password\":\"" + PASSWORD + "\",\"username\":\"" + email.substring(0, email.indexOf('@')) + "\"}")).andReturn();
    }

    private static String id(MvcResult result) throws Exception {
        return JsonPath.read(result.getResponse().getContentAsString(), "$.user.id");
    }

    private List<Map<String, Object>> formulasOf(String userId) {
        return jdbc.queryForList("select id, name, profile_id, target_weight_g, target_ph, status from formulations where user_id = ? order by name", UUID.fromString(userId));
    }

    private BigDecimal totalOf(Object formulaId) {
        return jdbc.queryForObject("""
                select coalesce(sum(i.percentage), 0) from formulation_ingredients i join formulation_phases p on p.id = i.phase_id where p.formulation_id = ?""", BigDecimal.class, formulaId);
    }

    // ---- the recipes themselves

    @Test
    void everyStarterFormulaAddsUpTo100Percent_withOneRestIngredientWhereThereIsWater() {
        for (StarterFormulas.Formula formula : StarterFormulas.ALL) {
            BigDecimal total = formula.phases().stream().flatMap(p -> p.lines().stream()).map(StarterFormulas.Line::amount).reduce(BigDecimal.ZERO, BigDecimal::add);
            assertThat(total).as(formula.name()).isEqualByComparingTo("100");
            long rest = formula.phases().stream().flatMap(p -> p.lines().stream()).filter(StarterFormulas.Line::qs).count();
            boolean hasWater = formula.phases().stream().flatMap(p -> p.lines().stream()).anyMatch(l -> l.inciName().equals("Aqua"));
            assertThat(rest).as(formula.name() + " rest ingredient").isEqualTo(hasWater ? 1 : 0);
            List<String> letters = formula.phases().stream().map(StarterFormulas.Phase::letter).toList();
            assertThat(letters).as(formula.name() + " phases").doesNotHaveDuplicates();
        }
        assertThat(StarterFormulas.ALL.stream().map(StarterFormulas.Formula::name).collect(Collectors.toSet())).hasSize(3).allMatch(n -> n.startsWith("Starter: "));
    }

    // ---- a new account gets them

    @Test
    void aNewPasswordAccountStartsWithThreeDraftFormulas() throws Exception {
        MvcResult result = register("sam@example.com");
        assertThat(result.getResponse().getStatus()).isEqualTo(201);

        List<Map<String, Object>> formulas = formulasOf(id(result));
        assertThat(formulas).extracting(f -> f.get("name")).containsExactly("Starter: Gentle Daily Face Wash", "Starter: Hydrating Gel Cream", "Starter: Whipped Body Butter");
        assertThat(formulas).extracting(f -> f.get("profile_id")).containsExactly("body_wash", "ow_lotion", "body_butter");
        assertThat(formulas).extracting(f -> f.get("status")).containsOnly("Draft");
        assertThat(formulas).allSatisfy(f -> assertThat((BigDecimal) f.get("target_weight_g")).isEqualByComparingTo("100"));
        assertThat((BigDecimal) formulas.get(1).get("target_ph")).isEqualByComparingTo("5.5");
        assertThat(formulas.get(2).get("target_ph")).isNull();   // the anhydrous body butter has no pH
        for (Map<String, Object> f : formulas) assertThat(totalOf(f.get("id"))).as(String.valueOf(f.get("name"))).isEqualByComparingTo("100");
    }

    @Test
    void theLinesAreOnTheRightPhasesAndOnlyWaterIsTheRest() throws Exception {
        String user = id(register("lines@example.com"));
        List<Map<String, Object>> lines = jdbc.queryForList("""
                select f.name as formula, p.phase_letter, g.inci_name, i.percentage, i.is_qs
                  from formulations f join formulation_phases p on p.formulation_id = f.id join formulation_ingredients i on i.phase_id = p.id join ingredients g on g.id = i.ingredient_id
                 where f.user_id = ? and f.name = 'Starter: Hydrating Gel Cream' order by p.phase_letter, g.inci_name""", UUID.fromString(user));
        assertThat(lines).extracting(l -> l.get("phase_letter") + ":" + l.get("inci_name")).containsExactly(
                "A:Aqua", "A:Glycerin", "A:Xanthan Gum", "B:Caprylic/Capric Triglyceride", "B:Cetearyl Alcohol (and) Ceteareth-20", "C:Phenoxyethanol (and) Ethylhexylglycerin");
        assertThat(lines.stream().filter(l -> Boolean.TRUE.equals(l.get("is_qs"))).map(l -> l.get("inci_name"))).containsExactly("Aqua");
    }

    @Test
    void anIngredientMissingFromTheLibraryLeavesThatLineOut_butTheAccountAndFormulaAreStillCreated() throws Exception {
        jdbc.update("delete from ingredients where inci_name = 'Decyl Glucoside'");
        MvcResult result = register("gap@example.com");
        assertThat(result.getResponse().getStatus()).isEqualTo(201);

        Object washId = formulasOf(id(result)).stream().filter(f -> "Starter: Gentle Daily Face Wash".equals(f.get("name"))).findFirst().orElseThrow().get("id");
        assertThat(totalOf(washId)).isEqualByComparingTo("85");   // 100 without the 15% surfactant that was not found
        assertThat(jdbc.queryForObject("select count(*) from formulation_phases where formulation_id = ?", Long.class, washId)).isEqualTo(3);
    }

    @Test
    void aGoogleAccountGetsThemOnTheFirstSignInOnly() throws Exception {
        GOOGLE.put("g", Jwt.withTokenValue("t").header("alg", "RS256").subject("sub-1").claim("email", "gina@example.com").claim("email_verified", true).claim("name", "Gina")
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(600)).build());
        MvcResult first = mvc.perform(post("/api/v1/auth/google").contentType(MediaType.APPLICATION_JSON).content("{\"idToken\":\"g\"}")).andReturn();
        assertThat(formulasOf(id(first))).hasSize(3);

        mvc.perform(post("/api/v1/auth/google").contentType(MediaType.APPLICATION_JSON).content("{\"idToken\":\"g\"}"));
        assertThat(formulasOf(id(first))).as("signing in again adds nothing").hasSize(3);
    }

    @Test
    void signingInAgainWithAPasswordAddsNothing_andEveryoneGetsTheirOwnCopies() throws Exception {
        String a = id(register("anna@example.com"));
        String b = id(register("bobby@example.com"));
        mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"anna@example.com\",\"password\":\"" + PASSWORD + "\"}"));

        assertThat(formulasOf(a)).hasSize(3);
        assertThat(formulasOf(b)).hasSize(3);
        assertThat(jdbc.queryForObject("select count(distinct id) from formulations", Long.class)).isEqualTo(6);
    }

    // ---- all or nothing

    @Test
    void ifTheStarterFormulasCannotBeWritten_noAccountIsCreated() {
        jdbc.update("delete from formulations");
        jdbc.update("delete from formulation_profiles where id = 'body_butter'");   // the first starter formula now points at a product type that does not exist
        try {
            assertThatThrownBy(() -> register("rollback@example.com")).hasStackTraceContaining("formulations_profile_id_fkey");   // the database refused the first starter formula
            assertThat(jdbc.queryForObject("select count(*) from app_users", Long.class)).isZero();
            assertThat(jdbc.queryForObject("select count(*) from formulations", Long.class)).isZero();
        } finally {
            jdbc.update("insert into formulation_profiles (id, name, category, requires_oil, max_oil_phase_percent) values ('body_butter', 'Body Butter', 'Anhydrous', true, 100) on conflict (id) do nothing");
        }
    }

    @Test
    void deletingTheAccountDeletesItsStarterFormulasToo() throws Exception {
        MvcResult result = register("bye@example.com");
        String token = JsonPath.read(result.getResponse().getContentAsString(), "$.accessToken");
        assertThat(jdbc.queryForObject("select count(*) from formulation_ingredients", Long.class)).isGreaterThan(0);

        mvc.perform(delete("/api/v1/auth/me").header("Authorization", "Bearer " + token));

        assertThat(jdbc.queryForObject("select count(*) from formulations", Long.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from formulation_phases", Long.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from formulation_ingredients", Long.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from ingredients", Long.class)).isGreaterThan(0);   // the shared library stays
    }
}
