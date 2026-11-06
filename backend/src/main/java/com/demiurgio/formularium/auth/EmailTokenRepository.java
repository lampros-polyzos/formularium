package com.demiurgio.formularium.auth;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

/** One-time links sent by email (confirm an address, reset a password). Stored only as a SHA-256 hash, like refresh tokens. */
@Repository
class EmailTokenRepository {
    static final String VERIFY = "verify";
    static final String RESET = "reset";

    record Found(UUID id, UUID userId) { }

    private final JdbcClient jdbc;

    EmailTokenRepository(JdbcClient jdbc) { this.jdbc = jdbc; }

    void insert(UUID userId, String purpose, String hash, Instant now, Instant expiresAt) {
        jdbc.sql("insert into email_tokens (id, user_id, purpose, token_hash, created_at, expires_at) values (:id, :user, :purpose, :hash, :now, :exp)")
                .param("id", UUID.randomUUID()).param("user", userId).param("purpose", purpose).param("hash", hash)
                .param("now", Timestamp.from(now)).param("exp", Timestamp.from(expiresAt)).update();
    }

    /** A link that exists, is for this purpose, was not used and has not expired. */
    Optional<Found> findUsable(String hash, String purpose, Instant now) {
        return jdbc.sql("select id, user_id from email_tokens where token_hash = :hash and purpose = :purpose and used_at is null and expires_at > :now")
                .param("hash", hash).param("purpose", purpose).param("now", Timestamp.from(now))
                .query((rs, row) -> new Found(rs.getObject("id", UUID.class), rs.getObject("user_id", UUID.class))).optional();
    }

    /** Uses a link up. False when somebody used it first, so a link works once even if clicked twice at the same moment. */
    boolean markUsed(UUID id, Instant now) {
        return jdbc.sql("update email_tokens set used_at = :now where id = :id and used_at is null").param("now", Timestamp.from(now)).param("id", id).update() == 1;
    }

    /** Cancels every unused link of this kind, so only the newest one works. */
    void cancelUnused(UUID userId, String purpose, Instant now) {
        jdbc.sql("update email_tokens set used_at = :now where user_id = :user and purpose = :purpose and used_at is null")
                .param("now", Timestamp.from(now)).param("user", userId).param("purpose", purpose).update();
    }

    Optional<Instant> lastSent(UUID userId, String purpose) {
        return jdbc.sql("select max(created_at) from email_tokens where user_id = :user and purpose = :purpose").param("user", userId).param("purpose", purpose)
                .query((rs, row) -> rs.getTimestamp(1) == null ? null : rs.getTimestamp(1).toInstant()).optional();
    }

    void deleteExpired(Instant now) {
        jdbc.sql("delete from email_tokens where expires_at < :now").param("now", Timestamp.from(now)).update();
    }
}
