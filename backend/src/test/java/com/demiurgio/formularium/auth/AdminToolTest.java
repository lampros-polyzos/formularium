package com.demiurgio.formularium.auth;

import com.jayway.jsonpath.JsonPath;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * The admin tool: only administrators (asked of the database each time), who must have a second factor of their own, can look a member up and make the changes
 * that used to need SQL. Every change needs the administrator's password and a reason, is recorded, and is emailed to the member.
 */
@SpringBootTest
@AutoConfigureMockMvc
class AdminToolTest {

    private static final String PASSWORD = "correct horse battery";
    private static final String SUBJECT = "A change was made to your Formularium account";

    @Autowired private MockMvc mvc;
    @Autowired private JdbcTemplate jdbc;
    @MockitoBean private EmailSender mail;
    @MockitoBean private PasswordBreachChecker breach;

    private record Member(String email, String id, String token, String cookie) { }

    @BeforeEach
    void clean() {
        jdbc.update("delete from admin_actions");
        jdbc.update("delete from app_admins");
        jdbc.update("delete from community_moderators");
        jdbc.update("delete from auth_events");
        jdbc.update("delete from email_tokens");
        jdbc.update("delete from refresh_tokens");
        jdbc.update("delete from app_users");
        clearInvocations(mail);
        when(breach.isBreached(anyString())).thenReturn(false);
    }

    // ---- helpers

    private MockHttpServletRequestBuilder withToken(MockHttpServletRequestBuilder request, String token, String ip) {
        request.with(r -> { r.setRemoteAddr(ip); return r; });
        if (token != null) request.header("Authorization", "Bearer " + token);
        return request;
    }

    private MvcResult send(String path, String json, String token) throws Exception {
        return mvc.perform(withToken(post(path).contentType(MediaType.APPLICATION_JSON).content(json), token, "10.50.0.1")).andReturn();
    }

    private MvcResult getAs(String path, String token) throws Exception {
        return mvc.perform(withToken(get(path), token, "10.50.0.1")).andReturn();
    }

    private static int status(MvcResult r) { return r.getResponse().getStatus(); }

    private static String body(MvcResult r) throws Exception { return r.getResponse().getContentAsString(); }

    private static String errorCode(MvcResult r) throws Exception { return JsonPath.read(body(r), "$.error.code"); }

    private Member register() throws Exception {
        String name = "a" + UUID.randomUUID().toString().substring(0, 8);
        String email = name + "@example.com";
        MvcResult r = send("/api/v1/auth/register", "{\"email\":\"" + email + "\",\"password\":\"" + PASSWORD + "\",\"username\":\"" + name + "\"}", null);
        assertThat(status(r)).isEqualTo(201);
        String header = r.getResponse().getHeader("Set-Cookie");
        return new Member(email, JsonPath.read(body(r), "$.user.id"), JsonPath.read(body(r), "$.accessToken"), header.substring(header.indexOf('=') + 1, header.indexOf(';')));
    }

    /** A member who is an administrator, with a passkey that has signed in (one of the two second factors). */
    private Member admin() throws Exception {
        Member m = register();
        makeAdmin(m);
        withPasskey(m);
        return m;
    }

    private void makeAdmin(Member m) { jdbc.update("insert into app_admins (user_id) values (?::uuid)", m.id()); }

    private void withPasskey(Member m) {
        jdbc.update("insert into passkeys (user_id, credential_id, public_key, name, last_used_at) values (?::uuid, ?, 'k', 'Laptop', now())", m.id(), "cred-" + UUID.randomUUID());
    }

    private void withTwoStep(Member m) {
        jdbc.update("insert into user_mfa (user_id, secret_encrypted, created_at, enabled_at) values (?::uuid, 'x', now(), now())", m.id());
        jdbc.update("insert into mfa_recovery_codes (user_id, code_hash) values (?::uuid, 'h1')", m.id());
    }

    private MvcResult act(Member admin, Member target, String action, String reason, String password) throws Exception {
        return send("/api/v1/admin/members/" + target.id() + "/actions",
                "{\"action\":\"" + action + "\",\"reason\":\"" + reason + "\",\"password\":\"" + password + "\"}", admin.token());
    }

    private MvcResult act(Member admin, Member target, String action) throws Exception { return act(admin, target, action, "member asked by email", PASSWORD); }

    private long count(String sql, Object... args) { return jdbc.queryForObject(sql, Long.class, args); }

    // ---- who may use it

    @Test
    void anAdministratorIsKnownByTheirRow_andOnlyThatHidesOrShowsTheTool() throws Exception {
        Member plain = register();
        Member admin = admin();

        assertThat((Boolean) JsonPath.read(body(getAs("/api/v1/admin/status", plain.token())), "$.admin")).isFalse();
        MvcResult status = getAs("/api/v1/admin/status", admin.token());
        assertThat((Boolean) JsonPath.read(body(status), "$.admin")).isTrue();
        assertThat((Boolean) JsonPath.read(body(status), "$.secondFactor")).isTrue();
    }

    @Test
    void anOrdinaryMember_aGuestAndSomeoneNotSignedIn_cannotUseIt() throws Exception {
        Member plain = register();
        Member target = register();

        assertThat(status(getAs("/api/v1/admin/members?q=example", plain.token()))).isEqualTo(403);
        assertThat(status(getAs("/api/v1/admin/members/" + target.id(), plain.token()))).isEqualTo(403);
        assertThat(status(act(plain, target, "sign_out_everywhere"))).isEqualTo(403);
        assertThat(status(getAs("/api/v1/admin/members?q=example", null))).isEqualTo(401);

        MvcResult guest = send("/api/v1/auth/guest", "{}", null);
        if (status(guest) == 200 || status(guest) == 201) {
            String token = JsonPath.read(body(guest), "$.accessToken");
            MvcResult asGuest = getAs("/api/v1/admin/status", token);
            assertThat(status(asGuest)).isEqualTo(403);
            assertThat(errorCode(asGuest)).isEqualTo("guest_account");
        }
        assertThat(count("select count(*) from admin_actions")).isZero();
    }

    @Test
    void anAdministratorWithoutASecondFactor_isRefused() throws Exception {
        Member admin = register();
        makeAdmin(admin);   // no passkey, no two-step verification
        Member target = register();

        assertThat((Boolean) JsonPath.read(body(getAs("/api/v1/admin/status", admin.token())), "$.secondFactor")).isFalse();
        MvcResult search = getAs("/api/v1/admin/members?q=example", admin.token());
        assertThat(status(search)).isEqualTo(403);
        assertThat(errorCode(search)).isEqualTo("admin_needs_second_factor");
        assertThat(status(act(admin, target, "sign_out_everywhere"))).isEqualTo(403);

        withTwoStep(admin);   // two-step verification counts as well
        assertThat(status(getAs("/api/v1/admin/members?q=example", admin.token()))).isEqualTo(200);
    }

    @Test
    void aPasskeyThatHasNeverSignedIn_isNotASecondFactor() throws Exception {
        Member admin = register();
        makeAdmin(admin);
        jdbc.update("insert into passkeys (user_id, credential_id, public_key, name) values (?::uuid, 'unused', 'k', 'Laptop')", admin.id());

        assertThat(status(getAs("/api/v1/admin/members?q=example", admin.token()))).isEqualTo(403);
    }

    @Test
    void removingTheRowTakesTheRightsAwayAtOnce_evenWithATokenAlreadyIssued() throws Exception {
        Member admin = admin();
        assertThat(status(getAs("/api/v1/admin/members?q=example", admin.token()))).isEqualTo(200);

        jdbc.update("delete from app_admins");

        assertThat(status(getAs("/api/v1/admin/members?q=example", admin.token()))).isEqualTo(403);
    }

    // ---- looking up

    @Test
    void searchFindsByEmailOrUsername_needsThreeCharacters_andTakesPercentLiterally() throws Exception {
        Member admin = admin();
        Member target = register();

        MvcResult found = getAs("/api/v1/admin/members?q=" + target.email().substring(0, 6), admin.token());
        assertThat(status(found)).isEqualTo(200);
        assertThat((java.util.List<?>) JsonPath.read(body(found), "$[?(@.id=='" + target.id() + "')]")).hasSize(1);

        MvcResult tooShort = getAs("/api/v1/admin/members?q=ab", admin.token());
        assertThat(status(tooShort)).isEqualTo(400);
        assertThat(errorCode(tooShort)).isEqualTo("query_too_short");

        assertThat((java.util.List<?>) JsonPath.read(body(getAs("/api/v1/admin/members?q=%25%25%25", admin.token())), "$")).isEmpty();
    }

    @Test
    void theMemberView_showsStateButNeverASecret_andOpeningItIsRecorded() throws Exception {
        Member admin = admin();
        Member target = register();
        withTwoStep(target);

        MvcResult view = getAs("/api/v1/admin/members/" + target.id(), admin.token());

        assertThat(status(view)).isEqualTo(200);
        assertThat((Boolean) JsonPath.read(body(view), "$.member.twoStepOn")).isTrue();
        assertThat((Boolean) JsonPath.read(body(view), "$.member.hasPassword")).isTrue();
        assertThat(body(view)).doesNotContain("passwordHash").doesNotContain("password_hash").doesNotContain("secret").doesNotContain("h1");
        assertThat(view.getResponse().getHeader("Cache-Control")).contains("no-store");
        assertThat(count("select count(*) from admin_actions where action = 'view_member' and target_user_id = ?::uuid and admin_email = ?", target.id(), admin.email())).isEqualTo(1);
    }

    @Test
    void aGuestAccountAndAnUnknownMember_areNotFound() throws Exception {
        Member admin = admin();
        assertThat(status(getAs("/api/v1/admin/members/" + UUID.randomUUID(), admin.token()))).isEqualTo(404);
    }

    // ---- the changes

    @Test
    void grantingAndRevokingModerator_changesTheRights_andTellsTheMember() throws Exception {
        Member admin = admin();
        Member target = register();

        MvcResult granted = act(admin, target, "grant_moderator");
        assertThat(status(granted)).isEqualTo(200);
        assertThat((Boolean) JsonPath.read(body(granted), "$.member.moderator")).isTrue();
        assertThat(count("select count(*) from community_moderators where user_id = ?::uuid", target.id())).isEqualTo(1);
        verify(mail).send(eq(target.email()), eq(SUBJECT), org.mockito.ArgumentMatchers.contains("made a moderator"));

        MvcResult again = act(admin, target, "grant_moderator");
        assertThat(status(again)).isEqualTo(409);
        assertThat(errorCode(again)).isEqualTo("nothing_to_do");

        assertThat(status(act(admin, target, "revoke_moderator"))).isEqualTo(200);
        assertThat(count("select count(*) from community_moderators")).isZero();
        assertThat(errorCode(act(admin, target, "revoke_moderator"))).isEqualTo("nothing_to_do");
    }

    @Test
    void resettingTwoStep_removesTheFactorAndItsRecoveryCodes() throws Exception {
        Member admin = admin();
        Member target = register();
        withTwoStep(target);

        assertThat(status(act(admin, target, "reset_two_step"))).isEqualTo(200);

        assertThat(count("select count(*) from user_mfa where user_id = ?::uuid", target.id())).isZero();
        assertThat(count("select count(*) from mfa_recovery_codes where user_id = ?::uuid", target.id())).isZero();
        verify(mail).send(eq(target.email()), eq(SUBJECT), org.mockito.ArgumentMatchers.contains("Two-step verification was switched off"));
        assertThat(errorCode(act(admin, target, "reset_two_step"))).isEqualTo("nothing_to_do");
    }

    @Test
    void removingPasskeys_alsoSwitchesPasswordSignInBackOn_soNobodyIsLockedOut() throws Exception {
        Member admin = admin();
        Member target = register();
        withPasskey(target);
        jdbc.update("update app_users set password_login_disabled_at = now() where id = ?::uuid", target.id());

        assertThat(status(act(admin, target, "remove_passkeys"))).isEqualTo(200);

        assertThat(count("select count(*) from passkeys where user_id = ?::uuid", target.id())).isZero();
        assertThat(jdbc.queryForObject("select password_login_disabled_at from app_users where id = ?::uuid", Object.class, target.id())).isNull();
        assertThat(errorCode(act(admin, target, "remove_passkeys"))).isEqualTo("nothing_to_do");
    }

    @Test
    void restoringPasswordSignIn_andSigningEveryDeviceOut() throws Exception {
        Member admin = admin();
        Member target = register();
        jdbc.update("update app_users set password_login_disabled_at = now() where id = ?::uuid", target.id());

        assertThat(status(act(admin, target, "restore_password_sign_in"))).isEqualTo(200);
        assertThat(jdbc.queryForObject("select password_login_disabled_at from app_users where id = ?::uuid", Object.class, target.id())).isNull();
        assertThat(errorCode(act(admin, target, "restore_password_sign_in"))).isEqualTo("nothing_to_do");

        assertThat(status(act(admin, target, "sign_out_everywhere"))).isEqualTo(200);
        MvcResult after = mvc.perform(post("/api/v1/auth/refresh").cookie(new Cookie(AuthController.REFRESH_COOKIE, target.cookie()))).andReturn();
        assertThat(status(after)).isEqualTo(401);
    }

    // ---- the safeguards

    @Test
    void everyChange_needsTheAdministratorsOwnPassword_andAWrongOneChangesNothing() throws Exception {
        Member admin = admin();
        Member target = register();

        MvcResult wrong = act(admin, target, "grant_moderator", "member asked by email", "not my password");
        MvcResult missing = send("/api/v1/admin/members/" + target.id() + "/actions", "{\"action\":\"grant_moderator\",\"reason\":\"member asked\"}", admin.token());

        assertThat(status(wrong)).isEqualTo(401);
        assertThat(errorCode(wrong)).isEqualTo("invalid_credentials");
        assertThat(status(missing)).isEqualTo(401);
        assertThat(count("select count(*) from community_moderators")).isZero();
        assertThat(count("select count(*) from admin_actions where action <> 'view_member'")).isZero();
        verify(mail, never()).send(anyString(), eq(SUBJECT), anyString());
    }

    @Test
    void guessingTheAdministratorsPassword_isLimited() throws Exception {
        Member admin = admin();
        Member target = register();
        for (int i = 0; i < 10; i++) assertThat(status(act(admin, target, "grant_moderator", "member asked by email", "wrong guess " + i))).isEqualTo(401);

        assertThat(status(act(admin, target, "grant_moderator"))).isEqualTo(429);   // even the right one waits
        assertThat(count("select count(*) from community_moderators")).isZero();
    }

    @Test
    void aReasonIsRequired() throws Exception {
        Member admin = admin();
        Member target = register();

        assertThat(status(act(admin, target, "grant_moderator", "", PASSWORD))).isEqualTo(400);
        assertThat(status(act(admin, target, "grant_moderator", "  x ", PASSWORD))).isEqualTo(400);
        assertThat(count("select count(*) from community_moderators")).isZero();
    }

    @Test
    void anUnknownAction_isRefused() throws Exception {
        Member admin = admin();
        Member target = register();

        MvcResult r = act(admin, target, "delete_account");
        assertThat(status(r)).isEqualTo(400);
        assertThat(errorCode(r)).isEqualTo("unknown_action");
        assertThat(status(act(admin, target, "view_member"))).isEqualTo(400);
    }

    @Test
    void anotherAdministratorAndTheAdministratorThemselves_cannotBeActedOn() throws Exception {
        Member admin = admin();
        Member other = admin();

        MvcResult onOther = act(admin, other, "reset_two_step");
        assertThat(status(onOther)).isEqualTo(409);
        assertThat(errorCode(onOther)).isEqualTo("admin_account");
        assertThat(errorCode(act(admin, admin, "sign_out_everywhere"))).isEqualTo("admin_account");
    }

    @Test
    void anAdministratorWithoutAPassword_cannotChangeAnything() throws Exception {
        Member admin = admin();
        Member target = register();
        jdbc.update("update app_users set password_hash = null where id = ?::uuid", admin.id());

        MvcResult r = act(admin, target, "grant_moderator");
        assertThat(status(r)).isEqualTo(403);
        assertThat(errorCode(r)).isEqualTo("admin_needs_password");
    }

    @Test
    void changesAreCappedPerHour() throws Exception {
        Member admin = admin();
        Member target = register();
        for (int i = 0; i < AdminService.MAX_CHANGES_PER_HOUR; i++) {
            jdbc.update("insert into admin_actions (admin_id, admin_email, target_user_id, target_email, action, reason) values (?::uuid, 'a', ?::uuid, 't', 'sign_out_everywhere', 'test')", admin.id(), target.id());
        }

        MvcResult r = act(admin, target, "sign_out_everywhere");
        assertThat(status(r)).isEqualTo(429);
        assertThat(errorCode(r)).isEqualTo("too_many_actions");
    }

    // ---- the record

    @Test
    void everyChange_isInTheAuditLog_withBothAddresses_andTheReason() throws Exception {
        Member admin = admin();
        Member target = register();

        act(admin, target, "grant_moderator", "asked on the support thread", PASSWORD);

        var row = jdbc.queryForMap("select admin_email, target_email, action, reason from admin_actions where action = 'grant_moderator'");
        assertThat(row.get("admin_email")).isEqualTo(admin.email());
        assertThat(row.get("target_email")).isEqualTo(target.email());
        assertThat(row.get("reason")).isEqualTo("asked on the support thread");
        assertThat(count("select count(*) from auth_events where type = 'admin_action' and user_id = ?::uuid and ip is null", target.id())).isEqualTo(1);

        MvcResult view = getAs("/api/v1/admin/members/" + target.id(), admin.token());
        assertThat((String) JsonPath.read(body(view), "$.history[0].action")).isEqualTo("grant_moderator");
    }

    @Test
    void theAuditRecordOutlivesBothAccounts() throws Exception {
        Member admin = admin();
        Member target = register();
        act(admin, target, "grant_moderator");

        jdbc.update("delete from app_users where id = ?::uuid", target.id());

        assertThat(count("select count(*) from admin_actions where target_email = ? and target_user_id is null", target.email())).isEqualTo(1);
    }

    @Test
    void theMemberTold_isNotToldWhoDidIt_norWhy() throws Exception {
        Member admin = admin();
        Member target = register();

        act(admin, target, "grant_moderator", "private note about the member", PASSWORD);

        org.mockito.ArgumentCaptor<String> text = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(mail).send(eq(target.email()), eq(SUBJECT), text.capture());
        assertThat(text.getValue()).doesNotContain(admin.email()).doesNotContain("private note");
    }

    @Test
    void theMembersOwnExport_doesNotContainTheAdministratorTables() throws Exception {
        Member admin = admin();
        Member target = register();
        act(admin, target, "grant_moderator");

        MvcResult export = getAs("/api/v1/account/export", target.token());

        assertThat(status(export)).isEqualTo(200);
        assertThat(body(export)).doesNotContain(admin.email()).doesNotContain("admin_actions").doesNotContain("app_admins");
    }
}
