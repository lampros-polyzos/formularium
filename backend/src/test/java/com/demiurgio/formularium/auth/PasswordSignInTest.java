package com.demiurgio.formularium.auth;

import com.jayway.jsonpath.JsonPath;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
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
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.time.Instant;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * Switching password sign-in off: what makes an account phishing-proof, and so what must never lock its owner out. Each test is a rule: it needs a passkey that has
 * signed in before, it needs the password, a refused password says so only when it was right, it ends the other sign-ins, the last working passkey stays, and a
 * password reset by email is the way back.
 */
@SpringBootTest
@AutoConfigureMockMvc
class PasswordSignInTest {

    private static final String PASSWORD = "correct horse battery";
    private static final JsonMapper JSON = JsonMapper.builder().build();

    @Autowired private MockMvc mvc;
    @Autowired private JdbcTemplate jdbc;
    @MockitoBean private EmailSender mail;

    private record Session(String email, String id, String token, String cookie) { }

    @BeforeEach
    void clean() {
        jdbc.update("delete from auth_events");
        jdbc.update("delete from webauthn_challenges");
        jdbc.update("delete from email_tokens");
        jdbc.update("delete from refresh_tokens");
        jdbc.update("delete from app_users");
        clearInvocations(mail);
    }

    // ---- helpers

    private MvcResult call(String path, String json, String token, String cookie, String ip) throws Exception {
        MockHttpServletRequestBuilder request = post(path).contentType(MediaType.APPLICATION_JSON).content(json).with(r -> { r.setRemoteAddr(ip); return r; });
        if (token != null) request.header("Authorization", "Bearer " + token);
        if (cookie != null) request.cookie(new Cookie(AuthController.REFRESH_COOKIE, cookie));
        return mvc.perform(request).andReturn();
    }

    private MvcResult call(String path, String json, String token) throws Exception { return call(path, json, token, null, "10.50.0.1"); }

    private static int status(MvcResult r) { return r.getResponse().getStatus(); }

    private static String body(MvcResult r) throws Exception { return r.getResponse().getContentAsString(); }

    private static String errorCode(MvcResult r) throws Exception { return JsonPath.read(body(r), "$.error.code"); }

    private static String cookieOf(MvcResult r) {
        String header = r.getResponse().getHeader(HttpHeaders.SET_COOKIE);
        return header.substring(header.indexOf('=') + 1, header.indexOf(';'));
    }

    private static Session sessionOf(String email, MvcResult r) throws Exception {
        return new Session(email, JsonPath.read(body(r), "$.user.id"), JsonPath.read(body(r), "$.accessToken"), cookieOf(r));
    }

    private Session register() throws Exception {
        String name = "s" + UUID.randomUUID().toString().substring(0, 8);
        String email = name + "@example.com";
        MvcResult r = call("/api/v1/auth/register", "{\"email\":\"" + email + "\",\"password\":\"" + PASSWORD + "\",\"username\":\"" + name + "\"}", null);
        assertThat(status(r)).isEqualTo(201);
        return sessionOf(email, r);
    }

    private MvcResult passwordLogin(String email, String password) throws Exception {
        return call("/api/v1/auth/login", "{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}", null, null, "10.50.0.9");
    }

    private void addPasskey(Session m, SoftwarePasskey key) throws Exception {
        MvcResult options = call("/api/v1/auth/passkeys/registration/options", "{\"password\":\"" + PASSWORD + "\"}", m.token());
        assertThat(status(options)).isEqualTo(200);
        JsonNode root = JSON.readTree(body(options));
        MvcResult added = call("/api/v1/auth/passkeys/registration", "{\"challengeId\":\"" + root.get("challengeId").asString() + "\",\"credential\":" + key.create(root.get("options")) + ",\"name\":\"Key\"}", m.token());
        assertThat(status(added)).isEqualTo(201);
    }

    /** Signs in with the passkey, which is what proves it works (and what the server counts as "has signed in before"). */
    private MvcResult passkeySignIn(SoftwarePasskey key) throws Exception {
        MvcResult options = call("/api/v1/auth/login/passkey/options", "", null);
        assertThat(status(options)).isEqualTo(200);
        JsonNode root = JSON.readTree(body(options));
        return call("/api/v1/auth/login/passkey", "{\"challengeId\":\"" + root.get("challengeId").asString() + "\",\"credential\":" + key.get(root.get("options")) + "}", null);
    }

    private MvcResult setPasswordSignIn(Session who, boolean enabled, String password) throws Exception {
        return setPasswordSignIn(who, enabled, password, who.cookie(), "10.50.0.1");
    }

    private MvcResult setPasswordSignIn(Session who, boolean enabled, String password, String cookie, String ip) throws Exception {
        return call("/api/v1/auth/password-sign-in", "{\"enabled\":" + enabled + ",\"password\":" + (password == null ? "null" : "\"" + password + "\"") + "}", who.token(), cookie, ip);
    }

    private int refreshStatus(String cookie) throws Exception {
        return status(mvc.perform(post("/api/v1/auth/refresh").cookie(new Cookie(AuthController.REFRESH_COOKIE, cookie))).andReturn());
    }

    private long events(String type) { return jdbc.queryForObject("select count(*) from auth_events where type = ?", Long.class, type); }

    private boolean passwordLoginOff(Session m) { return jdbc.queryForObject("select password_login_disabled_at is not null from app_users where id = ?::uuid", Boolean.class, m.id()); }

    /** A member with a passkey that has signed in, who is signed in with it: the state in which password sign-in may be switched off. */
    private record Ready(Session member, SoftwarePasskey key, Session viaPasskey) { }

    private Ready ready() throws Exception {
        Session m = register();
        SoftwarePasskey key = SoftwarePasskey.forThisSite();
        addPasskey(m, key);
        MvcResult signedIn = passkeySignIn(key);
        assertThat(status(signedIn)).isEqualTo(200);
        return new Ready(m, key, sessionOf(m.email(), signedIn));
    }

    // ---- switching it off: the conditions

    @Test
    void cannotBeSwitchedOffWithoutAPasskeyThatHasSignedInBefore() throws Exception {
        Session m = register();
        MvcResult none = setPasswordSignIn(m, false, PASSWORD);
        assertThat(status(none)).isEqualTo(409);
        assertThat(errorCode(none)).isEqualTo("passkey_not_proven");

        SoftwarePasskey key = SoftwarePasskey.forThisSite();
        addPasskey(m, key);   // registered, but never used to sign in: it might not work on the next device
        MvcResult unproven = setPasswordSignIn(m, false, PASSWORD);
        assertThat(status(unproven)).isEqualTo(409);
        assertThat(errorCode(unproven)).isEqualTo("passkey_not_proven");
        assertThat((String) JsonPath.read(body(unproven), "$.error.message")).contains("Sign in with a passkey once first");
        assertThat(passwordLoginOff(m)).isFalse();

        assertThat(status(passkeySignIn(key))).isEqualTo(200);   // now it is proven
        assertThat(status(setPasswordSignIn(m, false, PASSWORD))).isEqualTo(204);
        assertThat(passwordLoginOff(m)).isTrue();
    }

    @Test
    void needsThePassword_andWrongOnesAreLimitedWithTheOtherPasswordChecks() throws Exception {
        Ready r = ready();
        assertThat(status(setPasswordSignIn(r.viaPasskey(), false, "not the password"))).isEqualTo(401);
        assertThat(status(setPasswordSignIn(r.viaPasskey(), false, null))).isEqualTo(401);
        assertThat(passwordLoginOff(r.member())).isFalse();
        assertThat(events("password_change_failed")).isEqualTo(2);

        for (int i = 0; i < 8; i++) setPasswordSignIn(r.viaPasskey(), false, "wrong " + i, r.viaPasskey().cookie(), "10.50.3." + i);
        assertThat(status(setPasswordSignIn(r.viaPasskey(), false, PASSWORD, r.viaPasskey().cookie(), "10.50.3.99"))).isEqualTo(429);   // even the right one waits
        assertThat(passwordLoginOff(r.member())).isFalse();
    }

    @Test
    void anAccountWithNoPasswordHasNothingToSwitchOff() throws Exception {
        Ready r = ready();
        jdbc.update("update app_users set password_hash = null where id = ?::uuid", r.member().id());
        MvcResult result = setPasswordSignIn(r.viaPasskey(), false, PASSWORD);
        assertThat(status(result)).isEqualTo(409);
        assertThat(errorCode(result)).isEqualTo("no_password");
    }

    @Test
    void aGuestCannotUseIt_andNobodyUnknownCan() throws Exception {
        MvcResult guest = call("/api/v1/auth/guest", "{}", null);
        MvcResult refused = call("/api/v1/auth/password-sign-in", "{\"enabled\":false,\"password\":\"x\"}", JsonPath.read(body(guest), "$.accessToken"));
        assertThat(status(refused)).isEqualTo(403);
        assertThat(errorCode(refused)).isEqualTo("guest_account");
        assertThat(status(call("/api/v1/auth/password-sign-in", "{\"enabled\":false,\"password\":\"x\"}", null))).isEqualTo(401);
    }

    // ---- what it does once it is off

    @Test
    void theRightPasswordIsRefused_withAMessageThatTellsAGuesserNothing() throws Exception {
        Ready r = ready();
        setPasswordSignIn(r.viaPasskey(), false, PASSWORD);
        long loginsBefore = events("login_success");

        MvcResult refused = passwordLogin(r.member().email(), PASSWORD);

        assertThat(status(refused)).isEqualTo(403);
        assertThat(errorCode(refused)).isEqualTo("password_sign_in_off");
        assertThat((String) JsonPath.read(body(refused), "$.error.message")).contains("Sign in with a passkey");
        assertThat(refused.getResponse().getHeader(HttpHeaders.SET_COOKIE)).isNull();   // no session, no cookie
        assertThat(events("login_success")).isEqualTo(loginsBefore);
        assertThat(events("password_login_refused")).isEqualTo(1);
        assertThat(events("login_failed")).isZero();   // nothing was guessed, so nothing counts against the owner

        // a WRONG password, and an unknown address, are answered exactly as they always were
        MvcResult wrong = passwordLogin(r.member().email(), "not the password");
        assertThat(status(wrong)).isEqualTo(401);
        assertThat(errorCode(wrong)).isEqualTo("invalid_credentials");
        MvcResult unknown = passwordLogin("nobody@example.com", PASSWORD);
        assertThat(status(unknown)).isEqualTo(401);
        assertThat((String) JsonPath.read(body(unknown), "$.error.message")).isEqualTo(JsonPath.read(body(wrong), "$.error.message"));
    }

    @Test
    void aPasskeyStillSignsIn() throws Exception {
        Ready r = ready();
        setPasswordSignIn(r.viaPasskey(), false, PASSWORD);
        assertThat(status(passkeySignIn(r.key()))).isEqualTo(200);
    }

    @Test
    void twoStepVerificationIsNeverReached_becauseTheRefusalComesFirst() throws Exception {
        Ready r = ready();
        String secret = JsonPath.read(body(call("/api/v1/auth/mfa/setup", "{\"password\":\"" + PASSWORD + "\"}", r.viaPasskey().token())), "$.secret");
        String code = Totp.code(Totp.fromBase32(secret), Totp.stepAt(Instant.now()));
        assertThat(status(call("/api/v1/auth/mfa/enable", "{\"code\":\"" + code + "\"}", r.viaPasskey().token()))).isEqualTo(200);
        setPasswordSignIn(r.viaPasskey(), false, PASSWORD);

        MvcResult refused = passwordLogin(r.member().email(), PASSWORD);

        assertThat(status(refused)).isEqualTo(403);
        assertThat(errorCode(refused)).isEqualTo("password_sign_in_off");
        assertThat(jdbc.queryForObject("select count(*) from mfa_challenges", Long.class)).isZero();   // no code was asked for, so none could be relayed either
    }

    @Test
    void switchingItOffEndsEveryOtherSignIn_butKeepsTheOneInUse() throws Exception {
        Ready r = ready();                                                        // the passkey sign-in is the session in use
        Session byPassword = new Session(r.member().email(), r.member().id(), null, cookieOf(passwordLogin(r.member().email(), PASSWORD)));   // a second browser, opened with the password

        assertThat(status(setPasswordSignIn(r.viaPasskey(), false, PASSWORD))).isEqualTo(204);

        assertThat(refreshStatus(r.viaPasskey().cookie())).isEqualTo(200);        // this one carries on
        assertThat(refreshStatus(byPassword.cookie())).isEqualTo(401);            // somebody who got in with the password earlier is out
        assertThat(refreshStatus(r.member().cookie())).isEqualTo(401);            // as is the original sign-up session
    }

    @Test
    void theAccountsAddressIsToldWhenItIsSwitchedOff_andWhenItIsSwitchedBackOn() throws Exception {
        Ready r = ready();
        clearInvocations(mail);

        setPasswordSignIn(r.viaPasskey(), false, PASSWORD);
        ArgumentCaptor<String> off = ArgumentCaptor.forClass(String.class);
        verify(mail, times(1)).send(eq(r.member().email()), eq("Password sign-in was turned off on your Formularium account"), off.capture());
        assertThat(off.getValue()).contains("If it was not you").contains("Forgot your password?").contains("passkey");

        setPasswordSignIn(r.viaPasskey(), true, PASSWORD);
        verify(mail, times(1)).send(eq(r.member().email()), eq("Password sign-in was turned back on for your Formularium account"), anyString());
    }

    // ---- switching it back on

    @Test
    void switchingItBackOnNeedsThePassword_andRestoresPasswordSignInWithoutSigningAnyoneOut() throws Exception {
        Ready r = ready();
        setPasswordSignIn(r.viaPasskey(), false, PASSWORD);
        assertThat(status(setPasswordSignIn(r.viaPasskey(), true, "not the password"))).isEqualTo(401);
        assertThat(passwordLoginOff(r.member())).isTrue();

        assertThat(status(setPasswordSignIn(r.viaPasskey(), true, PASSWORD))).isEqualTo(204);

        assertThat(passwordLoginOff(r.member())).isFalse();
        assertThat(status(passwordLogin(r.member().email(), PASSWORD))).isEqualTo(200);
        assertThat(refreshStatus(r.viaPasskey().cookie())).isEqualTo(200);   // turning it on ends nothing
        assertThat(events("password_login_disabled")).isEqualTo(1);
        assertThat(events("password_login_enabled")).isEqualTo(1);
    }

    @Test
    void askingForTheStateItAlreadyHasChangesNothing_signsNobodyOut_andSendsNoEmail() throws Exception {
        Ready r = ready();
        clearInvocations(mail);
        assertThat(status(setPasswordSignIn(r.viaPasskey(), true, PASSWORD))).isEqualTo(204);   // already on
        assertThat(events("password_login_enabled")).isZero();

        setPasswordSignIn(r.viaPasskey(), false, PASSWORD);
        clearInvocations(mail);
        Session other = new Session(r.member().email(), r.member().id(), null, r.viaPasskey().cookie());
        assertThat(status(setPasswordSignIn(r.viaPasskey(), false, PASSWORD))).isEqualTo(204);   // already off
        verify(mail, never()).send(anyString(), anyString(), anyString());
        assertThat(events("password_login_disabled")).isEqualTo(1);
        assertThat(refreshStatus(other.cookie())).isEqualTo(200);
    }

    @Test
    void aPasswordResetByEmailIsTheWayBackIn_itSwitchesItOnAndSignsEverythingOut() throws Exception {
        Ready r = ready();
        setPasswordSignIn(r.viaPasskey(), false, PASSWORD);
        assertThat(status(passwordLogin(r.member().email(), PASSWORD))).isEqualTo(403);   // locked out of the password, as designed

        clearInvocations(mail);
        call("/api/v1/auth/forgot-password", "{\"email\":\"" + r.member().email() + "\"}", null);
        ArgumentCaptor<String> link = ArgumentCaptor.forClass(String.class);
        verify(mail, atLeastOnce()).send(eq(r.member().email()), eq("Reset your Formularium password"), link.capture());
        Matcher token = Pattern.compile("token=([A-Za-z0-9_-]+)").matcher(link.getValue());
        assertThat(token.find()).isTrue();
        String fresh = "a brand new passphrase";
        assertThat(status(call("/api/v1/auth/reset-password", "{\"token\":\"" + token.group(1) + "\",\"password\":\"" + fresh + "\"}", null))).isEqualTo(204);

        assertThat(passwordLoginOff(r.member())).isFalse();
        assertThat(status(passwordLogin(r.member().email(), fresh))).isEqualTo(200);
        assertThat(refreshStatus(r.viaPasskey().cookie())).isEqualTo(401);   // a reset signs every device out, as it always did
    }

    @Test
    void changingThePasswordWhileItIsOffDoesNotSwitchItOn() throws Exception {
        Ready r = ready();
        setPasswordSignIn(r.viaPasskey(), false, PASSWORD);
        assertThat(status(call("/api/v1/auth/password", "{\"currentPassword\":\"" + PASSWORD + "\",\"newPassword\":\"another good phrase\"}", r.viaPasskey().token(), r.viaPasskey().cookie(), "10.50.0.1"))).isEqualTo(204);
        assertThat(passwordLoginOff(r.member())).isTrue();
        assertThat(status(passwordLogin(r.member().email(), "another good phrase"))).isEqualTo(403);
    }

    // ---- never leave the account with no way in

    @Test
    void whileItIsOff_theLastPasskeyKnownToWorkCannotBeRemoved() throws Exception {
        Ready r = ready();
        SoftwarePasskey second = SoftwarePasskey.forThisSite();
        addPasskey(r.viaPasskey(), second);   // registered, never used
        setPasswordSignIn(r.viaPasskey(), false, PASSWORD);
        String firstId = jdbc.queryForObject("select id::text from passkeys where last_used_at is not null", String.class);
        String secondId = jdbc.queryForObject("select id::text from passkeys where last_used_at is null", String.class);

        // removing the only proven one would leave a passkey nobody has seen work
        MvcResult blocked = call("/api/v1/auth/passkeys/" + firstId + "/remove", "{\"password\":\"" + PASSWORD + "\"}", r.viaPasskey().token());
        assertThat(status(blocked)).isEqualTo(409);
        assertThat(errorCode(blocked)).isEqualTo("last_passkey");

        // the unproven one can go (a proven one stays), and once the second has worked, the first can be removed
        assertThat(status(call("/api/v1/auth/passkeys/" + secondId + "/remove", "{\"password\":\"" + PASSWORD + "\"}", r.viaPasskey().token()))).isEqualTo(204);
        addPasskey(r.viaPasskey(), SoftwarePasskey.forThisSite());
        // the removal that was refused still is: one proven passkey left
        assertThat(status(call("/api/v1/auth/passkeys/" + firstId + "/remove", "{\"password\":\"" + PASSWORD + "\"}", r.viaPasskey().token()))).isEqualTo(409);
        assertThat(jdbc.queryForObject("select count(*) from passkeys where id = ?::uuid", Long.class, firstId)).isEqualTo(1);
    }

    @Test
    void aSecondProvenPasskeyMakesTheFirstRemovable_andPasswordSignInOnMakesAnyRemovable() throws Exception {
        Ready r = ready();
        SoftwarePasskey second = SoftwarePasskey.forThisSite();
        addPasskey(r.viaPasskey(), second);
        assertThat(status(passkeySignIn(second))).isEqualTo(200);   // both have now signed in
        setPasswordSignIn(r.viaPasskey(), false, PASSWORD);
        String firstId = jdbc.queryForObject("select p.id::text from passkeys p where credential_id = ?", String.class, r.key().credentialId());

        assertThat(status(call("/api/v1/auth/passkeys/" + firstId + "/remove", "{\"password\":\"" + PASSWORD + "\"}", r.viaPasskey().token()))).isEqualTo(204);

        String lastId = jdbc.queryForObject("select id::text from passkeys", String.class);
        assertThat(status(call("/api/v1/auth/passkeys/" + lastId + "/remove", "{\"password\":\"" + PASSWORD + "\"}", r.viaPasskey().token()))).isEqualTo(409);   // now it is the last
        setPasswordSignIn(r.viaPasskey(), true, PASSWORD);
        assertThat(status(call("/api/v1/auth/passkeys/" + lastId + "/remove", "{\"password\":\"" + PASSWORD + "\"}", r.viaPasskey().token()))).isEqualTo(204);   // with the password on, nothing is at risk
    }

    // ---- what the settings screen is told

    @Test
    void theSettingsScreenIsToldTheStateAndWhetherItMayBeSwitchedOff() throws Exception {
        Session m = register();
        JsonNode fresh = JSON.readTree(body(mvc.perform(get("/api/v1/auth/passkeys").header("Authorization", "Bearer " + m.token())).andReturn()));
        assertThat(fresh.get("passwordSignInOn").asBoolean()).isTrue();    // everyone starts as they are today
        assertThat(fresh.get("hasUsedPasskey").asBoolean()).isFalse();

        SoftwarePasskey key = SoftwarePasskey.forThisSite();
        addPasskey(m, key);
        JsonNode added = JSON.readTree(body(mvc.perform(get("/api/v1/auth/passkeys").header("Authorization", "Bearer " + m.token())).andReturn()));
        assertThat(added.get("hasUsedPasskey").asBoolean()).isFalse();

        Session viaPasskey = sessionOf(m.email(), passkeySignIn(key));
        setPasswordSignIn(viaPasskey, false, PASSWORD);
        JsonNode off = JSON.readTree(body(mvc.perform(get("/api/v1/auth/passkeys").header("Authorization", "Bearer " + viaPasskey.token())).andReturn()));
        assertThat(off.get("passwordSignInOn").asBoolean()).isFalse();
        assertThat(off.get("hasUsedPasskey").asBoolean()).isTrue();
    }
}
