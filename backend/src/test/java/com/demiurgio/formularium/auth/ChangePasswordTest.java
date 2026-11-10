package com.demiurgio.formularium.auth;

import com.jayway.jsonpath.JsonPath;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * Changing the password while signed in: it needs the current one, it follows the sign-up rules, it ends every OTHER sign-in but keeps the one in use,
 * it cancels a waiting reset link, and it tells the account's address.
 */
@SpringBootTest
@AutoConfigureMockMvc
class ChangePasswordTest {

    private static final String OLD = "correct horse battery";
    private static final String NEW = "a different staple horse";

    @Autowired private MockMvc mvc;
    @Autowired private JdbcTemplate jdbc;
    @MockitoBean private EmailSender mail;
    @MockitoBean private PasswordBreachChecker breach;

    /** A signed-in browser: the access token and the refresh cookie of one sign-in. */
    private record Session(String email, String id, String token, String cookie) { }

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

    private MvcResult send(String path, String json, String token, String cookie, String ip) throws Exception {
        MockHttpServletRequestBuilder request = post(path).contentType(MediaType.APPLICATION_JSON).content(json).with(r -> { r.setRemoteAddr(ip); return r; });
        if (token != null) request.header("Authorization", "Bearer " + token);
        if (cookie != null) request.cookie(new Cookie(AuthController.REFRESH_COOKIE, cookie));
        return mvc.perform(request).andReturn();
    }

    private static int status(MvcResult r) { return r.getResponse().getStatus(); }

    private static String body(MvcResult r) throws Exception { return r.getResponse().getContentAsString(); }

    private static String errorCode(MvcResult r) throws Exception { return JsonPath.read(body(r), "$.error.code"); }

    private static String cookieOf(MvcResult r) {
        String header = r.getResponse().getHeader(HttpHeaders.SET_COOKIE);
        return header.substring(header.indexOf('=') + 1, header.indexOf(';'));
    }

    private Session register() throws Exception {
        String name = "c" + UUID.randomUUID().toString().substring(0, 8);
        String email = name + "@example.com";
        MvcResult r = send("/api/v1/auth/register", "{\"email\":\"" + email + "\",\"password\":\"" + OLD + "\",\"username\":\"" + name + "\"}", null, null, "10.40.0.1");
        assertThat(status(r)).isEqualTo(201);
        return new Session(email, JsonPath.read(body(r), "$.user.id"), JsonPath.read(body(r), "$.accessToken"), cookieOf(r));
    }

    /** Signs in again with the password: a second browser, with a sign-in of its own. */
    private Session signInAgain(Session who, String password) throws Exception {
        MvcResult r = send("/api/v1/auth/login", "{\"email\":\"" + who.email() + "\",\"password\":\"" + password + "\"}", null, null, "10.40.0.1");
        assertThat(status(r)).isEqualTo(200);
        return new Session(who.email(), who.id(), JsonPath.read(body(r), "$.accessToken"), cookieOf(r));
    }

    private MvcResult change(Session who, String current, String next) throws Exception { return change(who, current, next, who.cookie(), "10.40.0.1"); }

    private MvcResult change(Session who, String current, String next, String cookie, String ip) throws Exception {
        return send("/api/v1/auth/password", "{\"currentPassword\":\"" + current + "\",\"newPassword\":\"" + next + "\"}", who.token(), cookie, ip);
    }

    private int loginStatus(String email, String password) throws Exception {
        return status(send("/api/v1/auth/login", "{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}", null, null, "10.40.0.9"));
    }

    private int refreshStatus(String cookie) throws Exception {
        return status(mvc.perform(post("/api/v1/auth/refresh").cookie(new Cookie(AuthController.REFRESH_COOKIE, cookie))).andReturn());
    }

    private long events(String type) { return jdbc.queryForObject("select count(*) from auth_events where type = ?", Long.class, type); }

    // ---- the change

    @Test
    void theNewPasswordSignsIn_andTheOldOneNoLonger() throws Exception {
        Session m = register();
        assertThat(status(change(m, OLD, NEW))).isEqualTo(204);

        assertThat(loginStatus(m.email(), NEW)).isEqualTo(200);
        assertThat(loginStatus(m.email(), OLD)).isEqualTo(401);
        assertThat(events("password_changed")).isEqualTo(1);
    }

    @Test
    void needsTheCurrentPassword_andAWrongOneChangesNothing() throws Exception {
        Session m = register();
        Session other = signInAgain(m, OLD);

        MvcResult wrong = change(m, "not my password", NEW);

        assertThat(status(wrong)).isEqualTo(401);
        assertThat(errorCode(wrong)).isEqualTo("invalid_credentials");
        assertThat(loginStatus(m.email(), OLD)).isEqualTo(200);   // still the old one
        assertThat(loginStatus(m.email(), NEW)).isEqualTo(401);
        assertThat(refreshStatus(other.cookie())).isEqualTo(200);   // and nobody was signed out
        verify(mail, never()).send(anyString(), anyString(), anyString());
        assertThat(events("password_change_failed")).isEqualTo(1);
        assertThat(events("password_changed")).isZero();
    }

    @Test
    void guessingTheCurrentPasswordIsLimited_perAccount() throws Exception {
        Session m = register();
        for (int i = 0; i < 10; i++) assertThat(status(change(m, "wrong guess " + i, NEW, m.cookie(), "10.40.1." + i))).isEqualTo(401);   // from ten addresses
        MvcResult blocked = change(m, OLD, NEW, m.cookie(), "10.40.1.99");   // even the right one waits
        assertThat(status(blocked)).isEqualTo(429);
        assertThat(loginStatus(m.email(), OLD)).isEqualTo(200);
    }

    @Test
    void guessingIsLimitedPerAddress_acrossAccounts() throws Exception {
        // 30 wrong passwords from one address, spread over five accounts (so no single account hits its own limit of 10)
        for (int account = 0; account < 5; account++) {
            Session victim = register();
            for (int i = 0; i < 6; i++) assertThat(status(change(victim, "wrong " + i, NEW, victim.cookie(), "10.40.2.2"))).isEqualTo(401);
        }
        Session fresh = register();   // an account that has had no failures at all
        assertThat(status(change(fresh, OLD, NEW, fresh.cookie(), "10.40.2.2"))).isEqualTo(429);   // but this address has used up its share
        assertThat(status(change(fresh, OLD, NEW, fresh.cookie(), "10.40.2.3"))).isEqualTo(204);   // another address is fine
    }

    @Test
    void refusesToChangeToTheSamePassword() throws Exception {
        Session m = register();
        MvcResult same = change(m, OLD, OLD);
        assertThat(status(same)).isEqualTo(400);
        assertThat(errorCode(same)).isEqualTo("password_unchanged");
        verify(mail, never()).send(anyString(), anyString(), anyString());
    }

    @Test
    void theNewPasswordFollowsTheSignUpRules() throws Exception {
        Session m = register();

        assertThat(errorCode(change(m, OLD, "too short"))).isEqualTo("invalid_request");   // under 10 characters

        String tooManyBytes = "é".repeat(40);   // 40 characters, 80 bytes: more than bcrypt can read
        MvcResult tooLong = change(m, OLD, tooManyBytes);
        assertThat(status(tooLong)).isEqualTo(400);
        assertThat(errorCode(tooLong)).isEqualTo("password_too_long");

        when(breach.isBreached(NEW)).thenReturn(true);
        MvcResult leaked = change(m, OLD, NEW);
        assertThat(status(leaked)).isEqualTo(400);
        assertThat(errorCode(leaked)).isEqualTo("password_breached");

        assertThat(loginStatus(m.email(), OLD)).isEqualTo(200);   // none of them changed anything
        verify(mail, never()).send(anyString(), anyString(), anyString());
    }

    @Test
    void theCurrentPasswordIsNotCheckedAgainstTheBreachListUnlessItIsTheNewOne() throws Exception {
        Session m = register();
        when(breach.isBreached(OLD)).thenReturn(true);   // an old password that has since turned up in a leak
        assertThat(status(change(m, OLD, NEW))).isEqualTo(204);   // can still be changed AWAY from
    }

    // ---- the other sign-ins

    @Test
    void thisSignInStays_andEveryOtherOneEnds() throws Exception {
        Session phone = register();
        Session laptop = signInAgain(phone, OLD);
        Session tablet = signInAgain(phone, OLD);

        assertThat(status(change(phone, OLD, NEW))).isEqualTo(204);

        assertThat(refreshStatus(phone.cookie())).isEqualTo(200);    // the one that made the change carries on
        assertThat(refreshStatus(laptop.cookie())).isEqualTo(401);   // a lost laptop, or somebody who had the old password, is out
        assertThat(refreshStatus(tablet.cookie())).isEqualTo(401);
    }

    @Test
    void whenThisSignInCannotBeIdentified_everySignInEnds_andThePageAsksForAnotherSignIn() throws Exception {
        Session m = register();
        Session other = signInAgain(m, OLD);

        assertThat(status(change(m, OLD, NEW, null, "10.40.0.1"))).isEqualTo(204);   // no refresh cookie came with the request

        assertThat(refreshStatus(m.cookie())).isEqualTo(401);
        assertThat(refreshStatus(other.cookie())).isEqualTo(401);
        assertThat(loginStatus(m.email(), NEW)).isEqualTo(200);   // and signing in with the new password works
    }

    @Test
    void anotherMembersRefreshCookieDoesNotCount_asThisSignIn() throws Exception {
        Session m = register();
        Session stranger = register();
        assertThat(status(change(m, OLD, NEW, stranger.cookie(), "10.40.0.1"))).isEqualTo(204);

        assertThat(refreshStatus(m.cookie())).isEqualTo(401);          // not mistaken for the one in use
        assertThat(refreshStatus(stranger.cookie())).isEqualTo(200);   // and the other member's session is untouched
    }

    // ---- what else changes, and what does not

    @Test
    void aWaitingResetLinkIsCancelled() throws Exception {
        Session m = register();
        send("/api/v1/auth/forgot-password", "{\"email\":\"" + m.email() + "\"}", null, null, "10.40.0.1");
        assertThat(jdbc.queryForObject("select count(*) from email_tokens where purpose = 'reset' and used_at is null", Long.class)).isEqualTo(1);

        change(m, OLD, NEW);

        assertThat(jdbc.queryForObject("select count(*) from email_tokens where purpose = 'reset' and used_at is null", Long.class)).isZero();
    }

    @Test
    void theAccountsAddressIsToldOnce_withWhatToDoIfItWasNotThem() throws Exception {
        Session m = register();
        clearInvocations(mail);

        change(m, OLD, NEW);

        verify(mail, times(1)).send(eq(m.email()), eq("Your Formularium password was changed"), contains("If it was not you"));
        verify(mail).send(anyString(), anyString(), contains("Forgot your password?"));
    }

    @Test
    void twoStepVerificationAndPasskeysAreLeftAsTheyWere() throws Exception {
        Session m = register();
        String secret = JsonPath.read(body(send("/api/v1/auth/mfa/setup", "{\"password\":\"" + OLD + "\"}", m.token(), null, "10.40.0.1")), "$.secret");
        String code = Totp.code(Totp.fromBase32(secret), Totp.stepAt(Instant.now()));
        assertThat(status(send("/api/v1/auth/mfa/enable", "{\"code\":\"" + code + "\"}", m.token(), null, "10.40.0.1"))).isEqualTo(200);
        jdbc.update("insert into passkeys (user_id, credential_id, public_key, name) values (?::uuid, 'cred-1', 'a2V5', 'Phone')", m.id());

        assertThat(status(change(m, OLD, NEW))).isEqualTo(204);

        MvcResult login = send("/api/v1/auth/login", "{\"email\":\"" + m.email() + "\",\"password\":\"" + NEW + "\"}", null, null, "10.40.0.9");
        assertThat((Boolean) JsonPath.read(body(login), "$.mfa_required")).isTrue();   // the new password still has to give a code
        assertThat(jdbc.queryForObject("select count(*) from passkeys", Long.class)).isEqualTo(1);
    }

    // ---- who may use it

    @Test
    void aGoogleOnlyAccountHasNothingToChange_andIsPointedToTheEmailRoute() throws Exception {
        Session m = register();
        jdbc.update("update app_users set password_hash = null where id = ?::uuid", m.id());   // as an account made through Google is

        MvcResult result = change(m, OLD, NEW);

        assertThat(status(result)).isEqualTo(409);
        assertThat(errorCode(result)).isEqualTo("no_password");
        assertThat((String) JsonPath.read(body(result), "$.error.message")).contains("Forgot your password?");
        assertThat(jdbc.queryForObject("select password_hash is null from app_users where id = ?::uuid", Boolean.class, m.id())).isTrue();   // an access token alone cannot set one
    }

    @Test
    void theClientIsToldWhetherTheAccountHasAPassword() throws Exception {
        Session m = register();
        MvcResult me = mvc.perform(get("/api/v1/auth/me").header("Authorization", "Bearer " + m.token())).andReturn();
        assertThat((Boolean) JsonPath.read(body(me), "$.hasPassword")).isTrue();
        assertThat(body(me)).doesNotContain("password_hash").doesNotContain("passwordHash");

        jdbc.update("update app_users set password_hash = null where id = ?::uuid", m.id());
        me = mvc.perform(get("/api/v1/auth/me").header("Authorization", "Bearer " + m.token())).andReturn();
        assertThat((Boolean) JsonPath.read(body(me), "$.hasPassword")).isFalse();
    }

    @Test
    void aGuestCannotChangeAPassword_andNobodyUnknownCan() throws Exception {
        MvcResult guest = send("/api/v1/auth/guest", "{}", null, null, "10.40.0.1");
        String token = JsonPath.read(body(guest), "$.accessToken");
        assertThat((Boolean) JsonPath.read(body(guest), "$.user.hasPassword")).isFalse();
        MvcResult refused = send("/api/v1/auth/password", "{\"currentPassword\":\"x\",\"newPassword\":\"" + NEW + "\"}", token, null, "10.40.0.1");
        assertThat(status(refused)).isEqualTo(403);
        assertThat(errorCode(refused)).isEqualTo("guest_account");

        assertThat(status(send("/api/v1/auth/password", "{\"currentPassword\":\"x\",\"newPassword\":\"" + NEW + "\"}", null, null, "10.40.0.1"))).isEqualTo(401);
    }
}
