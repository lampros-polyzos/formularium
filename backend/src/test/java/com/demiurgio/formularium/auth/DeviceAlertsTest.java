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

import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * "A sign-in from a browser we have not seen": the owner is emailed. Each test is a rule: the first browser is learnt silently, a known browser is quiet, a new one
 * is reported once, a cookie of someone else's does not count, the email is capped per day, and nothing here can make a sign-in fail.
 */
@SpringBootTest
@AutoConfigureMockMvc
class DeviceAlertsTest {

    private static final String PASSWORD = "correct horse battery";
    private static final String SUBJECT = "New sign-in to your Formularium account";
    private static final String CHROME_ON_WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
    private static final JsonMapper JSON = JsonMapper.builder().build();

    @Autowired private MockMvc mvc;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private DeviceService devices;
    @MockitoBean private EmailSender mail;

    /** What a browser holds after a sign-in. */
    private record Browser(String email, String id, String device, String refresh) { }

    @BeforeEach
    void clean() {
        jdbc.update("delete from auth_events");
        jdbc.update("delete from webauthn_challenges");
        jdbc.update("delete from email_tokens");
        jdbc.update("delete from refresh_tokens");
        jdbc.update("delete from app_users");   // known devices go with their accounts
        clearInvocations(mail);
    }

    // ---- helpers

    private MvcResult call(String path, String json, String deviceCookie, String ip, String userAgent) throws Exception {
        MockHttpServletRequestBuilder request = post(path).contentType(MediaType.APPLICATION_JSON).content(json).with(r -> { r.setRemoteAddr(ip); return r; });
        if (deviceCookie != null) request.cookie(new Cookie(AuthController.DEVICE_COOKIE, deviceCookie));
        if (userAgent != null) request.header(HttpHeaders.USER_AGENT, userAgent);
        return mvc.perform(request).andReturn();
    }

    private static int status(MvcResult r) { return r.getResponse().getStatus(); }

    private static String body(MvcResult r) throws Exception { return r.getResponse().getContentAsString(); }

    private static String cookieNamed(MvcResult r, String name) {
        return r.getResponse().getHeaders(HttpHeaders.SET_COOKIE).stream().filter(h -> h.startsWith(name + "=")).findFirst()
                .map(h -> h.substring(h.indexOf('=') + 1, h.indexOf(';'))).orElse(null);
    }

    private static String headerNamed(MvcResult r, String name) {
        return r.getResponse().getHeaders(HttpHeaders.SET_COOKIE).stream().filter(h -> h.startsWith(name + "=")).findFirst().orElse(null);
    }

    private static Browser browserOf(String email, MvcResult r) throws Exception {
        return new Browser(email, JsonPath.read(body(r), "$.user.id"), cookieNamed(r, AuthController.DEVICE_COOKIE), cookieNamed(r, AuthController.REFRESH_COOKIE));
    }

    private Browser register(String deviceCookie) throws Exception {
        String name = "d" + UUID.randomUUID().toString().substring(0, 8);
        String email = name + "@example.com";
        MvcResult r = call("/api/v1/auth/register", "{\"email\":\"" + email + "\",\"password\":\"" + PASSWORD + "\",\"username\":\"" + name + "\"}", deviceCookie, "10.60.0.1", CHROME_ON_WINDOWS);
        assertThat(status(r)).isEqualTo(201);
        return browserOf(email, r);
    }

    private MvcResult login(String email, String password, String deviceCookie, String ip, String userAgent) throws Exception {
        return call("/api/v1/auth/login", "{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}", deviceCookie, ip, userAgent);
    }

    private Browser signIn(Browser who, String deviceCookie, String ip, String userAgent) throws Exception {
        MvcResult r = login(who.email(), PASSWORD, deviceCookie, ip, userAgent);
        assertThat(status(r)).isEqualTo(200);
        return browserOf(who.email(), r);
    }

    private long devicesOf(Browser who) { return jdbc.queryForObject("select count(*) from known_devices where user_id = ?::uuid", Long.class, who.id()); }

    private long alertEvents(Browser who) { return jdbc.queryForObject("select count(*) from auth_events where type = 'new_device_sign_in' and user_id = ?::uuid", Long.class, who.id()); }

    // ---- the first browser, and a known one

    @Test
    void theFirstBrowserIsLearntSilently_andGetsACookie() throws Exception {
        MvcResult r = call("/api/v1/auth/register", "{\"email\":\"first@example.com\",\"password\":\"" + PASSWORD + "\",\"username\":\"first\"}", null, "10.60.0.1", CHROME_ON_WINDOWS);

        assertThat(status(r)).isEqualTo(201);
        String cookie = headerNamed(r, AuthController.DEVICE_COOKIE);
        assertThat(cookie).isNotNull().contains("HttpOnly").contains("Path=/api/v1/auth").contains("SameSite=Lax").contains("Max-Age=34560000");   // 400 days
        assertThat(cookieNamed(r, AuthController.DEVICE_COOKIE)).hasSize(43);   // 256 random bits
        assertThat(r.getResponse().getHeaders(HttpHeaders.SET_COOKIE).get(0)).startsWith(AuthController.REFRESH_COOKIE + "=");   // the refresh cookie still comes first
        verify(mail, never()).send(anyString(), eq(SUBJECT), anyString());
        assertThat(jdbc.queryForObject("select count(*) from known_devices", Long.class)).isEqualTo(1);
    }

    @Test
    void aKnownBrowserIsQuiet_everyTime() throws Exception {
        Browser m = register(null);
        for (int i = 0; i < 3; i++) {
            Browser again = signIn(m, m.device(), "10.60.0.2", CHROME_ON_WINDOWS);
            assertThat(again.device()).isEqualTo(m.device());   // it is kept, not replaced
        }
        verify(mail, never()).send(anyString(), eq(SUBJECT), anyString());
        assertThat(devicesOf(m)).isEqualTo(1);
        assertThat(alertEvents(m)).isZero();
    }

    @Test
    void anAccountFromBeforeTheFeatureLearnsItsFirstBrowserSilently_andReportsTheNext() throws Exception {
        Browser m = register(null);
        jdbc.update("delete from known_devices");   // as an account that existed before this feature has none

        Browser first = signIn(m, null, "10.60.0.3", CHROME_ON_WINDOWS);
        verify(mail, never()).send(anyString(), eq(SUBJECT), anyString());   // nothing to compare with: no flood of alerts when this ships
        assertThat(devicesOf(m)).isEqualTo(1);

        signIn(m, null, "10.60.0.4", CHROME_ON_WINDOWS);   // a different browser from the one just learnt
        verify(mail, times(1)).send(eq(m.email()), eq(SUBJECT), anyString());
        assertThat(first.device()).isNotNull();
    }

    // ---- a new browser

    @Test
    void aNewBrowserIsReportedOnce_withWhenWhatWhereAndHow() throws Exception {
        Browser m = register(null);
        clearInvocations(mail);

        Browser fresh = signIn(m, null, "203.0.113.9", CHROME_ON_WINDOWS);

        ArgumentCaptor<String> text = ArgumentCaptor.forClass(String.class);
        verify(mail, times(1)).send(eq(m.email()), eq(SUBJECT), text.capture());
        assertThat(text.getValue()).contains("a browser we have not seen before").contains("Browser: Chrome on Windows").contains("Network address: 203.0.113.9")
                .contains("Signed in with: your password").contains("UTC").contains("If it was not you").contains("change your password").contains("Forgot your password?");
        assertThat(text.getValue()).doesNotContain(PASSWORD).doesNotContain(fresh.device()).doesNotContain(fresh.refresh());   // nothing secret is in the email
        assertThat(fresh.device()).isNotEqualTo(m.device());   // it is given its own identifier
        assertThat(alertEvents(m)).isEqualTo(1);
        assertThat(devicesOf(m)).isEqualTo(2);

        clearInvocations(mail);
        signIn(m, fresh.device(), "203.0.113.9", CHROME_ON_WINDOWS);   // and now it is known
        verify(mail, never()).send(anyString(), eq(SUBJECT), anyString());
    }

    @Test
    void theAlertSaysHowThePersonSignedIn_forTwoStepVerificationAndPasskeys() throws Exception {
        Browser m = register(null);
        String secret = JsonPath.read(body(authorised(m, "/api/v1/auth/mfa/setup", "{\"password\":\"" + PASSWORD + "\"}")), "$.secret");
        String code = Totp.code(Totp.fromBase32(secret), Totp.stepAt(Instant.now()));
        assertThat(status(authorised(m, "/api/v1/auth/mfa/enable", "{\"code\":\"" + code + "\"}"))).isEqualTo(200);
        clearInvocations(mail);

        // the password step alone starts no session, sets no cookie and reports nothing: nobody has signed in yet
        MvcResult first = login(m.email(), PASSWORD, null, "198.51.100.7", CHROME_ON_WINDOWS);
        String challenge = JsonPath.read(body(first), "$.mfa_token");
        assertThat(headerNamed(first, AuthController.DEVICE_COOKIE)).isNull();
        verify(mail, never()).send(anyString(), eq(SUBJECT), anyString());

        String nextCode = Totp.code(Totp.fromBase32(secret), Totp.stepAt(Instant.now().plus(30, ChronoUnit.SECONDS)));
        MvcResult done = call("/api/v1/auth/login/mfa", "{\"mfaToken\":\"" + challenge + "\",\"code\":\"" + nextCode + "\"}", null, "198.51.100.7", CHROME_ON_WINDOWS);
        assertThat(status(done)).isEqualTo(200);
        ArgumentCaptor<String> text = ArgumentCaptor.forClass(String.class);
        verify(mail, times(1)).send(eq(m.email()), eq(SUBJECT), text.capture());
        assertThat(text.getValue()).contains("Signed in with: two-step verification").contains("198.51.100.7");   // only after the code
    }

    @Test
    void aPasskeySignInIsReportedToo() throws Exception {
        Browser m = register(null);
        SoftwarePasskey key = SoftwarePasskey.forThisSite();
        JsonNode options = JSON.readTree(body(authorised(m, "/api/v1/auth/passkeys/registration/options", "{\"password\":\"" + PASSWORD + "\"}")));
        assertThat(status(authorised(m, "/api/v1/auth/passkeys/registration", "{\"challengeId\":\"" + options.get("challengeId").asString() + "\",\"credential\":" + key.create(options.get("options")) + ",\"name\":\"Key\"}"))).isEqualTo(201);
        clearInvocations(mail);

        JsonNode start = JSON.readTree(body(call("/api/v1/auth/login/passkey/options", "", null, "198.51.100.20", CHROME_ON_WINDOWS)));
        MvcResult signed = call("/api/v1/auth/login/passkey", "{\"challengeId\":\"" + start.get("challengeId").asString() + "\",\"credential\":" + key.get(start.get("options")) + "}", null, "198.51.100.20", CHROME_ON_WINDOWS);

        assertThat(status(signed)).isEqualTo(200);
        verify(mail, times(1)).send(eq(m.email()), eq(SUBJECT), contains("Signed in with: a passkey"));
        assertThat(cookieNamed(signed, AuthController.DEVICE_COOKIE)).isNotNull();
    }

    private MvcResult authorised(Browser m, String path, String json) throws Exception {
        String token = JsonPath.read(body(login(m.email(), PASSWORD, m.device(), "10.60.0.1", CHROME_ON_WINDOWS)), "$.accessToken");
        return mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(json).header("Authorization", "Bearer " + token).with(r -> { r.setRemoteAddr("10.60.0.1"); return r; })).andReturn();
    }

    // ---- a cookie is not a pass

    @Test
    void aCookieMadeUpOrDamaged_isNotAPass() throws Exception {
        Browser m = register(null);
        clearInvocations(mail);

        String madeUp = "A".repeat(43);   // the right shape, but nobody gave it out
        Browser forged = signIn(m, madeUp, "10.60.0.5", CHROME_ON_WINDOWS);
        verify(mail, times(1)).send(eq(m.email()), eq(SUBJECT), anyString());
        assertThat(forged.device()).isEqualTo(madeUp);   // a valid-looking value is kept (it is recorded from now on), but it did not skip the alert

        clearInvocations(mail);
        Browser junk = signIn(m, "<script>alert(1)</script>", "10.60.0.6", CHROME_ON_WINDOWS);
        assertThat(junk.device()).hasSize(43).doesNotContain("<");   // junk is thrown away and replaced
        verify(mail, times(1)).send(eq(m.email()), eq(SUBJECT), anyString());
    }

    @Test
    void anotherAccountsBrowserDoesNotCountForThisAccount_andOneBrowserCanServeTwoAccounts() throws Exception {
        Browser a = register(null);
        Browser b = register(null);   // b's own first browser, learnt silently
        clearInvocations(mail);

        signIn(b, a.device(), "10.60.0.7", CHROME_ON_WINDOWS);   // b signs in from the browser that belongs to a
        verify(mail, times(1)).send(eq(b.email()), eq(SUBJECT), anyString());   // not known to b yet

        clearInvocations(mail);
        signIn(b, a.device(), "10.60.0.7", CHROME_ON_WINDOWS);   // now it is
        signIn(a, a.device(), "10.60.0.7", CHROME_ON_WINDOWS);   // and still a's
        verify(mail, never()).send(anyString(), eq(SUBJECT), anyString());
        assertThat(jdbc.queryForObject("select count(*) from known_devices where device_hash = ?", Long.class, TokenService.hash(a.device()))).isEqualTo(2);
    }

    // ---- limits and safety

    @Test
    void atMostFiveEmailsADay_butEveryNewBrowserIsStillRecorded() throws Exception {
        Browser m = register(null);
        clearInvocations(mail);

        for (int i = 0; i < 7; i++) signIn(m, null, "10.60.1." + i, CHROME_ON_WINDOWS);   // seven browsers that have never been seen

        verify(mail, times(5)).send(eq(m.email()), eq(SUBJECT), anyString());
        assertThat(alertEvents(m)).isEqualTo(7);
        assertThat(devicesOf(m)).isEqualTo(8);
    }

    @Test
    void aProblemWithTheAlertNeverStopsTheSignIn() throws Exception {
        Browser m = register(null);
        doThrow(new RuntimeException("the mail service is down")).when(mail).send(anyString(), anyString(), anyString());

        MvcResult r = login(m.email(), PASSWORD, null, "10.60.0.8", CHROME_ON_WINDOWS);

        assertThat(status(r)).isEqualTo(200);
        assertThat(cookieNamed(r, AuthController.DEVICE_COOKIE)).isNotNull();
        assertThat(JsonPath.read(body(r), "$.accessToken").toString()).isNotBlank();
    }

    @Test
    void onlyASignInCounts_notAFailureARefreshOrTheDemo() throws Exception {
        Browser m = register(null);
        clearInvocations(mail);
        long before = jdbc.queryForObject("select count(*) from known_devices", Long.class);

        MvcResult wrong = login(m.email(), "not the password", null, "10.60.0.9", CHROME_ON_WINDOWS);
        assertThat(status(wrong)).isEqualTo(401);
        assertThat(headerNamed(wrong, AuthController.DEVICE_COOKIE)).isNull();

        MvcResult refresh = mvc.perform(post("/api/v1/auth/refresh").cookie(new Cookie(AuthController.REFRESH_COOKIE, m.refresh())).header(HttpHeaders.USER_AGENT, "Firefox")).andReturn();
        assertThat(status(refresh)).isEqualTo(200);
        assertThat(refresh.getResponse().getHeaders(HttpHeaders.SET_COOKIE)).hasSize(1);   // only the renewed refresh cookie

        MvcResult guest = call("/api/v1/auth/guest", "{}", null, "10.60.0.10", CHROME_ON_WINDOWS);
        assertThat(status(guest)).isEqualTo(201);
        assertThat(headerNamed(guest, AuthController.DEVICE_COOKIE)).isNull();

        verify(mail, never()).send(anyString(), eq(SUBJECT), anyString());
        assertThat(jdbc.queryForObject("select count(*) from known_devices", Long.class)).isEqualTo(before);
    }

    @Test
    void aPasswordResetDoesNotMakeTheKnownBrowserNew() throws Exception {
        Browser m = register(null);
        clearInvocations(mail);
        call("/api/v1/auth/forgot-password", "{\"email\":\"" + m.email() + "\"}", m.device(), "10.60.0.1", CHROME_ON_WINDOWS);
        ArgumentCaptor<String> link = ArgumentCaptor.forClass(String.class);
        verify(mail).send(eq(m.email()), eq("Reset your Formularium password"), link.capture());
        String token = link.getValue().replaceAll("(?s).*token=([A-Za-z0-9_-]+).*", "$1");
        assertThat(status(call("/api/v1/auth/reset-password", "{\"token\":\"" + token + "\",\"password\":\"a brand new passphrase\"}", m.device(), "10.60.0.1", CHROME_ON_WINDOWS))).isEqualTo(204);
        clearInvocations(mail);

        MvcResult r = login(m.email(), "a brand new passphrase", m.device(), "10.60.0.1", CHROME_ON_WINDOWS);

        assertThat(status(r)).isEqualTo(200);
        verify(mail, never()).send(anyString(), eq(SUBJECT), anyString());
    }

    // ---- housekeeping

    @Test
    void browsersAreRemovedWithTheirAccount_andWhenTheyHaveNotBeenSeenForOverAYear() throws Exception {
        Browser m = register(null);
        signIn(m, null, "10.60.0.11", CHROME_ON_WINDOWS);
        jdbc.update("update known_devices set last_seen_at = ? where id = (select id from known_devices order by first_seen_at limit 1)", Timestamp.from(Instant.now().minus(401, ChronoUnit.DAYS)));

        assertThat(devices.purgeUnseen()).isEqualTo(1);
        assertThat(devicesOf(m)).isEqualTo(1);   // the one seen recently stays
        assertThat(devices.purgeUnseen()).isZero();

        jdbc.update("delete from app_users where id = ?::uuid", m.id());
        assertThat(jdbc.queryForObject("select count(*) from known_devices", Long.class)).isZero();
    }

    @Test
    void onlyAHashOfTheIdentifierIsStored() throws Exception {
        Browser m = register(null);
        List<String> stored = jdbc.queryForList("select device_hash from known_devices", String.class);
        assertThat(stored).containsExactly(TokenService.hash(m.device()));
        assertThat(stored.get(0)).isNotEqualTo(m.device());
    }
}
