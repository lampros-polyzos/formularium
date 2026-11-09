package com.demiurgio.formularium.auth;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * Passkeys, through the real endpoints, with a software authenticator that does what a phone or a security key does. The point of each test is a rule:
 * a passkey signs in without a password or a code, it works only for this site, it works once, and changing passkeys needs the password.
 */
@SpringBootTest
@AutoConfigureMockMvc
class PasskeyTest {

    private static final String PASSWORD = "correct horse battery";
    private static final JsonMapper JSON = JsonMapper.builder().build();

    @Autowired private MockMvc mvc;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private AuthService auth;

    private record Member(String email, String token, String id) { }

    @BeforeEach
    void clean() {
        jdbc.update("delete from auth_events");
        jdbc.update("delete from webauthn_challenges");
        jdbc.update("delete from refresh_tokens");
        jdbc.update("delete from app_users");   // passkeys go with their owners
    }

    // ---- helpers

    private MvcResult send(MockHttpServletRequestBuilder request) throws Exception { return mvc.perform(request).andReturn(); }

    private MvcResult call(String path, String json, String token, String ip) throws Exception {
        MockHttpServletRequestBuilder request = post(path).contentType(MediaType.APPLICATION_JSON).content(json).with(r -> { r.setRemoteAddr(ip); return r; });
        if (token != null) request.header("Authorization", "Bearer " + token);
        return send(request);
    }

    private MvcResult call(String path, String json, String token) throws Exception { return call(path, json, token, "10.30.0.1"); }

    private static int status(MvcResult r) { return r.getResponse().getStatus(); }

    private static String body(MvcResult r) throws Exception { return r.getResponse().getContentAsString(); }

    private static String errorCode(MvcResult r) throws Exception { return JsonPath.read(body(r), "$.error.code"); }

    private Member member() throws Exception {
        String name = "p" + UUID.randomUUID().toString().substring(0, 8);
        String email = name + "@example.com";
        MvcResult result = call("/api/v1/auth/register", "{\"email\":\"" + email + "\",\"password\":\"" + PASSWORD + "\",\"username\":\"" + name + "\"}", null);
        assertThat(status(result)).isEqualTo(201);
        return new Member(email, JsonPath.read(body(result), "$.accessToken"), JsonPath.read(body(result), "$.user.id"));
    }

    private MvcResult registrationOptions(Member m, String password) throws Exception {
        return call("/api/v1/auth/passkeys/registration/options", "{\"password\":" + (password == null ? "null" : "\"" + password + "\"") + "}", m.token());
    }

    /** The two steps of adding a passkey, as the browser does them. Returns the answer to the second. */
    private MvcResult addPasskey(Member m, SoftwarePasskey key, String name) throws Exception {
        MvcResult options = registrationOptions(m, PASSWORD);
        assertThat(status(options)).isEqualTo(200);
        JsonNode root = JSON.readTree(body(options));
        String credential = key.create(root.get("options"));
        return call("/api/v1/auth/passkeys/registration", "{\"challengeId\":\"" + root.get("challengeId").asString() + "\",\"credential\":" + credential + ",\"name\":\"" + name + "\"}", m.token());
    }

    private JsonNode loginOptions(String ip) throws Exception {
        MvcResult options = call("/api/v1/auth/login/passkey/options", "", null, ip);
        assertThat(status(options)).isEqualTo(200);
        return JSON.readTree(body(options));
    }

    private MvcResult finishLogin(JsonNode options, String credential) throws Exception {
        return call("/api/v1/auth/login/passkey", "{\"challengeId\":\"" + options.get("challengeId").asString() + "\",\"credential\":" + credential + "}", null);
    }

    /** The two steps of signing in with a passkey. */
    private MvcResult signIn(SoftwarePasskey key) throws Exception {
        JsonNode options = loginOptions("10.30.0.1");
        return finishLogin(options, key.get(options.get("options")));
    }

    private long events(String type) { return jdbc.queryForObject("select count(*) from auth_events where type = ?", Long.class, type); }

    private long stored() { return jdbc.queryForObject("select count(*) from passkeys", Long.class); }

    // ---- adding, listing

    @Test
    void aMemberAddsAPasskey_andItIsListed() throws Exception {
        Member m = member();
        MvcResult added = addPasskey(m, SoftwarePasskey.forThisSite(), "My laptop");

        assertThat(status(added)).isEqualTo(201);
        assertThat((String) JsonPath.read(body(added), "$.name")).isEqualTo("My laptop");
        assertThat(stored()).isEqualTo(1);

        MvcResult list = send(get("/api/v1/auth/passkeys").header("Authorization", "Bearer " + m.token()));
        assertThat((Boolean) JsonPath.read(body(list), "$.available")).isTrue();
        assertThat((Boolean) JsonPath.read(body(list), "$.needsPassword")).isTrue();
        assertThat((String) JsonPath.read(body(list), "$.passkeys[0].name")).isEqualTo("My laptop");
        assertThat(body(list)).doesNotContain("publicKey").doesNotContain("credentialId");   // the screen needs names and dates, nothing more
        assertThat(events("passkey_added")).isEqualTo(1);
    }

    @Test
    void theOptionsAskForAFingerprintOrPin_andForADiscoverableKey() throws Exception {
        Member m = member();
        JsonNode options = JSON.readTree(body(registrationOptions(m, PASSWORD))).get("options");
        assertThat(options.get("rp").get("id").asString()).isEqualTo("localhost");
        assertThat(options.get("authenticatorSelection").get("userVerification").asString()).isEqualTo("required");
        assertThat(options.get("authenticatorSelection").get("residentKey").asString()).isEqualTo("required");
        assertThat(options.get("user").get("name").asString()).isEqualTo(m.email());
    }

    @Test
    void addingNeedsTheRightPassword_andWrongOnesAreCounted() throws Exception {
        Member m = member();
        MvcResult wrong = registrationOptions(m, "not the password");
        assertThat(status(wrong)).isEqualTo(401);
        assertThat(errorCode(wrong)).isEqualTo("invalid_credentials");
        assertThat(status(registrationOptions(m, null))).isEqualTo(401);
        assertThat(events("passkey_failed")).isEqualTo(2);

        for (int i = 0; i < 8; i++) registrationOptions(m, "still wrong");
        MvcResult blocked = registrationOptions(m, PASSWORD);   // even the right one waits
        assertThat(status(blocked)).isEqualTo(429);
        assertThat(stored()).isZero();
    }

    @Test
    void aStolenAccessTokenAloneCannotBindANewDevice() throws Exception {
        Member m = member();
        MvcResult noPassword = call("/api/v1/auth/passkeys/registration/options", "{}", m.token());
        assertThat(status(noPassword)).isEqualTo(401);   // an account with a password must show it
    }

    @Test
    void theRegistrationChallengeWorksOnce_andOnlyForWhoAskedForIt() throws Exception {
        Member m = member();
        Member other = member();
        SoftwarePasskey key = SoftwarePasskey.forThisSite();
        JsonNode root = JSON.readTree(body(registrationOptions(m, PASSWORD)));
        String credential = key.create(root.get("options"));
        String answer = "{\"challengeId\":\"" + root.get("challengeId").asString() + "\",\"credential\":" + credential + ",\"name\":\"x\"}";

        assertThat(status(call("/api/v1/auth/passkeys/registration", answer, other.token()))).isEqualTo(400);   // someone else cannot use it...
        assertThat(status(call("/api/v1/auth/passkeys/registration", answer, m.token()))).isEqualTo(400);       // ...and asking burned it
        assertThat(stored()).isZero();

        JsonNode second = JSON.readTree(body(registrationOptions(m, PASSWORD)));
        String again = "{\"challengeId\":\"" + second.get("challengeId").asString() + "\",\"credential\":" + key.create(second.get("options")) + ",\"name\":\"x\"}";
        assertThat(status(call("/api/v1/auth/passkeys/registration", again, m.token()))).isEqualTo(201);
        assertThat(status(call("/api/v1/auth/passkeys/registration", again, m.token()))).isEqualTo(400);   // used up
        assertThat(stored()).isEqualTo(1);
    }

    @Test
    void aPasskeyMadeForAnotherSiteIsRefusedAtRegistration() throws Exception {
        Member m = member();
        JsonNode root = JSON.readTree(body(registrationOptions(m, PASSWORD)));
        String credential = SoftwarePasskey.forThisSite().create(root.get("options"), "https://formularium-login.example", "formularium-login.example");
        MvcResult refused = call("/api/v1/auth/passkeys/registration", "{\"challengeId\":\"" + root.get("challengeId").asString() + "\",\"credential\":" + credential + "}", m.token());
        assertThat(status(refused)).isEqualTo(400);
        assertThat(errorCode(refused)).isEqualTo("passkey_invalid");
        assertThat(stored()).isZero();
    }

    @Test
    void theSameCredentialCannotBeAddedTwice_andThereIsALimit() throws Exception {
        Member m = member();
        SoftwarePasskey key = SoftwarePasskey.forThisSite();
        assertThat(status(addPasskey(m, key, "one"))).isEqualTo(201);
        assertThat(status(addPasskey(m, key, "again"))).isEqualTo(400);   // the browser would not even offer it (excluded), and the server refuses it

        for (int i = 0; i < 9; i++) assertThat(status(addPasskey(m, SoftwarePasskey.forThisSite(), "key " + i))).isEqualTo(201);
        MvcResult tooMany = registrationOptions(m, PASSWORD);
        assertThat(status(tooMany)).isEqualTo(409);
        assertThat(errorCode(tooMany)).isEqualTo("too_many_passkeys");
    }

    // ---- signing in

    @Test
    void aPasskeySignsInWithoutAPassword_andTheSessionRenews() throws Exception {
        Member m = member();
        SoftwarePasskey key = SoftwarePasskey.forThisSite();
        addPasskey(m, key, "Phone");

        MvcResult session = signIn(key);

        assertThat(status(session)).isEqualTo(200);
        assertThat((String) JsonPath.read(body(session), "$.user.email")).isEqualTo(m.email());
        assertThat((Boolean) JsonPath.read(body(session), "$.user.guest")).isFalse();
        String cookie = session.getResponse().getHeader(HttpHeaders.SET_COOKIE);
        assertThat(cookie).contains("refresh_token=").contains("HttpOnly");
        String token = JsonPath.read(body(session), "$.accessToken");
        assertThat(status(send(get("/api/v1/auth/me").header("Authorization", "Bearer " + token)))).isEqualTo(200);
        assertThat(events("passkey_login")).isEqualTo(1);
        assertThat(jdbc.queryForObject("select last_used_at is not null from passkeys", Boolean.class)).isTrue();
    }

    @Test
    void aPasskeyIsTwoFactorsInOne_soItSkipsTheAuthenticatorCodeToo() throws Exception {
        Member m = member();
        MvcResult setup = call("/api/v1/auth/mfa/setup", "{\"password\":\"" + PASSWORD + "\"}", m.token());
        String secret = JsonPath.read(body(setup), "$.secret");
        String code = Totp.code(Totp.fromBase32(secret), Totp.stepAt(Instant.now()));
        assertThat(status(call("/api/v1/auth/mfa/enable", "{\"code\":\"" + code + "\"}", m.token()))).isEqualTo(200);
        SoftwarePasskey key = SoftwarePasskey.forThisSite();
        addPasskey(m, key, "Phone");

        MvcResult byPassword = call("/api/v1/auth/login", "{\"email\":\"" + m.email() + "\",\"password\":\"" + PASSWORD + "\"}", null);
        assertThat((Boolean) JsonPath.read(body(byPassword), "$.mfa_required")).isTrue();   // a password alone still has to give a code

        MvcResult byPasskey = signIn(key);
        assertThat(status(byPasskey)).isEqualTo(200);
        assertThat((String) JsonPath.read(body(byPasskey), "$.accessToken")).isNotBlank();   // a passkey does not
    }

    @Test
    void aPasskeyFromADifferentSiteIsRefused_thisIsWhatMakesItPhishingResistant() throws Exception {
        Member m = member();
        SoftwarePasskey key = SoftwarePasskey.forThisSite();
        addPasskey(m, key, "Phone");

        // a look-alike page asks for the sign-in: the browser puts ITS origin in what is signed, and the domain it is on in the hash
        JsonNode options = loginOptions("10.30.0.1");
        MvcResult phished = finishLogin(options, key.get(options.get("options"), "https://formulaarium.dev", "formulaarium.dev"));
        assertThat(status(phished)).isEqualTo(401);
        assertThat(errorCode(phished)).isEqualTo("passkey_failed");

        // the right domain claimed from the wrong origin
        JsonNode second = loginOptions("10.30.0.1");
        assertThat(status(finishLogin(second, key.get(second.get("options"), "https://evil.example", "localhost")))).isEqualTo(401);
        assertThat(events("passkey_login")).isZero();
    }

    @Test
    void aTamperedOrForeignSignatureIsRefused_soTheHappyPathReallyChecksSomething() throws Exception {
        Member m = member();
        SoftwarePasskey key = SoftwarePasskey.forThisSite();
        addPasskey(m, key, "Phone");

        JsonNode options = loginOptions("10.30.0.1");
        String genuine = key.get(options.get("options"));
        String tampered = genuine.replace("\"signature\":\"", "\"signature\":\"AAAA");   // the same message with a damaged signature
        assertThat(status(finishLogin(options, tampered))).isEqualTo(401);

        JsonNode second = loginOptions("10.30.0.1");
        SoftwarePasskey impostor = SoftwarePasskey.forThisSite().withUserHandle(key.userHandle());   // another key pair, claiming this member's credential id and handle
        String forged = impostor.get(second.get("options")).replaceAll("\"(id|rawId)\":\"[^\"]+\"", "\"$1\":\"" + key.credentialId() + "\"");
        assertThat(status(finishLogin(second, forged))).isEqualTo(401);
        assertThat(events("passkey_login")).isZero();

        JsonNode third = loginOptions("10.30.0.1");
        assertThat(status(finishLogin(third, key.get(third.get("options"))))).isEqualTo(200);   // while the real one still works
    }

    @Test
    void aSignInAnswerWorksOnce() throws Exception {
        Member m = member();
        SoftwarePasskey key = SoftwarePasskey.forThisSite();
        addPasskey(m, key, "Phone");
        JsonNode options = loginOptions("10.30.0.1");
        String answer = key.get(options.get("options"));

        assertThat(status(finishLogin(options, answer))).isEqualTo(200);
        assertThat(status(finishLogin(options, answer))).isEqualTo(401);   // replayed: the challenge was used up
    }

    @Test
    void aChallengeThatIsAskedForButNotAnsweredInTimeIsRefused() throws Exception {
        Member m = member();
        SoftwarePasskey key = SoftwarePasskey.forThisSite();
        addPasskey(m, key, "Phone");
        JsonNode options = loginOptions("10.30.0.1");
        jdbc.update("update webauthn_challenges set expires_at = ?", Timestamp.from(Instant.now().minusSeconds(1)));
        assertThat(status(finishLogin(options, key.get(options.get("options"))))).isEqualTo(401);
    }

    @Test
    void aChallengeForRegisteringCannotBeUsedToSignIn() throws Exception {
        Member m = member();
        SoftwarePasskey key = SoftwarePasskey.forThisSite();
        JsonNode registering = JSON.readTree(body(registrationOptions(m, PASSWORD)));
        key.create(registering.get("options"));   // the authenticator now knows its user handle
        assertThat(status(call("/api/v1/auth/login/passkey", "{\"challengeId\":\"" + registering.get("challengeId").asString() + "\",\"credential\":"
                + key.get(registering.get("options")) + "}", null))).isEqualTo(401);
    }

    @Test
    void anUnknownOrRemovedPasskeyIsRefusedWithTheSameAnswer() throws Exception {
        Member m = member();
        SoftwarePasskey registered = SoftwarePasskey.forThisSite();
        addPasskey(m, registered, "Phone");
        SoftwarePasskey stranger = SoftwarePasskey.forThisSite();   // never registered with the server
        addPasskeyToItselfOnly(stranger, m);

        MvcResult unknown = signIn(stranger);
        assertThat(status(unknown)).isEqualTo(401);
        assertThat(errorCode(unknown)).isEqualTo("passkey_failed");
        assertThat((String) JsonPath.read(body(unknown), "$.error.message")).isEqualTo("That passkey did not work. Try again, or sign in another way.");
    }

    /** Gives the pretend authenticator a user handle without registering it with the server (as a device that was never added would have none... or a stale one). */
    private void addPasskeyToItselfOnly(SoftwarePasskey key, Member m) throws Exception {
        JsonNode root = JSON.readTree(body(registrationOptions(m, PASSWORD)));
        key.create(root.get("options"));
    }

    @Test
    void aSignatureWithoutAFingerprintOrPinIsRefused() throws Exception {
        Member m = member();
        SoftwarePasskey key = SoftwarePasskey.forThisSite();
        addPasskey(m, key, "Phone");
        JsonNode options = loginOptions("10.30.0.1");
        assertThat(status(finishLogin(options, key.getWithoutUserVerification(options.get("options"))))).isEqualTo(401);   // just possessing the device is not enough
    }

    @Test
    void aSignatureCounterThatGoesBackwardsIsRefused_asItMeansACopiedKey() throws Exception {
        Member m = member();
        SoftwarePasskey key = SoftwarePasskey.forThisSite();
        addPasskey(m, key, "Phone");
        key.counter(10);
        assertThat(status(signIn(key))).isEqualTo(200);    // the counter is 11 now, and stored
        key.counter(2);                                    // a clone that has only signed a few times
        MvcResult clone = signIn(key);
        assertThat(status(clone)).isEqualTo(401);
        assertThat(errorCode(clone)).isEqualTo("passkey_failed");
        assertThat(jdbc.queryForObject("select sign_count from passkeys", Long.class)).isEqualTo(11L);   // the stored count did not move back
    }

    @Test
    void aSyncedPasskey_whichUsuallyCountsNothing_stillSignsInEveryTime() throws Exception {
        Member m = member();
        SoftwarePasskey key = SoftwarePasskey.forThisSite().synced();
        addPasskey(m, key, "iCloud Keychain");
        assertThat(jdbc.queryForObject("select backup_eligible and backup_state from passkeys", Boolean.class)).isTrue();
        MvcResult list = send(get("/api/v1/auth/passkeys").header("Authorization", "Bearer " + m.token()));
        assertThat((Boolean) JsonPath.read(body(list), "$.passkeys[0].synced")).isTrue();
        assertThat(status(signIn(key))).isEqualTo(200);
        assertThat(status(signIn(key))).isEqualTo(200);
    }

    @Test
    void thePasskeyBelongsToItsMember_notToWhoeverHoldsTheHandle() throws Exception {
        Member alice = member();
        Member bob = member();
        SoftwarePasskey aliceKey = SoftwarePasskey.forThisSite();
        addPasskey(alice, aliceKey, "Alice's");
        addPasskey(bob, SoftwarePasskey.forThisSite(), "Bob's");

        MvcResult session = signIn(aliceKey);
        assertThat((String) JsonPath.read(body(session), "$.user.id")).isEqualTo(alice.id());
    }

    // ---- removing

    @Test
    void removingNeedsThePassword_andAMemberCanOnlyRemoveTheirOwn() throws Exception {
        Member m = member();
        Member other = member();
        SoftwarePasskey key = SoftwarePasskey.forThisSite();
        String id = JsonPath.read(body(addPasskey(m, key, "Phone")), "$.id");

        assertThat(status(call("/api/v1/auth/passkeys/" + id + "/remove", "{\"password\":\"wrong\"}", m.token()))).isEqualTo(401);
        assertThat(status(call("/api/v1/auth/passkeys/" + id + "/remove", "{\"password\":\"" + PASSWORD + "\"}", other.token()))).isEqualTo(404);   // not theirs
        assertThat(stored()).isEqualTo(1);

        assertThat(status(call("/api/v1/auth/passkeys/" + id + "/remove", "{\"password\":\"" + PASSWORD + "\"}", m.token()))).isEqualTo(204);
        assertThat(stored()).isZero();
        assertThat(events("passkey_removed")).isEqualTo(1);
        assertThat(status(signIn(key))).isEqualTo(401);   // it no longer opens anything
    }

    @Test
    void deletingTheAccountDeletesItsPasskeys() throws Exception {
        Member m = member();
        addPasskey(m, SoftwarePasskey.forThisSite(), "Phone");
        auth.deleteAccount(UUID.fromString(m.id()));
        assertThat(stored()).isZero();
    }

    // ---- who may use it

    @Test
    void theDemoAccountCannotAddPasskeys_andNobodyUnknownCanManageThem() throws Exception {
        MvcResult guest = call("/api/v1/auth/guest", "{}", null);
        String token = JsonPath.read(body(guest), "$.accessToken");
        MvcResult refused = call("/api/v1/auth/passkeys/registration/options", "{}", token);
        assertThat(status(refused)).isEqualTo(403);
        assertThat(errorCode(refused)).isEqualTo("guest_account");

        assertThat(status(call("/api/v1/auth/passkeys/registration/options", "{}", null))).isEqualTo(401);
        assertThat(status(send(get("/api/v1/auth/passkeys")))).isEqualTo(401);
    }

    @Test
    void signingInIsOpenToAnyone_butLimitedPerAddress() throws Exception {
        for (int i = 0; i < 60; i++) assertThat(status(call("/api/v1/auth/login/passkey/options", "", null, "198.51.100.9"))).isEqualTo(200);
        MvcResult limited = call("/api/v1/auth/login/passkey/options", "", null, "198.51.100.9");
        assertThat(status(limited)).isEqualTo(429);
        assertThat(status(call("/api/v1/auth/login/passkey/options", "", null, "198.51.100.10"))).isEqualTo(200);   // another address is unaffected
    }

    @Test
    void manyFailedPasskeyAttemptsFromOneAddressAreBlocked() throws Exception {
        for (int i = 0; i < 30; i++) {
            MvcResult r = call("/api/v1/auth/login/passkey", "{\"challengeId\":\"" + UUID.randomUUID() + "\",\"credential\":{}}", null, "198.51.100.20");
            assertThat(status(r)).isEqualTo(401);
        }
        MvcResult blocked = call("/api/v1/auth/login/passkey", "{\"challengeId\":\"" + UUID.randomUUID() + "\",\"credential\":{}}", null, "198.51.100.20");
        assertThat(status(blocked)).isEqualTo(429);
    }

    @Test
    void expiredChallengesAreCleanedUp() {
        jdbc.update("insert into webauthn_challenges (id, purpose, user_id, request_json, expires_at) values (?, 'login', null, '{}', ?)", UUID.randomUUID(), Timestamp.from(Instant.now().minusSeconds(5)));
        jdbc.update("insert into webauthn_challenges (id, purpose, user_id, request_json, expires_at) values (?, 'login', null, '{}', ?)", UUID.randomUUID(), Timestamp.from(Instant.now().plusSeconds(300)));
        auth.purgeExpiredGuests();   // the hourly job
        assertThat(jdbc.queryForObject("select count(*) from webauthn_challenges", Long.class)).isEqualTo(1);
    }
}
