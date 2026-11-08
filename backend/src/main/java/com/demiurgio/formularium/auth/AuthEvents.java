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

    void deleteOlderThan(Instant cutoff) {
        jdbc.sql("delete from auth_events where at < :cutoff").param("cutoff", Timestamp.from(cutoff)).update();
    }

    private static String truncate(String s, int max) {
        return s == null || s.length() <= max ? s : s.substring(0, max);
    }
}
