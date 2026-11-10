package com.demiurgio.formularium.auth;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;

/**
 * The audit trail of the account system, kept in the database so it is shared by every instance of the backend and survives restarts.
 * The login throttle reads the same rows. No passwords, and no raw email addresses: an email is only ever stored as a hash.
 */
@Repository
class AuthEvents {
    static final String LOGIN_SUCCESS = "login_success";
    static final String LOGIN_FAILED = "login_failed";
    static final String GOOGLE_LOGIN = "google_login";
    static final String REGISTER = "register";
    static final String EMAIL_VERIFIED = "email_verified";
    /** A confirmation or reset email was asked for; counted per address to stop the endpoints being used to flood inboxes. */
    static final String EMAIL_REQUESTED = "email_requested";
    static final String PASSWORD_RESET_REQUESTED = "password_reset_requested";
    static final String PASSWORD_RESET_DONE = "password_reset_done";
    /** An already-used refresh token came back after the grace period: the sign-in was ended as possibly stolen. */
    static final String REFRESH_REUSE = "refresh_reuse";
    /** A guest ("Try the demo") account was made; counted per address so one connection cannot make them without end. */
    static final String GUEST_CREATED = "guest_created";
    /** A passkey was added or removed (a change to which devices may sign in). */
    static final String PASSKEY_ADDED = "passkey_added";
    static final String PASSKEY_REMOVED = "passkey_removed";
    static final String PASSKEY_LOGIN = "passkey_login";
    /** A passkey sign-in that did not check out, or a wrong password when changing passkeys. Counted per address, and per account for the password. */
    static final String PASSKEY_FAILED = "passkey_failed";
    /** A passkey sign-in was started (a challenge was asked for); counted per address so the endpoint cannot be used to fill the table. */
    static final String PASSKEY_LOGIN_STARTED = "passkey_login_started";
    /** Password sign-in was switched off or on for an account (switched on again by the member, or by a password reset). */
    static final String PASSWORD_LOGIN_DISABLED = "password_login_disabled";
    static final String PASSWORD_LOGIN_ENABLED = "password_login_enabled";
    /** The RIGHT password was given for an account that has password sign-in switched off, and was refused. Not counted as a failure: nothing was guessed. */
    static final String PASSWORD_LOGIN_REFUSED = "password_login_refused";
    /** A signed-in member changed their password. */
    static final String PASSWORD_CHANGED = "password_changed";
    /** A wrong current password when changing it; counted per account and per address. */
    static final String PASSWORD_CHANGE_FAILED = "password_change_failed";
    static final String MFA_ENABLED = "mfa_enabled";
    static final String MFA_DISABLED = "mfa_disabled";
    /** A wrong authenticator or recovery code (or, when setting up, a wrong password). Counted per account and per address. */
    static final String MFA_FAILED = "mfa_failed";
    static final String MFA_LOGIN_SUCCESS = "mfa_login_success";
    static final String RECOVERY_CODE_USED = "recovery_code_used";
    static final String RECOVERY_CODES_RENEWED = "recovery_codes_renewed";

    private final JdbcClient jdbc;

    AuthEvents(JdbcClient jdbc) { this.jdbc = jdbc; }

    void record(String type, String emailHash, String ip, UUID userId, String userAgent, Instant at) {
        jdbc.sql("insert into auth_events (id, at, type, email_hash, ip, user_id, user_agent) values (:id, :at, :type, :email, :ip, :user, :agent)")
                .param("id", UUID.randomUUID()).param("at", Timestamp.from(at)).param("type", type).param("email", emailHash)
                .param("ip", truncate(ip, 64)).param("user", userId).param("agent", truncate(userAgent, 300)).update();
    }

    /**
     * Failures of {@code type} for this email from this address since the last success (a right password clears the slate for that pair only),
     * within the window. Only events up to {@code now} count, so a clock that was moved ahead in a test cannot block later ones.
     */
    long failuresForPair(String emailHash, String ip, Instant from, Instant now) {
        return jdbc.sql("""
                select count(*) from auth_events f
                where f.type = :failed and f.email_hash = :email and f.ip = :ip and f.at >= :from and f.at <= :now
                  and f.at > coalesce((select max(s.at) from auth_events s where s.type = :success and s.email_hash = :email and s.ip = :ip and s.at <= :now), :from)""")
                .param("failed", LOGIN_FAILED).param("success", LOGIN_SUCCESS).param("email", emailHash).param("ip", truncate(ip, 64))
                .param("from", Timestamp.from(from)).param("now", Timestamp.from(now)).query(Long.class).single();
    }

    long count(String type, String column, String value, Instant from, Instant now) {
        if (!column.equals("email_hash") && !column.equals("ip")) throw new IllegalArgumentException(column);
        return jdbc.sql("select count(*) from auth_events where type = :type and " + column + " = :value and at >= :from and at <= :now")
                .param("type", type).param("value", column.equals("ip") ? truncate(value, 64) : value)
                .param("from", Timestamp.from(from)).param("now", Timestamp.from(now)).query(Long.class).single();
    }

    long countForUser(String type, UUID userId, Instant from, Instant now) {
        return jdbc.sql("select count(*) from auth_events where type = :type and user_id = :user and at >= :from and at <= :now")
                .param("type", type).param("user", userId).param("from", Timestamp.from(from)).param("now", Timestamp.from(now)).query(Long.class).single();
    }

    void deleteOlderThan(Instant cutoff) {
        jdbc.sql("delete from auth_events where at < :cutoff").param("cutoff", Timestamp.from(cutoff)).update();
    }

    private static String truncate(String s, int max) {
        return s == null || s.length() <= max ? s : s.substring(0, max);
    }
}
