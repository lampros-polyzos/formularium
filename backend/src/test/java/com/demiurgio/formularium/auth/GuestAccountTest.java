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
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * "Try the demo": a visitor gets a private, temporary account with one press. Limits are lowered here (3 per address per hour, 5 guests at once)
 * so they can be reached.
 */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = {"auth.guest.per-ip-per-hour=3", "auth.guest.max-active=5"})
class GuestAccountTest {

    private static final String PASSWORD = "correct horse battery";

    @Autowired private MockMvc mvc;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private AuthService auth;
    @MockitoBean private EmailSender mail;

    @BeforeEach
    void clean() {
        jdbc.update("delete from auth_events");
        jdbc.update("delete from refresh_tokens");
        jdbc.update("delete from app_users");
    }

    // ---- helpers

    private MvcResult tryTheDemo(String ip) throws Exception {
        return mvc.perform(post("/api/v1/auth/guest").contentType(MediaType.APPLICATION_JSON).content("{}").with(r -> { r.setRemoteAddr(ip); return r; })).andReturn();
    }

    private static int status(MvcResult result) { return result.getResponse().getStatus(); }

    private static <T> T read(MvcResult result, String path) throws Exception { return JsonPath.read(result.getResponse().getContentAsString(), path); }

    private static String token(MvcResult session) throws Exception { return read(session, "$.accessToken"); }

    private static String refreshCookie(MvcResult session) {
        String header = session.getResponse().getHeader(HttpHeaders.SET_COOKIE);
        assertThat(header).startsWith(AuthController.REFRESH_COOKIE + "=");
        return header.substring(header.indexOf('=') + 1, header.indexOf(';'));
    }

    private MockHttpServletRequestBuilder as(MvcResult session, MockHttpServletRequestBuilder request) throws Exception {
        return request.header("Authorization", "Bearer " + token(session));
    }

    private MvcResult newMember() throws Exception {
        String name = "m" + UUID.randomUUID().toString().substring(0, 8);
        return mvc.perform(post("/api/v1/auth/register").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"" + name + "@example.com\",\"password\":\"" + PASSWORD + "\",\"username\":\"" + name + "\"}")).andReturn();
    }

    // ---- what a guest is

    @Test
    void onePress_givesASignedInGuest_withTheStartingFormulas() throws Exception {
        MvcResult session = tryTheDemo("203.0.113.1");

        assertThat(status(session)).isEqualTo(201);
        assertThat((Boolean) read(session, "$.user.guest")).isTrue();
        assertThat((String) read(session, "$.user.email")).endsWith("@guest.invalid");   // an address that can never receive mail
        assertThat((String) read(session, "$.user.username")).startsWith("guest-");
        assertThat(session.getResponse().getHeader(HttpHeaders.SET_COOKIE)).contains("HttpOnly");

        MvcResult formulas = mvc.perform(as(session, get("/api/v1/formulas"))).andReturn();   // the tools work, on the account's own data
        assertThat(status(formulas)).isEqualTo(200);
        assertThat((Integer) JsonPath.read(formulas.getResponse().getContentAsString(), "$.length()")).isGreaterThan(0);

        MvcResult me = mvc.perform(as(session, get("/api/v1/auth/me"))).andReturn();
        assertThat((Boolean) read(me, "$.guest")).isTrue();
    }

    @Test
    void everyPressMakesANewPrivateAccount() throws Exception {
        MvcResult first = tryTheDemo("203.0.113.1");
        MvcResult second = tryTheDemo("203.0.113.1");
        assertThat((String) read(first, "$.user.id")).isNotEqualTo(read(second, "$.user.id"));
        assertThat(jdbc.queryForObject("select count(*) from app_users where guest_expires_at is not null", Long.class)).isEqualTo(2);
        // the formulas of one are not the other's
        assertThat(jdbc.queryForObject("select count(distinct user_id) from formulations", Long.class)).isEqualTo(2);
    }

    @Test
    void aGuestHasNoPassword_soItCannotBeSignedIntoAgain() throws Exception {
        MvcResult session = tryTheDemo("203.0.113.1");
        String email = read(session, "$.user.email");
        MvcResult login = mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"" + email + "\",\"password\":\"anything at all\"}")).andReturn();
        assertThat(status(login)).isEqualTo(401);
        assertThat((String) read(login, "$.error.code")).isEqualTo("invalid_credentials");
    }

    @Test
    void noEmailIsEverSentToAGuest_andNoPasswordIsSetByAReset() throws Exception {
        String email = read(tryTheDemo("203.0.113.1"), "$.user.email");
        for (String path : new String[]{"forgot-password", "resend-verification"}) {
            MvcResult asked = mvc.perform(post("/api/v1/auth/" + path).contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"" + email + "\"}")).andReturn();
            assertThat(status(asked)).isEqualTo(202);
        }
        verify(mail, never()).send(org.mockito.ArgumentMatchers.anyString(), org.mockito.ArgumentMatchers.anyString(), org.mockito.ArgumentMatchers.anyString());
        assertThat(jdbc.queryForObject("select count(*) from email_tokens", Long.class)).isZero();
    }

    // ---- what a guest may not do

    @Test
    void aGuestCanReadTheCommunity_butNotWriteToIt_orSetUpTwoStepVerification() throws Exception {
        MvcResult guest = tryTheDemo("203.0.113.1");

        assertThat(status(mvc.perform(as(guest, get("/api/v1/community/posts"))).andReturn())).isEqualTo(200);   // looking is fine

        String post = "{\"title\":\"Hello\",\"post_type\":\"discussion\"}";
        MvcResult refused = mvc.perform(as(guest, post("/api/v1/community/posts").contentType(MediaType.APPLICATION_JSON).content(post))).andReturn();
        assertThat(status(refused)).isEqualTo(403);
        assertThat((String) read(refused, "$.error.code")).isEqualTo("guest_account");   // the usual error shape, with a message the page can show
        assertThat((String) read(refused, "$.error.message")).contains("free account");
        assertThat(jdbc.queryForObject("select count(*) from community_posts", Long.class)).isZero();

        UUID someone = UUID.randomUUID();
        for (MockHttpServletRequestBuilder write : new MockHttpServletRequestBuilder[]{
                org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put("/api/v1/community/posts/" + someone + "/rating").contentType(MediaType.APPLICATION_JSON).content("{\"score\":5}"),
                org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete("/api/v1/community/posts/" + someone),
                post("/api/v1/community/posts/" + someone + "/comments").contentType(MediaType.APPLICATION_JSON).content("{\"content\":\"hi\"}"),
                post("/api/v1/community/reports").contentType(MediaType.APPLICATION_JSON).content("{}")}) {
            assertThat(status(mvc.perform(as(guest, write)).andReturn())).as(write.toString()).isEqualTo(403);
        }

        MvcResult mfa = mvc.perform(as(guest, post("/api/v1/auth/mfa/setup").contentType(MediaType.APPLICATION_JSON).content("{}"))).andReturn();
        assertThat(status(mfa)).isEqualTo(403);
        assertThat(status(mvc.perform(as(guest, get("/api/v1/auth/mfa"))).andReturn())).isEqualTo(200);   // asking whether it is on is harmless
    }

    @Test
    void aRealMemberIsNotAffectedByTheGuestRule_andSigningInIsStillRequired() throws Exception {
        MvcResult member = newMember();
        assertThat(status(member)).isEqualTo(201);
        assertThat((Boolean) read(member, "$.user.guest")).isFalse();

        // reaches the endpoint (and is refused for the empty body), instead of being refused for who it is
        assertThat(status(mvc.perform(as(member, post("/api/v1/community/posts").contentType(MediaType.APPLICATION_JSON).content("{}"))).andReturn())).isEqualTo(400);
        assertThat(status(mvc.perform(as(member, post("/api/v1/auth/mfa/setup").contentType(MediaType.APPLICATION_JSON).content("{\"password\":\"" + PASSWORD + "\"}"))).andReturn())).isEqualTo(200);

        // and not signed in at all is still 401, not 403
        assertThat(status(mvc.perform(post("/api/v1/community/posts").contentType(MediaType.APPLICATION_JSON).content("{}")).andReturn())).isEqualTo(401);
        assertThat(status(mvc.perform(post("/api/v1/auth/mfa/setup").contentType(MediaType.APPLICATION_JSON).content("{}")).andReturn())).isEqualTo(401);
    }

    // ---- the end of a guest

    @Test
    void theSignInOfAGuestNeverOutlivesItsAccount() throws Exception {
        MvcResult session = tryTheDemo("203.0.113.1");
        UUID id = UUID.fromString(read(session, "$.user.id"));
        Instant accountEnds = jdbc.queryForObject("select guest_expires_at from app_users where id = ?", Timestamp.class, id).toInstant();
        Instant tokenEnds = jdbc.queryForObject("select expires_at from refresh_tokens where user_id = ?", Timestamp.class, id).toInstant();

        assertThat(accountEnds).isBetween(Instant.now().plus(23, ChronoUnit.HOURS), Instant.now().plus(25, ChronoUnit.HOURS));   // about a day
        assertThat(tokenEnds).isBeforeOrEqualTo(accountEnds.plusSeconds(1));
    }

    @Test
    void anExpiredGuestCannotRenewItsSession_evenBeforeTheCleanupRuns() throws Exception {
        MvcResult session = tryTheDemo("203.0.113.1");
        String cookie = refreshCookie(session);
        UUID id = UUID.fromString(read(session, "$.user.id"));

        MvcResult stillGood = mvc.perform(post("/api/v1/auth/refresh").cookie(new Cookie(AuthController.REFRESH_COOKIE, cookie))).andReturn();
        assertThat(status(stillGood)).isEqualTo(200);   // while its day lasts, it renews like anyone's

        jdbc.update("update app_users set guest_expires_at = ? where id = ?", Timestamp.from(Instant.now().minusSeconds(5)), id);
        MvcResult tooLate = mvc.perform(post("/api/v1/auth/refresh").cookie(new Cookie(AuthController.REFRESH_COOKIE, refreshCookie(stillGood)))).andReturn();
        assertThat(status(tooLate)).isEqualTo(401);
    }

    @Test
    void theCleanupDeletesExpiredGuestsWithEverythingTheyOwn_andOnlyThem() throws Exception {
        MvcResult expired = tryTheDemo("203.0.113.1");
        MvcResult current = tryTheDemo("203.0.113.2");
        MvcResult member = newMember();
        UUID expiredId = UUID.fromString(read(expired, "$.user.id"));
        jdbc.update("update app_users set guest_expires_at = ? where id = ?", Timestamp.from(Instant.now().minusSeconds(5)), expiredId);
        assertThat(jdbc.queryForObject("select count(*) from formulations where user_id = ?", Long.class, expiredId)).isGreaterThan(0);

        assertThat(auth.purgeExpiredGuests()).isEqualTo(1);

        assertThat(jdbc.queryForObject("select count(*) from app_users where id = ?", Long.class, expiredId)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from formulations where user_id = ?", Long.class, expiredId)).isZero();   // its formulas went with it
        assertThat(jdbc.queryForObject("select count(*) from refresh_tokens where user_id = ?", Long.class, expiredId)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from app_users where id = ?", Long.class, UUID.fromString(read(current, "$.user.id")))).isEqualTo(1);   // the other guest stays
        assertThat(jdbc.queryForObject("select count(*) from app_users where id = ?", Long.class, UUID.fromString(read(member, "$.user.id")))).isEqualTo(1);     // and a real member is never touched
        assertThat(auth.purgeExpiredGuests()).isZero();
    }

    // ---- the limits

    @Test
    void oneAddressCanStartOnlyAFewPerHour_butAnotherAddressCan() throws Exception {
        for (int i = 0; i < 3; i++) assertThat(status(tryTheDemo("203.0.113.9"))).isEqualTo(201);

        MvcResult fourth = tryTheDemo("203.0.113.9");
        assertThat(status(fourth)).isEqualTo(429);
        assertThat((String) read(fourth, "$.error.code")).isEqualTo("too_many_requests");

        assertThat(status(tryTheDemo("203.0.113.10"))).isEqualTo(201);
        assertThat(jdbc.queryForObject("select count(*) from auth_events where type = 'guest_created' and ip = '203.0.113.9'", Long.class)).isEqualTo(3);   // refused ones are not counted
    }

    @Test
    void thereIsACeilingOnHowManyGuestsExistAtOnce_andRoomComesBackWhenOneEnds() throws Exception {
        for (int i = 1; i <= 5; i++) assertThat(status(tryTheDemo("198.51.100." + i))).isEqualTo(201);

        MvcResult sixth = tryTheDemo("198.51.100.6");
        assertThat(status(sixth)).isEqualTo(503);
        assertThat((String) read(sixth, "$.error.code")).isEqualTo("demo_busy");
        assertThat(jdbc.queryForObject("select count(*) from app_users", Long.class)).isEqualTo(5);

        jdbc.update("update app_users set guest_expires_at = ? where id = (select id from app_users limit 1)", Timestamp.from(Instant.now().minusSeconds(5)));   // one ends
        assertThat(status(tryTheDemo("198.51.100.6"))).isEqualTo(201);
    }

    @Test
    void realMembersDoNotCountTowardsTheCeiling() throws Exception {
        for (int i = 0; i < 6; i++) assertThat(status(newMember())).isEqualTo(201);
        assertThat(status(tryTheDemo("203.0.113.1"))).isEqualTo(201);
    }
}
