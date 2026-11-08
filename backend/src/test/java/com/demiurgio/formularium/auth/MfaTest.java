package com.demiurgio.formularium.auth;

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
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.mockito.ArgumentCaptor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/** Two-step verification from setting it up to signing in with it, and the ways it must not be dodged. */
@SpringBootTest
@AutoConfigureMockMvc
class MfaTest {

    static class TestClock extends Clock {
        private volatile Instant now = Instant.now();
        void advance(Duration d) { now = now.plus(d); }
        @Override public ZoneId getZone() { return ZoneId.of("UTC"); }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return now; }
    }

    static final Map<String, Jwt> GOOGLE = new ConcurrentHashMap<>();

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

    private static final String PASSWORD = "correct horse battery";
    private static final String CODE_FORMAT = "[A-Z2-9]{5}-[A-Z2-9]{5}";

    @Autowired private MockMvc mvc;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private TestClock clock;
    @MockitoBean private EmailSender mailer;

    @BeforeEach
    void clean() {
        jdbc.update("delete from auth_events");
        jdbc.update("delete from refresh_tokens");
        jdbc.update("delete from app_users");   // the secrets, recovery codes and challenges go with it
        GOOGLE.clear();
    }

    // ---- helpers

    private record Member(String email, String token, String id) { }

    private record Enrolled(Member member, String secret, List<String> recoveryCodes) { }

    private MvcResult send(String path, String json, String token, String ip) throws Exception {
        MockHttpServletRequestBuilder request = post("/api/v1/auth/" + path).contentType(MediaType.APPLICATION_JSON).content(json).with(r -> { r.setRemoteAddr(ip); return r; });
        if (token != null) request.header("Authorization", "Bearer " + token);
        return mvc.perform(request).andReturn();
    }

    private MvcResult send(String path, String json, String token) throws Exception { return send(path, json, token, "10.20.0.1"); }

    private int status(MvcResult r) { return r.getResponse().getStatus(); }

    private String body(MvcResult r) throws Exception { return r.getResponse().getContentAsString(); }

    private <T> T json(MvcResult r, String path) throws Exception { return JsonPath.read(body(r), path); }

    private String code(MvcResult r) throws Exception { return json(r, "$.error.code"); }

    private Member register() throws Exception {
        String email = "user-" + UUID.randomUUID().toString().substring(0, 8) + "@example.com";
        MvcResult r = send("register", "{\"email\":\"" + email + "\",\"password\":\"" + PASSWORD + "\",\"username\":\"u" + UUID.randomUUID().toString().substring(0, 8) + "\"}", null);
        assertThat(status(r)).isEqualTo(201);
        return new Member(email, json(r, "$.accessToken"), json(r, "$.user.id"));
    }

    /** The code the member's app would show right now. */
    private String appCode(String secret) { return Totp.code(Totp.fromBase32(secret), Totp.stepAt(clock.instant())); }

    private String secretOf(Member m) throws Exception {
        MvcResult setup = send("mfa/setup", "{\"password\":\"" + PASSWORD + "\"}", m.token());
        assertThat(status(setup)).isEqualTo(200);
        return json(setup, "$.secret");
    }

    /** A member with two-step verification on. The clock is moved on afterwards, because setting up used the current code. */
    private Enrolled enrolled() throws Exception {
        Member m = register();
        String secret = secretOf(m);
        MvcResult enabled = send("mfa/enable", "{\"code\":\"" + appCode(secret) + "\"}", m.token());
        assertThat(status(enabled)).isEqualTo(200);
        clock.advance(Duration.ofSeconds(31));
        return new Enrolled(m, secret, json(enabled, "$.recovery_codes"));
    }

    private MvcResult password(String email) throws Exception { return send("login", "{\"email\":\"" + email + "\",\"password\":\"" + PASSWORD + "\"}", null); }

    private MvcResult second(String mfaToken, String code) throws Exception { return send("login/mfa", "{\"mfaToken\":\"" + mfaToken + "\",\"code\":\"" + code + "\"}", null); }

    private String challengeFor(String email) throws Exception {
        MvcResult r = password(email);
        assertThat(status(r)).isEqualTo(200);
        return json(r, "$.mfa_token");
    }

    private long events(String type) { return jdbc.queryForObject("select count(*) from auth_events where type = ?", Long.class, type); }

    private Map<String, Object> state(Member m) throws Exception {
        MvcResult r = mvc.perform(get("/api/v1/auth/mfa").header("Authorization", "Bearer " + m.token())).andReturn();
        assertThat(status(r)).isEqualTo(200);
        return JsonPath.read(body(r), "$");
    }

    // ---- setting up

    @Test
    void startsOffAndAvailable() throws Exception {
        Member m = register();
        assertThat(state(m)).containsEntry("available", true).containsEntry("enabled", false).containsEntry("recovery_codes_left", 0).containsEntry("needs_password", true);
    }

    @Test
    void everythingNeedsASignedInMember() throws Exception {
        for (String path : new String[] { "mfa/setup", "mfa/enable", "mfa/disable", "mfa/recovery-codes" }) {
            assertThat(status(send(path, "{\"code\":\"123456\",\"password\":\"x\"}", null))).isEqualTo(401);
        }
        assertThat(status(mvc.perform(get("/api/v1/auth/mfa")).andReturn())).isEqualTo(401);
    }

    @Test
    void settingUpNeedsThePassword_soAStolenAccessTokenCannotBindTheAccountToAnotherPhone() throws Exception {
        Member m = register();
        assertThat(status(send("mfa/setup", "{}", m.token()))).isEqualTo(401);
        MvcResult wrong = send("mfa/setup", "{\"password\":\"not the password\"}", m.token());
        assertThat(status(wrong)).isEqualTo(401);
        assertThat(code(wrong)).isEqualTo("invalid_credentials");
        assertThat(jdbc.queryForObject("select count(*) from user_mfa", Long.class)).isZero();
        assertThat(events("mfa_failed")).isEqualTo(2);
    }

    @Test
    void hands_outASecretAndTheAddressForTheQrCode_andStoresTheSecretEncrypted() throws Exception {
        Member m = register();
        MvcResult setup = send("mfa/setup", "{\"password\":\"" + PASSWORD + "\"}", m.token());
        assertThat(status(setup)).isEqualTo(200);
        assertThat(setup.getResponse().getHeader("Cache-Control")).isEqualTo("no-store");
        String secret = json(setup, "$.secret");
        assertThat(secret).matches("[A-Z2-7]{32}");
        assertThat((String) json(setup, "$.otpauth_uri")).startsWith("otpauth://totp/Formularium:").contains("secret=" + secret).contains("issuer=Formularium");

        String stored = jdbc.queryForObject("select secret_encrypted from user_mfa", String.class);
        assertThat(stored).doesNotContain(secret);
        assertThat(jdbc.queryForObject("select enabled_at from user_mfa", Object.class)).isNull();   // pending until a code proves it
        assertThat(state(m)).containsEntry("enabled", false);
    }

    @Test
    void staysOffUntilARightCodeIsGiven_thenGivesTenRecoveryCodesOnce() throws Exception {
        Member m = register();
        String secret = secretOf(m);

        MvcResult wrong = send("mfa/enable", "{\"code\":\"000000\"}", m.token());
        assertThat(status(wrong)).isEqualTo(401);
        assertThat(code(wrong)).isEqualTo("invalid_code");
        assertThat(state(m)).containsEntry("enabled", false);

        MvcResult enabled = send("mfa/enable", "{\"code\":\"" + appCode(secret) + "\"}", m.token());
        assertThat(status(enabled)).isEqualTo(200);
        List<String> codes = json(enabled, "$.recovery_codes");
        assertThat(codes).hasSize(10).doesNotHaveDuplicates().allMatch(c -> c.matches(CODE_FORMAT));
        assertThat(state(m)).containsEntry("enabled", true).containsEntry("recovery_codes_left", 10);

        // the codes are stored only as hashes
        String stored = jdbc.queryForList("select code_hash from mfa_recovery_codes", String.class).toString();
        codes.forEach(c -> assertThat(stored).doesNotContain(c).doesNotContain(c.replace("-", "")));
        assertThat(events("mfa_enabled")).isEqualTo(1);

        assertThat(code(send("mfa/setup", "{\"password\":\"" + PASSWORD + "\"}", m.token()))).isEqualTo("mfa_already_on");   // it cannot be silently replaced
    }

    @Test
    void aSecretThatWasCopiedToAnotherAccountDoesNotWork() throws Exception {
        Enrolled a = enrolled();
        Member b = register();
        String secretB = secretOf(b);
        String ofA = jdbc.queryForObject("select secret_encrypted from user_mfa where user_id = ?::uuid", String.class, a.member().id());
        jdbc.update("update user_mfa set secret_encrypted = ? where user_id = ?::uuid", ofA, b.id());   // an attacker with database access swaps the ciphertext
        assertThat(secretB).isNotEqualTo(a.secret());
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> send("mfa/enable", "{\"code\":\"" + appCode(a.secret()) + "\"}", b.token()))
                .hasRootCauseMessage("Tag mismatch");   // bound to the owner: it does not decrypt for anyone else
    }

    // ---- signing in

    @Test
    void aRightPasswordAloneDoesNotSignInAnAccountWithTwoStepVerification() throws Exception {
        Enrolled e = enrolled();
        long sessionsBefore = jdbc.queryForObject("select count(*) from refresh_tokens", Long.class);   // signing up made one
        MvcResult r = password(e.member().email());
        assertThat(status(r)).isEqualTo(200);
        assertThat(body(r)).contains("mfa_required").doesNotContain("accessToken");
        assertThat(r.getResponse().getHeader("Set-Cookie")).isNull();   // no refresh cookie, so no way to a session
        assertThat(jdbc.queryForObject("select count(*) from refresh_tokens", Long.class)).isEqualTo(sessionsBefore);   // and none was created

        // the one-time token is not an access token
        String challenge = json(r, "$.mfa_token");
        assertThat(status(mvc.perform(get("/api/v1/auth/me").header("Authorization", "Bearer " + challenge)).andReturn())).isEqualTo(401);
    }

    @Test
    void aRightCodeCompletesTheSignIn_once() throws Exception {
        Enrolled e = enrolled();
        String challenge = challengeFor(e.member().email());

        MvcResult done = second(challenge, appCode(e.secret()));
        assertThat(status(done)).isEqualTo(200);
        assertThat((String) json(done, "$.accessToken")).isNotBlank();
        assertThat((String) json(done, "$.user.email")).isEqualTo(e.member().email());
        assertThat(done.getResponse().getCookie("refresh_token")).isNotNull();
        assertThat(events("mfa_login_success")).isEqualTo(1);

        assertThat(code(second(challenge, appCode(e.secret())))).isEqualTo("mfa_expired");   // the challenge was used up
    }

    @Test
    void aCodeWorksOnlyOnce_evenForANewSignIn() throws Exception {
        Enrolled e = enrolled();
        String code = appCode(e.secret());
        assertThat(status(second(challengeFor(e.member().email()), code))).isEqualTo(200);

        MvcResult replay = second(challengeFor(e.member().email()), code);   // someone saw the code over a shoulder and tries it at once
        assertThat(status(replay)).isEqualTo(401);
        assertThat(code(replay)).isEqualTo("invalid_code");

        clock.advance(Duration.ofSeconds(30));
        assertThat(status(second(challengeFor(e.member().email()), appCode(e.secret())))).isEqualTo(200);   // the next code is fine
    }

    @Test
    void acceptsAPhoneClockThatIsAStepOff_butNotTwo() throws Exception {
        Enrolled e = enrolled();
        clock.advance(Duration.ofSeconds(30));   // so the step before "now" is later than the one that was used to switch it on
        byte[] key = Totp.fromBase32(e.secret());
        long now = Totp.stepAt(clock.instant());
        assertThat(code(second(challengeFor(e.member().email()), Totp.code(key, now - 2)))).isEqualTo("invalid_code");
        assertThat(status(second(challengeFor(e.member().email()), Totp.code(key, now - 1)))).isEqualTo(200);
    }

    @Test
    void fiveWrongCodesEndTheChallenge_evenIfTheSixthIsRight() throws Exception {
        Enrolled e = enrolled();
        String challenge = challengeFor(e.member().email());
        for (int i = 0; i < MfaService.MAX_CHALLENGE_ATTEMPTS - 1; i++) assertThat(code(second(challenge, "00000" + i))).isEqualTo("invalid_code");
        MvcResult last = second(challenge, "000009");
        assertThat(code(last)).isEqualTo("mfa_expired");   // the fifth wrong one ends it
        assertThat(code(second(challenge, appCode(e.secret())))).isEqualTo("mfa_expired");
        assertThat(events("mfa_failed")).isEqualTo(MfaService.MAX_CHALLENGE_ATTEMPTS);
    }

    @Test
    void theChallengeExpiresAfterFiveMinutes() throws Exception {
        Enrolled e = enrolled();
        String challenge = challengeFor(e.member().email());
        clock.advance(MfaService.CHALLENGE_TTL.plusSeconds(1));
        assertThat(code(second(challenge, appCode(e.secret())))).isEqualTo("mfa_expired");
    }

    @Test
    void guessingCodesIsLimitedPerAccount_acrossChallengesAndAddresses() throws Exception {
        Enrolled e = enrolled();
        for (int round = 0; round < 2; round++) {   // two challenges, five wrong codes each: ten failures for the account
            String challenge = challengeFor(e.member().email());
            for (int i = 0; i < MfaService.MAX_CHALLENGE_ATTEMPTS; i++) {
                assertThat(status(send("login/mfa", "{\"mfaToken\":\"" + challenge + "\",\"code\":\"11111" + i + "\"}", null, "10.30." + round + "." + i))).isEqualTo(401);
            }
        }
        MvcResult blocked = second(challengeFor(e.member().email()), appCode(e.secret()));   // even the right code, from a new address
        assertThat(status(blocked)).isEqualTo(429);
        assertThat(code(blocked)).isEqualTo("too_many_attempts");

        clock.advance(LoginAttemptLimiter.WINDOW.plusSeconds(1));
        assertThat(status(second(challengeFor(e.member().email()), appCode(e.secret())))).isEqualTo(200);
    }

    // ---- recovery codes

    @Test
    void aRecoveryCodeSignsYouIn_onceOnly_inAnyCaseAndWithOrWithoutTheDash() throws Exception {
        Enrolled e = enrolled();
        String recovery = e.recoveryCodes().get(0);

        MvcResult done = second(challengeFor(e.member().email()), recovery.toLowerCase());
        assertThat(status(done)).isEqualTo(200);
        assertThat(state(new Member(e.member().email(), json(done, "$.accessToken"), e.member().id()))).containsEntry("recovery_codes_left", 9);
        assertThat(events("recovery_code_used")).isEqualTo(1);

        assertThat(code(second(challengeFor(e.member().email()), recovery))).isEqualTo("invalid_code");           // used up
        assertThat(status(second(challengeFor(e.member().email()), e.recoveryCodes().get(1).replace("-", "")))).isEqualTo(200);   // another, typed without the dash
    }

    @Test
    void newRecoveryCodesNeedACode_andReplaceTheOldOnes() throws Exception {
        Enrolled e = enrolled();
        assertThat(status(send("mfa/recovery-codes", "{\"code\":\"000000\"}", e.member().token()))).isEqualTo(401);

        MvcResult fresh = send("mfa/recovery-codes", "{\"code\":\"" + appCode(e.secret()) + "\"}", e.member().token());
        assertThat(status(fresh)).isEqualTo(200);
        List<String> codes = json(fresh, "$.recovery_codes");
        assertThat(codes).hasSize(10).doesNotContainAnyElementsOf(e.recoveryCodes());

        assertThat(code(second(challengeFor(e.member().email()), e.recoveryCodes().get(0)))).isEqualTo("invalid_code");   // the old ones are dead
        assertThat(status(second(challengeFor(e.member().email()), codes.get(0)))).isEqualTo(200);
    }

    // ---- switching off

    @Test
    void switchingOffNeedsACode_andThenSignInIsAsBefore() throws Exception {
        Enrolled e = enrolled();
        assertThat(status(send("mfa/disable", "{\"code\":\"000000\"}", e.member().token()))).isEqualTo(401);
        assertThat(state(e.member())).containsEntry("enabled", true);

        assertThat(status(send("mfa/disable", "{\"code\":\"" + appCode(e.secret()) + "\"}", e.member().token()))).isEqualTo(204);
        assertThat(state(e.member())).containsEntry("enabled", false);
        assertThat(jdbc.queryForObject("select count(*) from user_mfa", Long.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from mfa_recovery_codes", Long.class)).isZero();
        assertThat(events("mfa_disabled")).isEqualTo(1);

        MvcResult plain = password(e.member().email());
        assertThat(body(plain)).contains("accessToken").doesNotContain("mfa_required");
    }

    @Test
    void aRecoveryCodeCanSwitchItOffToo_forSomeoneWhoLostTheirPhone() throws Exception {
        Enrolled e = enrolled();
        assertThat(status(send("mfa/disable", "{\"code\":\"" + e.recoveryCodes().get(3) + "\"}", e.member().token()))).isEqualTo(204);
        assertThat(state(e.member())).containsEntry("enabled", false);
    }

    @Test
    void aPasswordResetDoesNotSwitchItOff_soHavingTheInboxIsNotAWayAroundTheSecondStep() throws Exception {
        Enrolled e = enrolled();
        assertThat(status(send("forgot-password", "{\"email\":\"" + e.member().email() + "\"}", null))).isEqualTo(202);
        ArgumentCaptor<String> mail = ArgumentCaptor.forClass(String.class);
        verify(mailer).send(eq(e.member().email()), anyString(), mail.capture());
        Matcher link = Pattern.compile("token=([A-Za-z0-9_-]+)").matcher(mail.getValue());
        assertThat(link.find()).isTrue();

        // the person (or an attacker with the inbox) chooses a new password with the link
        assertThat(status(send("reset-password", "{\"token\":\"" + link.group(1) + "\",\"password\":\"a brand new passphrase\"}", null))).isEqualTo(204);

        MvcResult signIn = send("login", "{\"email\":\"" + e.member().email() + "\",\"password\":\"a brand new passphrase\"}", null);
        assertThat(body(signIn)).contains("mfa_required").doesNotContain("accessToken");   // the new password alone still does not sign in
        assertThat(state(e.member())).isNotNull();
    }

    // ---- Google

    @Test
    void googleSignInAsksForTheCodeToo_andAGoogleOnlyAccountCanSetItUpWithoutAPassword() throws Exception {
        String email = "gina-" + UUID.randomUUID().toString().substring(0, 6) + "@example.com";
        GOOGLE.put("g1", Jwt.withTokenValue("t").header("alg", "RS256").subject("sub-" + email).claim("email", email).claim("email_verified", true).claim("name", "Gina")
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(600)).build());
        MvcResult first = send("google", "{\"idToken\":\"g1\"}", null);
        assertThat(status(first)).isEqualTo(200);
        Member gina = new Member(email, json(first, "$.accessToken"), json(first, "$.user.id"));
        assertThat(state(gina)).containsEntry("needs_password", false);

        MvcResult setup = send("mfa/setup", "{}", gina.token());   // no password to ask for
        assertThat(status(setup)).isEqualTo(200);
        String secret = json(setup, "$.secret");
        assertThat(status(send("mfa/enable", "{\"code\":\"" + appCode(secret) + "\"}", gina.token()))).isEqualTo(200);
        clock.advance(Duration.ofSeconds(31));

        MvcResult again = send("google", "{\"idToken\":\"g1\"}", null);   // the same Google account signs in again
        assertThat(body(again)).contains("mfa_required").doesNotContain("accessToken");
        assertThat(again.getResponse().getHeader("Set-Cookie")).isNull();
        assertThat(status(second(json(again, "$.mfa_token"), appCode(secret)))).isEqualTo(200);
    }

    // ---- the record of what happened

    @Test
    void recordsEverythingWithoutAnyCode() throws Exception {
        Enrolled e = enrolled();
        second(challengeFor(e.member().email()), "000000");
        String all = jdbc.queryForList("select * from auth_events").toString();
        assertThat(all).doesNotContain(e.secret()).doesNotContain("000000").doesNotContain(e.recoveryCodes().get(0));
        assertThat(events("mfa_failed")).isEqualTo(1);
    }
}
