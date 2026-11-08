package com.demiurgio.formularium.auth;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * The protections that matter once real people use the sign-in: throttling that cannot be dodged by changing address, a record of what happened,
 * limits on emails, leaked and over-long passwords, and the origin check on the cookie endpoints.
 */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = "auth.require-verified-email=true")
class AuthHardeningTest {

    private static final String PASSWORD = "correct horse battery";
    private static final Pattern LINK = Pattern.compile("token=([A-Za-z0-9_-]+)");

    @Autowired private MockMvc mvc;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private AuthService auth;
    @MockitoBean private EmailSender mail;
    @MockitoBean private PasswordBreachChecker breach;

    @BeforeEach
    void clean() {
        jdbc.update("delete from auth_events");
        jdbc.update("delete from email_tokens");
        jdbc.update("delete from refresh_tokens");
        jdbc.update("delete from app_users");
        clearInvocations(mail);
        when(breach.isBreached(anyString())).thenReturn(false);
    }

    // ---- helpers

    private static String email() { return "user-" + UUID.randomUUID().toString().substring(0, 8) + "@example.com"; }

    private MvcResult send(String path, String json, String ip, String origin) throws Exception {
        MockHttpServletRequestBuilder request = post("/api/v1/auth/" + path).contentType(MediaType.APPLICATION_JSON).content(json).with(r -> { r.setRemoteAddr(ip); return r; });
        if (origin != null) request.header("Origin", origin);
        return mvc.perform(request).andReturn();
    }

    private MvcResult send(String path, String json, String ip) throws Exception { return send(path, json, ip, null); }

    private static String credentials(String email, String password) { return "{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}"; }

    private MvcResult login(String email, String password, String ip) throws Exception { return send("login", credentials(email, password), ip); }

    private int status(MvcResult result) { return result.getResponse().getStatus(); }

    private String code(MvcResult result) throws Exception { return JsonPath.read(result.getResponse().getContentAsString(), "$.error.code"); }

    /** An account that has confirmed its address, so it can sign in. */
    private String account() throws Exception {
        String email = email();
        String username = "u" + UUID.randomUUID().toString().substring(0, 8);
        assertThat(status(send("register", "{\"email\":\"" + email + "\",\"password\":\"" + PASSWORD + "\",\"username\":\"" + username + "\"}", "10.9.9.9"))).isEqualTo(202);
        jdbc.update("update app_users set email_verified_at = now() where email = ?", email);
        jdbc.update("delete from auth_events");   // start the test from a clean slate
        clearInvocations(mail);                    // and without the confirmation email that sign-up sent
        return email;
    }

    private long events(String type) { return jdbc.queryForObject("select count(*) from auth_events where type = ?", Long.class, type); }

    // ---- throttling

    @Test
    void guessingOneAccountFromManyAddressesIsStoppedToo_whichTheOldPerAddressLimitMissed() throws Exception {
        String email = account();
        for (int i = 0; i < LoginAttemptLimiter.MAX_FAILURES_PER_EMAIL; i++) {
            assertThat(status(login(email, "wrong " + i, "10.1." + (i / 200) + "." + (i % 200)))).isEqualTo(401);   // a different address every time
        }
        MvcResult blocked = login(email, PASSWORD, "10.2.2.2");   // a fresh address, and the right password
        assertThat(status(blocked)).isEqualTo(429);
        assertThat(code(blocked)).isEqualTo("too_many_attempts");
    }

    @Test
    void tryingOnePasswordOnManyAccountsFromOneAddressIsStopped() throws Exception {
        String real = account();   // made first: creating it starts from an empty events table
        for (int i = 0; i < LoginAttemptLimiter.MAX_FAILURES_PER_IP; i++) {
            assertThat(status(login(email(), "Summer2024!!", "10.3.3.3"))).isEqualTo(401);   // a different (unknown) account every time
        }
        MvcResult blocked = login(real, PASSWORD, "10.3.3.3");
        assertThat(status(blocked)).isEqualTo(429);
        assertThat(status(login(real, PASSWORD, "10.4.4.4"))).isEqualTo(200);   // someone else on another connection is not affected
    }

    @Test
    void aRightPasswordClearsTheFailuresForThatAccountOnThatAddress() throws Exception {
        String email = account();
        for (int i = 0; i < LoginAttemptLimiter.MAX_FAILURES - 1; i++) assertThat(status(login(email, "wrong " + i, "10.5.5.5"))).isEqualTo(401);
        assertThat(status(login(email, PASSWORD, "10.5.5.5"))).isEqualTo(200);
        for (int i = 0; i < LoginAttemptLimiter.MAX_FAILURES - 1; i++) assertThat(status(login(email, "again " + i, "10.5.5.5"))).isEqualTo(401);   // not blocked: the count started again
        assertThat(status(login(email, PASSWORD, "10.5.5.5"))).isEqualTo(200);
    }

    @Test
    void asksForAtMostTenEmailsPerHourFromOneAddress_withoutRevealingWhichAddressesHaveAccounts() throws Exception {
        String known = account();
        for (int i = 0; i < LoginAttemptLimiter.MAX_EMAILS_PER_IP; i++) {
            String who = i % 2 == 0 ? known : email();
            assertThat(status(send("forgot-password", "{\"email\":\"" + who + "\"}", "10.6.6.6"))).isEqualTo(202);   // the same answer for both
        }
        MvcResult blocked = send("forgot-password", "{\"email\":\"" + email() + "\"}", "10.6.6.6");
        assertThat(status(blocked)).isEqualTo(429);
        assertThat(code(blocked)).isEqualTo("too_many_requests");
        assertThat(status(send("resend-verification", "{\"email\":\"" + known + "\"}", "10.6.6.6"))).isEqualTo(429);   // the limit is shared by both endpoints
        assertThat(status(send("forgot-password", "{\"email\":\"" + known + "\"}", "10.7.7.7"))).isEqualTo(202);      // another address is fine
    }

    // ---- the audit trail

    @Test
    void recordsWhatHappened_withoutPasswordsOrRawEmailAddresses() throws Exception {
        String email = account();
        login(email, "wrong password", "10.8.8.8");
        login(email, PASSWORD, "10.8.8.8");
        send("forgot-password", "{\"email\":\"" + email + "\"}", "10.8.8.8");

        assertThat(events("login_failed")).isEqualTo(1);
        assertThat(events("login_success")).isEqualTo(1);
        assertThat(events("password_reset_requested")).isEqualTo(1);
        assertThat(events("email_requested")).isEqualTo(1);

        String id = jdbc.queryForObject("select id::text from app_users where email = ?", String.class, email);
        assertThat(jdbc.queryForObject("select count(*) from auth_events where user_id::text = ?", Long.class, id)).isEqualTo(3);   // the failure on a known account is linked to it
        String dump = jdbc.queryForList("select * from auth_events").toString();
        assertThat(dump).doesNotContain(email).doesNotContain("wrong password").doesNotContain(PASSWORD).doesNotContain("@");
        assertThat(jdbc.queryForObject("select email_hash from auth_events where type = 'login_failed'", String.class)).isEqualTo(TokenService.hash(email));
    }

    @Test
    void anOldRefreshTokenComingBackIsRecordedAsPossibleTheft() throws Exception {
        String email = account();
        MvcResult signedIn = login(email, PASSWORD, "10.8.1.1");
        String cookie = signedIn.getResponse().getCookie("refresh_token").getValue();
        jdbc.update("update refresh_tokens set revoked_at = ?", java.sql.Timestamp.from(Instant.now().minus(Duration.ofHours(1))));   // it was used long ago

        MvcResult replay = mvc.perform(post("/api/v1/auth/refresh").cookie(new jakarta.servlet.http.Cookie("refresh_token", cookie)).with(r -> { r.setRemoteAddr("10.66.6.6"); return r; })).andReturn();
        assertThat(status(replay)).isEqualTo(401);
        assertThat(events("refresh_reuse")).isEqualTo(1);
        assertThat(jdbc.queryForObject("select ip from auth_events where type = 'refresh_reuse'", String.class)).isEqualTo("10.66.6.6");
    }

    @Test
    void eventsAreKeptForNinetyDaysAndThenPurged() {
        Instant now = Instant.now();
        jdbc.update("insert into auth_events (at, type) values (?, 'login_failed')", java.sql.Timestamp.from(now.minus(Duration.ofDays(91))));
        jdbc.update("insert into auth_events (at, type) values (?, 'login_failed')", java.sql.Timestamp.from(now.minus(Duration.ofDays(89))));
        auth.purgeExpiredTokens();
        assertThat(jdbc.queryForObject("select count(*) from auth_events", Long.class)).isEqualTo(1);
    }

    // ---- passwords

    @Test
    void refusesAPasswordFoundInADataBreach_atSignUp() throws Exception {
        when(breach.isBreached("Password12345")).thenReturn(true);
        MvcResult refused = send("register", "{\"email\":\"" + email() + "\",\"password\":\"Password12345\",\"username\":\"someone\"}", "10.9.1.1");
        assertThat(status(refused)).isEqualTo(400);
        assertThat(code(refused)).isEqualTo("password_breached");
        assertThat(jdbc.queryForObject("select count(*) from app_users", Long.class)).isZero();
    }

    @Test
    void aBreachedPasswordIsRefusedAtReset_andTheLinkStillWorksForABetterOne() throws Exception {
        String email = account();
        send("forgot-password", "{\"email\":\"" + email + "\"}", "10.9.2.2");
        org.mockito.ArgumentCaptor<String> body = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(mail).send(org.mockito.ArgumentMatchers.eq(email), anyString(), body.capture());
        Matcher link = LINK.matcher(body.getValue());
        assertThat(link.find()).isTrue();
        String token = link.group(1);

        when(breach.isBreached("Summer2024!!")).thenReturn(true);
        MvcResult refused = send("reset-password", "{\"token\":\"" + token + "\",\"password\":\"Summer2024!!\"}", "10.9.2.2");
        assertThat(status(refused)).isEqualTo(400);
        assertThat(code(refused)).isEqualTo("password_breached");

        assertThat(status(send("reset-password", "{\"token\":\"" + token + "\",\"password\":\"a much better passphrase\"}", "10.9.2.2"))).isEqualTo(204);
        assertThat(events("password_reset_done")).isEqualTo(1);
    }

    @Test
    void aPasswordLongerThanBcryptCanReadIsRefusedInBytes_notSilentlyCut() throws Exception {
        String twentyKeys = "🔑".repeat(20);   // 40 characters, but 80 bytes
        MvcResult refused = send("register", "{\"email\":\"" + email() + "\",\"password\":\"" + twentyKeys + "\",\"username\":\"keys\"}", "10.9.3.3");
        assertThat(status(refused)).isEqualTo(400);
        assertThat(code(refused)).isEqualTo("password_too_long");

        // signing in with one is simply "wrong password", never a server error
        assertThat(status(login(account(), twentyKeys, "10.9.3.4"))).isEqualTo(401);
    }

    // ---- the cookie endpoints

    @Test
    void anotherWebsiteCannotRenewOrSignOutOnBehalfOfAMember_theRequestIsRefusedBeforeItRuns() throws Exception {
        // Spring's CORS handling rejects a request that names a foreign Origin (not only its answer): the cookie is never used.
        // This matters when the site and API are on different domains and the cookie has to be SameSite=None.
        assertThat(status(send("refresh", "", "10.10.1.1", "https://evil.example"))).isEqualTo(403);
        assertThat(status(send("logout", "", "10.10.1.1", "https://evil.example"))).isEqualTo(403);
        assertThat(status(send("login", credentials("a@b.co", "whatever whatever"), "10.10.1.1", "https://evil.example"))).isEqualTo(403);

        // the website itself, and requests with no Origin at all (scripts, curl), reach the normal answer: no cookie, so a renewal is a 401
        assertThat(status(send("refresh", "", "10.10.1.1", "http://localhost:5173"))).isEqualTo(401);
        assertThat(status(send("refresh", "", "10.10.1.1"))).isEqualTo(401);
        assertThat(status(send("logout", "", "10.10.1.1", "http://localhost:5173"))).isEqualTo(204);
    }
}
