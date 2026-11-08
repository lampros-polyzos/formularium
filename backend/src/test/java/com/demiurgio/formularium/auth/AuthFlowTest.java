package com.demiurgio.formularium.auth;

import com.jayway.jsonpath.JsonPath;
import jakarta.servlet.http.Cookie;
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
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class AuthFlowTest {

    /** A clock the tests can move forward, to check expiry and the sign-in attempt window. */
    static class TestClock extends Clock {
        private volatile Instant now = Instant.now();
        void advance(Duration d) { now = now.plus(d); }
        @Override public ZoneId getZone() { return ZoneId.of("UTC"); }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return now; }
    }

    /** What the fake "Google" says about each token; tests fill it in. */
    static final Map<String, Jwt> GOOGLE = new java.util.concurrent.ConcurrentHashMap<>();

    @TestConfiguration
    static class Config {
        @Bean @Primary TestClock testClock() { return new TestClock(); }

        @Bean @Primary GoogleTokenVerifier fakeGoogle() {
            return new GoogleTokenVerifier(token -> {
                Jwt jwt = GOOGLE.get(token);
                if (jwt == null) throw new BadJwtException("not a Google token");
                return jwt;
            });
        }
    }

    @Autowired private MockMvc mvc;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private TestClock clock;
    @Autowired private JwtEncoder encoder;

    @BeforeEach
    void clean() {
        jdbc.update("delete from auth_events");
        jdbc.update("delete from refresh_tokens");
        jdbc.update("delete from app_users");
        GOOGLE.clear();
    }

    // ---- helpers

    private static String email() { return "user-" + UUID.randomUUID().toString().substring(0, 8) + "@example.com"; }

    private static String username() { return "u" + UUID.randomUUID().toString().substring(0, 8); }

    private static String json(Map<String, ?> body) {
        StringBuilder sb = new StringBuilder("{");
        body.forEach((k, v) -> sb.append(sb.length() > 1 ? "," : "").append('"').append(k).append("\":\"").append(v).append('"'));
        return sb.append('}').toString();
    }

    private MvcResult send(String path, Map<String, ?> body) throws Exception {
        return mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(json(body))).andReturn();
    }

    private MvcResult register(String email, String password) throws Exception {
        return send("/api/v1/auth/register", Map.of("email", email, "password", password, "username", username()));
    }

    private MvcResult login(String email, String password) throws Exception {
        return send("/api/v1/auth/login", Map.of("email", email, "password", password));
    }

    private MvcResult refresh(String token) throws Exception {
        return mvc.perform(post("/api/v1/auth/refresh").cookie(new Cookie(AuthController.REFRESH_COOKIE, token))).andReturn();
    }

    private static String refreshCookieOf(MvcResult result) {
        Cookie c = result.getResponse().getCookie(AuthController.REFRESH_COOKIE);
        assertThat(c).as("refresh cookie").isNotNull();
        return c.getValue();
    }

    private static String accessTokenOf(MvcResult result) throws Exception {
        return JsonPath.read(result.getResponse().getContentAsString(), "$.accessToken");
    }

    private static MockHttpServletRequestBuilder bearer(MockHttpServletRequestBuilder request, String token) {
        return request.header("Authorization", "Bearer " + token);
    }

    private static final String PASSWORD = "correct horse battery";

    // ---- sign-up

    @Test
    void registeringCreatesAnAccountAndSignsYouIn() throws Exception {
        String email = email();
        MvcResult result = register(email.toUpperCase(), PASSWORD);

        assertThat(result.getResponse().getStatus()).isEqualTo(201);
        String body = result.getResponse().getContentAsString();
        assertThat((String) JsonPath.read(body, "$.user.email")).isEqualTo(email);   // stored in lower case
        assertThat((Integer) JsonPath.read(body, "$.expiresInSeconds")).isEqualTo(900);
        assertThat(body).doesNotContain("password").doesNotContain("$2");

        assertThat(jdbc.queryForObject("select password_hash from app_users where email = ?", String.class, email)).startsWith("$2").doesNotContain(PASSWORD);
        assertThat(result.getResponse().getHeader("Cache-Control")).isEqualTo("no-store");
    }

    @Test
    void theRefreshTokenOnlyTravelsInAnHttpOnlyCookieForTheAuthEndpoints() throws Exception {
        String setCookie = register(email(), PASSWORD).getResponse().getHeader("Set-Cookie");
        assertThat(setCookie).contains("refresh_token=").contains("HttpOnly").contains("SameSite=Lax").contains("Path=/api/v1/auth").contains("Max-Age=2592000");
    }

    @Test
    void theRefreshTokenIsStoredOnlyAsAHash() throws Exception {
        String token = refreshCookieOf(register(email(), PASSWORD));
        assertThat(jdbc.queryForList("select token_hash from refresh_tokens", String.class)).containsExactly(TokenService.hash(token)).doesNotContain(token);
    }

    @Test
    void refusesWeakOrMalformedSignUps() throws Exception {
        for (Map<String, String> bad : new Map[]{
                Map.of("email", email(), "password", "short", "username", username()),
                Map.of("email", "not-an-email", "password", PASSWORD, "username", username()),
                Map.of("email", email(), "password", PASSWORD, "username", "ab"),
                Map.of("email", email(), "password", PASSWORD, "username", "has space"),
                Map.of("email", email(), "password", "x".repeat(73), "username", username())}) {
            MvcResult r = send("/api/v1/auth/register", bad);
            assertThat(r.getResponse().getStatus()).as(bad.toString()).isEqualTo(400);
            assertThat((String) JsonPath.read(r.getResponse().getContentAsString(), "$.error.code")).isEqualTo("invalid_request");
        }
        assertThat(jdbc.queryForObject("select count(*) from app_users", Long.class)).isZero();
    }

    @Test
    void anEmailOrUsernameCanOnlyBeUsedOnce_IgnoringCase() throws Exception {
        String email = email();
        assertThat(register(email, PASSWORD).getResponse().getStatus()).isEqualTo(201);
        assertThat(register(email.toUpperCase(), PASSWORD).getResponse().getStatus()).isEqualTo(409);

        send("/api/v1/auth/register", Map.of("email", email(), "password", PASSWORD, "username", "Lampros"));
        MvcResult sameName = send("/api/v1/auth/register", Map.of("email", email(), "password", PASSWORD, "username", "lampros"));
        assertThat(sameName.getResponse().getStatus()).isEqualTo(409);
        assertThat((String) JsonPath.read(sameName.getResponse().getContentAsString(), "$.error.code")).isEqualTo("account_exists");
    }

    // ---- sign-in

    @Test
    void signsInWithTheRightPasswordAndGivesTheSameAnswerForAWrongPasswordAndAnUnknownEmail() throws Exception {
        String email = email();
        register(email, PASSWORD);

        assertThat(login(email, PASSWORD).getResponse().getStatus()).isEqualTo(200);

        MvcResult wrong = login(email, "not the password");
        MvcResult unknown = login(email(), "not the password");
        assertThat(wrong.getResponse().getStatus()).isEqualTo(401);
        assertThat(wrong.getResponse().getContentAsString()).isEqualTo(unknown.getResponse().getContentAsString());   // no hint which one was wrong
    }

    @Test
    void stopsPasswordGuessingAfterFiveFailures_EvenForTheRightPassword_untilTheWindowPasses() throws Exception {
        String email = email();
        register(email, PASSWORD);
        for (int i = 0; i < LoginAttemptLimiter.MAX_FAILURES; i++) assertThat(login(email, "wrong " + i).getResponse().getStatus()).isEqualTo(401);

        MvcResult blocked = login(email, PASSWORD);
        assertThat(blocked.getResponse().getStatus()).isEqualTo(429);
        assertThat((String) JsonPath.read(blocked.getResponse().getContentAsString(), "$.error.code")).isEqualTo("too_many_attempts");

        clock.advance(LoginAttemptLimiter.WINDOW.plusSeconds(1));
        assertThat(login(email, PASSWORD).getResponse().getStatus()).isEqualTo(200);
    }

    @Test
    void aGoogleOnlyAccountCannotSignInWithAPassword() throws Exception {
        String email = email();
        GOOGLE.put("g1", googleToken("sub-1", email, true, "Gina Google"));
        assertThat(send("/api/v1/auth/google", Map.of("idToken", "g1")).getResponse().getStatus()).isEqualTo(200);
        assertThat(login(email, "").getResponse().getStatus()).isEqualTo(400);
        assertThat(login(email, "anything at all").getResponse().getStatus()).isEqualTo(401);
    }

    // ---- access tokens

    @Test
    void protectedEndpointsNeedAValidAccessToken() throws Exception {
        String email = email();
        String token = accessTokenOf(register(email, PASSWORD));

        mvc.perform(get("/api/v1/auth/me")).andExpect(status().isUnauthorized());
        mvc.perform(bearer(get("/api/v1/auth/me"), token + "x")).andExpect(status().isUnauthorized());
        mvc.perform(bearer(get("/api/v1/auth/me"), token)).andExpect(status().isOk()).andExpect(jsonPath("$.email").value(email));
    }

    @Test
    void rejectsAnExpiredToken_andOneSignedWithAnotherKey() throws Exception {
        MvcResult registered = register(email(), PASSWORD);
        String id = JsonPath.read(registered.getResponse().getContentAsString(), "$.user.id");

        Instant past = Instant.now().minus(Duration.ofHours(2));
        JwtClaimsSet expired = JwtClaimsSet.builder().issuer("formularium-test").subject(id).issuedAt(past).expiresAt(past.plusSeconds(60)).build();
        String expiredToken = encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), expired)).getTokenValue();
        mvc.perform(bearer(get("/api/v1/auth/me"), expiredToken)).andExpect(status().isUnauthorized());

        // An unsigned token naming the same user must not work either
        String unsigned = java.util.Base64.getUrlEncoder().withoutPadding().encodeToString("{\"alg\":\"none\"}".getBytes())
                + "." + java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(("{\"sub\":\"" + id + "\"}").getBytes()) + ".";
        mvc.perform(bearer(get("/api/v1/auth/me"), unsigned)).andExpect(status().isUnauthorized());
    }

    @Test
    void theRestOfTheApiNowNeedsSignIn() throws Exception {
        mvc.perform(post("/api/v1/validate").contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/export/pif").contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isUnauthorized());

        // With a token the request gets past the sign-in check (and reaches the controller, which only answers POST here)
        String token = accessTokenOf(register(email(), PASSWORD));
        mvc.perform(bearer(get("/api/v1/validate"), token)).andExpect(status().isMethodNotAllowed());
    }

    // ---- refresh tokens

    @Test
    void aRefreshTokenCanBeSwappedForANewOne_andTheOldOneStopsWorking() throws Exception {
        String first = refreshCookieOf(register(email(), PASSWORD));

        MvcResult renewed = refresh(first);
        assertThat(renewed.getResponse().getStatus()).isEqualTo(200);
        String second = refreshCookieOf(renewed);
        assertThat(second).isNotEqualTo(first);
        assertThat(accessTokenOf(renewed)).isNotBlank();

        clock.advance(Duration.ofMinutes(5));
        assertThat(refresh(second).getResponse().getStatus()).isEqualTo(200);
    }

    @Test
    void aStolenRefreshTokenThatComesBackLaterEndsTheWholeSignIn() throws Exception {
        String first = refreshCookieOf(register(email(), PASSWORD));
        String second = refreshCookieOf(refresh(first));

        clock.advance(Duration.ofMinutes(5));
        assertThat(refresh(first).getResponse().getStatus()).isEqualTo(401);      // the old token again: reuse
        assertThat(refresh(second).getResponse().getStatus()).isEqualTo(401);     // so the newer one in the same family is dead too
    }

    @Test
    void twoTabsRenewingAtTheSameMomentAreNotTreatedAsTheft() throws Exception {
        String first = refreshCookieOf(register(email(), PASSWORD));
        String second = refreshCookieOf(refresh(first));

        MvcResult late = refresh(first);   // a moment later
        assertThat(late.getResponse().getStatus()).isEqualTo(409);
        assertThat((String) JsonPath.read(late.getResponse().getContentAsString(), "$.error.code")).isEqualTo("refresh_in_progress");
        assertThat(refresh(second).getResponse().getStatus()).isEqualTo(200);     // the session survived
    }

    @Test
    void refreshTokensExpireAndUnknownOnesAreRefused() throws Exception {
        String token = refreshCookieOf(register(email(), PASSWORD));
        assertThat(refresh("not-a-real-token").getResponse().getStatus()).isEqualTo(401);
        assertThat(mvc.perform(post("/api/v1/auth/refresh")).andReturn().getResponse().getStatus()).isEqualTo(401);   // no cookie at all

        clock.advance(Duration.ofDays(31));
        assertThat(refresh(token).getResponse().getStatus()).isEqualTo(401);
    }

    @Test
    void signingOutEndsTheSessionAndClearsTheCookie() throws Exception {
        String token = refreshCookieOf(register(email(), PASSWORD));

        MvcResult out = mvc.perform(post("/api/v1/auth/logout").cookie(new Cookie(AuthController.REFRESH_COOKIE, token))).andReturn();
        assertThat(out.getResponse().getStatus()).isEqualTo(204);
        assertThat(out.getResponse().getHeader("Set-Cookie")).contains("refresh_token=;").contains("Max-Age=0");

        clock.advance(Duration.ofMinutes(5));
        assertThat(refresh(token).getResponse().getStatus()).isEqualTo(401);
        assertThat(mvc.perform(post("/api/v1/auth/logout")).andReturn().getResponse().getStatus()).isEqualTo(204);   // signing out twice is fine
    }

    // ---- Google

    private static Jwt googleToken(String sub, String email, boolean verified, String name) {
        return Jwt.withTokenValue("t").header("alg", "RS256").subject(sub).claim("email", email).claim("email_verified", verified).claim("name", name)
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(600)).build();
    }

    @Test
    void googleSignInCreatesAnAccountOnceAndThenSignsIntoIt() throws Exception {
        String email = email();
        GOOGLE.put("g1", googleToken("sub-1", email, true, "Gina Google"));

        MvcResult first = send("/api/v1/auth/google", Map.of("idToken", "g1"));
        assertThat(first.getResponse().getStatus()).isEqualTo(200);
        assertThat((String) JsonPath.read(first.getResponse().getContentAsString(), "$.user.username")).isEqualTo("Gina_Google");

        MvcResult second = send("/api/v1/auth/google", Map.of("idToken", "g1"));
        assertThat((String) JsonPath.read(second.getResponse().getContentAsString(), "$.user.id")).isEqualTo(JsonPath.read(first.getResponse().getContentAsString(), "$.user.id"));
        assertThat(jdbc.queryForObject("select count(*) from app_users", Long.class)).isEqualTo(1);
    }

    @Test
    void googleSignInJoinsAnExistingAccountWithTheSameVerifiedEmail_butNeverAnUnverifiedOne() throws Exception {
        String email = email();
        String id = JsonPath.read(register(email, PASSWORD).getResponse().getContentAsString(), "$.user.id");

        GOOGLE.put("unverified", googleToken("sub-9", email, false, "Mallory"));
        assertThat(send("/api/v1/auth/google", Map.of("idToken", "unverified")).getResponse().getStatus()).isEqualTo(401);

        GOOGLE.put("verified", googleToken("sub-9", email, true, "Real Owner"));
        MvcResult joined = send("/api/v1/auth/google", Map.of("idToken", "verified"));
        assertThat((String) JsonPath.read(joined.getResponse().getContentAsString(), "$.user.id")).isEqualTo(id);
        assertThat(jdbc.queryForObject("select google_sub from app_users where email = ?", String.class, email)).isEqualTo("sub-9");
        assertThat(login(email, PASSWORD).getResponse().getStatus()).isEqualTo(200);   // the password still works
    }

    @Test
    void rejectsATokenGoogleDidNotIssue_andPicksANewNameWhenOneIsTaken() throws Exception {
        assertThat(send("/api/v1/auth/google", Map.of("idToken", "forged")).getResponse().getStatus()).isEqualTo(401);

        GOOGLE.put("a", googleToken("sub-a", email(), true, "Sam Smith"));
        GOOGLE.put("b", googleToken("sub-b", email(), true, "Sam Smith"));
        String a = JsonPath.read(send("/api/v1/auth/google", Map.of("idToken", "a")).getResponse().getContentAsString(), "$.user.username");
        String b = JsonPath.read(send("/api/v1/auth/google", Map.of("idToken", "b")).getResponse().getContentAsString(), "$.user.username");
        assertThat(a).isEqualTo("Sam_Smith");
        assertThat(b).startsWith("Sam_Smith_").isNotEqualTo(a);
    }

    // ---- deleting the account

    @Test
    void deletingTheAccountRemovesItAndEndsEverySession() throws Exception {
        String email = email();
        MvcResult registered = register(email, PASSWORD);
        String token = accessTokenOf(registered);
        String refreshToken = refreshCookieOf(registered);

        mvc.perform(bearer(delete("/api/v1/auth/me"), token)).andExpect(status().isNoContent());

        assertThat(jdbc.queryForObject("select count(*) from app_users", Long.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from refresh_tokens", Long.class)).isZero();
        assertThat(login(email, PASSWORD).getResponse().getStatus()).isEqualTo(401);
        assertThat(refresh(refreshToken).getResponse().getStatus()).isEqualTo(401);
        mvc.perform(bearer(get("/api/v1/auth/me"), token)).andExpect(status().isUnauthorized());   // the old access token names a user who is gone
    }

    @Test
    void deletingNeedsSignIn() throws Exception {
        mvc.perform(delete("/api/v1/auth/me")).andExpect(status().isUnauthorized());
    }
}
