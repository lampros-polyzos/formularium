package com.demiurgio.formularium.auth;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/** Confirming an email address and resetting a password, with email confirmation required (as in production). */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = "auth.require-verified-email=true")
class EmailVerificationAndResetTest {

    static class TestClock extends Clock {
        private volatile Instant now = Instant.now();
        void advance(Duration d) { now = now.plus(d); }
        @Override public ZoneId getZone() { return ZoneId.of("UTC"); }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return now; }
    }

    @TestConfiguration
    static class Config {
        @Bean @Primary TestClock testClock() { return new TestClock(); }
    }

    private static final String PASSWORD = "correct horse battery";
    private static final Pattern LINK = Pattern.compile("token=([A-Za-z0-9_-]+)");

    @Autowired private MockMvc mvc;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private TestClock clock;
    @MockitoBean private EmailSender mail;

    @BeforeEach
    void clean() {
        jdbc.update("delete from email_tokens");
        jdbc.update("delete from refresh_tokens");
        jdbc.update("delete from app_users");
        clearInvocations(mail);
    }

    private MvcResult send(String path, String json) throws Exception {
        return mvc.perform(post("/api/v1/auth/" + path).contentType(MediaType.APPLICATION_JSON).content(json)).andReturn();
    }

    private int register(String name) throws Exception {
        return send("register", "{\"email\":\"" + name + "@example.com\",\"password\":\"" + PASSWORD + "\",\"username\":\"" + name + "\"}").getResponse().getStatus();
    }

    private int login(String name, String password) throws Exception {
        return send("login", "{\"email\":\"" + name + "@example.com\",\"password\":\"" + password + "\"}").getResponse().getStatus();
    }

    private int ask(String path, String email) throws Exception {
        return send(path, "{\"email\":\"" + email + "\"}").getResponse().getStatus();
    }

    /** The token in the most recent email sent to this address. */
    private String lastToken(String to) {
        ArgumentCaptor<String> body = ArgumentCaptor.forClass(String.class);
        verify(mail, org.mockito.Mockito.atLeastOnce()).send(eq(to), anyString(), body.capture());
        Matcher m = LINK.matcher(body.getValue());
        assertThat(m.find()).isTrue();
        return m.group(1);
    }

    private int verifyEmail(String token) throws Exception { return send("verify-email", "{\"token\":\"" + token + "\"}").getResponse().getStatus(); }

    private int reset(String token, String password) throws Exception {
        return send("reset-password", "{\"token\":\"" + token + "\",\"password\":\"" + password + "\"}").getResponse().getStatus();
    }

    // ---- confirming the address

    @Test
    void signingUpSendsALinkAndDoesNotSignYouIn() throws Exception {
        MvcResult result = send("register", "{\"email\":\"Ann@Example.com\",\"password\":\"" + PASSWORD + "\",\"username\":\"ann\"}");
        assertThat(result.getResponse().getStatus()).isEqualTo(202);
        assertThat(result.getResponse().getContentAsString()).contains("\"verification_required\":true").contains("ann@example.com").doesNotContain("access_token");
        assertThat(result.getResponse().getCookie("refresh_token")).isNull();
        verify(mail).send(eq("ann@example.com"), anyString(), anyString());
    }

    @Test
    void anUnconfirmedAccountCannotSignInEvenWithTheRightPassword_butAWrongPasswordIsStillJustWrong() throws Exception {
        register("ann");
        MvcResult blocked = send("login", "{\"email\":\"ann@example.com\",\"password\":\"" + PASSWORD + "\"}");
        assertThat(blocked.getResponse().getStatus()).isEqualTo(403);
        assertThat(blocked.getResponse().getContentAsString()).contains("email_not_verified");
        assertThat(login("ann", "not the password")).isEqualTo(401);   // nothing is revealed to someone who does not know the password
    }

    @Test
    void theLinkConfirmsTheAddressOnce() throws Exception {
        register("ann");
        String token = lastToken("ann@example.com");
        assertThat(verifyEmail(token)).isEqualTo(204);
        assertThat(login("ann", PASSWORD)).isEqualTo(200);
        assertThat(verifyEmail(token)).isEqualTo(400);    // used up
        assertThat(verifyEmail("not-a-real-token")).isEqualTo(400);
    }

    @Test
    void theLinkExpiresAfterADay() throws Exception {
        register("ann");
        String token = lastToken("ann@example.com");
        clock.advance(Duration.ofHours(25));
        assertThat(verifyEmail(token)).isEqualTo(400);
        assertThat(login("ann", PASSWORD)).isEqualTo(403);
    }

    @Test
    void aNewLinkCanBeAskedForButNotMoreThanOncePerMinute_andTheOldOneStopsWorking() throws Exception {
        register("ann");
        String first = lastToken("ann@example.com");
        assertThat(ask("resend-verification", "ann@example.com")).isEqualTo(202);
        verify(mail, times(1)).send(eq("ann@example.com"), anyString(), anyString());   // too soon: nothing new was sent

        clock.advance(Duration.ofSeconds(61));
        assertThat(ask("resend-verification", "ann@example.com")).isEqualTo(202);
        verify(mail, times(2)).send(eq("ann@example.com"), anyString(), anyString());
        String second = lastToken("ann@example.com");
        assertThat(second).isNotEqualTo(first);
        assertThat(verifyEmail(first)).isEqualTo(400);
        assertThat(verifyEmail(second)).isEqualTo(204);
    }

    @Test
    void askingForALinkTellsNothingAboutWhoHasAnAccount() throws Exception {
        register("ann");
        verifyEmail(lastToken("ann@example.com"));
        clearInvocations(mail);
        assertThat(ask("resend-verification", "nobody@example.com")).isEqualTo(202);   // no account
        assertThat(ask("resend-verification", "ann@example.com")).isEqualTo(202);      // already confirmed
        verify(mail, never()).send(anyString(), anyString(), anyString());
    }

    @Test
    void linksAreStoredOnlyAsHashes() throws Exception {
        register("ann");
        String token = lastToken("ann@example.com");
        String stored = jdbc.queryForObject("select token_hash from email_tokens", String.class);
        assertThat(stored).isNotEqualTo(token).hasSize(64);
    }

    @Test
    void whenConfirmationIsNotRequiredTheOldBehaviourStays_googleStyleAccountsAreAlreadyConfirmed() throws Exception {
        // an account that is already confirmed signs in directly
        jdbc.update("insert into app_users (id, email, password_hash, username, email_verified_at) values (gen_random_uuid(), 'old@example.com', ?, 'old', current_timestamp)",
                new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder().encode(PASSWORD));
        assertThat(login("old", PASSWORD)).isEqualTo(200);
    }

    // ---- resetting a password

    @Test
    void forgotPasswordSendsALinkOnlyIfThereIsAnAccount_butAnswersTheSame() throws Exception {
        register("ann");
        verifyEmail(lastToken("ann@example.com"));
        clearInvocations(mail);
        assertThat(ask("forgot-password", "nobody@example.com")).isEqualTo(202);
        verify(mail, never()).send(anyString(), anyString(), anyString());
        assertThat(ask("forgot-password", "ann@example.com")).isEqualTo(202);
        verify(mail, times(1)).send(eq("ann@example.com"), anyString(), anyString());
    }

    @Test
    void theResetLinkChangesThePasswordOnce_andSignsYouOutEverywhere() throws Exception {
        register("ann");
        verifyEmail(lastToken("ann@example.com"));
        MvcResult signedIn = send("login", "{\"email\":\"ann@example.com\",\"password\":\"" + PASSWORD + "\"}");
        Cookie session = signedIn.getResponse().getCookie("refresh_token");
        clearInvocations(mail);

        ask("forgot-password", "ann@example.com");
        String token = lastToken("ann@example.com");
        assertThat(reset(token, "a brand new password")).isEqualTo(204);

        assertThat(login("ann", PASSWORD)).isEqualTo(401);
        assertThat(login("ann", "a brand new password")).isEqualTo(200);
        assertThat(reset(token, "yet another password")).isEqualTo(400);   // once only
        // the sign-in from before the reset no longer renews
        assertThat(mvc.perform(post("/api/v1/auth/refresh").cookie(session)).andReturn().getResponse().getStatus()).isEqualTo(401);
    }

    @Test
    void theResetLinkExpiresAfterAnHour_andANewRequestCancelsTheOldLink() throws Exception {
        register("ann");
        verifyEmail(lastToken("ann@example.com"));
        clearInvocations(mail);
        ask("forgot-password", "ann@example.com");
        String first = lastToken("ann@example.com");
        clock.advance(Duration.ofSeconds(61));
        ask("forgot-password", "ann@example.com");
        String second = lastToken("ann@example.com");
        assertThat(reset(first, "a brand new password")).isEqualTo(400);

        clock.advance(Duration.ofMinutes(61));
        assertThat(reset(second, "a brand new password")).isEqualTo(400);
        assertThat(login("ann", PASSWORD)).isEqualTo(200);   // nothing changed
    }

    @Test
    void resetRequestsAreThrottled() throws Exception {
        register("ann");
        verifyEmail(lastToken("ann@example.com"));
        clearInvocations(mail);
        ask("forgot-password", "ann@example.com");
        ask("forgot-password", "ann@example.com");
        ask("forgot-password", "ann@example.com");
        verify(mail, times(1)).send(eq("ann@example.com"), anyString(), anyString());
    }

    @Test
    void aTooShortNewPasswordIsRefusedAndTheLinkStaysUsable() throws Exception {
        register("ann");
        verifyEmail(lastToken("ann@example.com"));
        clearInvocations(mail);
        ask("forgot-password", "ann@example.com");
        String token = lastToken("ann@example.com");
        assertThat(reset(token, "short")).isEqualTo(400);
        assertThat(reset(token, "a brand new password")).isEqualTo(204);
    }

    @Test
    void resettingAlsoConfirmsTheAddress_becauseTheLinkReachedTheInbox() throws Exception {
        register("ann");   // never clicked the confirmation link
        clearInvocations(mail);
        clock.advance(Duration.ofSeconds(61));
        ask("forgot-password", "ann@example.com");
        assertThat(reset(lastToken("ann@example.com"), "a brand new password")).isEqualTo(204);
        assertThat(login("ann", "a brand new password")).isEqualTo(200);
    }

    @Test
    void anAccountThatOnlyUsedGoogleCanSetAPassword() throws Exception {
        jdbc.update("insert into app_users (id, email, google_sub, username, email_verified_at) values (gen_random_uuid(), 'gina@example.com', 'sub-1', 'gina', current_timestamp)");
        ask("forgot-password", "gina@example.com");
        assertThat(reset(lastToken("gina@example.com"), "a brand new password")).isEqualTo(204);
        assertThat(login("gina", "a brand new password")).isEqualTo(200);
    }
}
