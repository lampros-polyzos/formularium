package com.demiurgio.formularium.auth;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

/** Refresh tokens are stored only as a SHA-256 hash: a copy of the table cannot be used to sign in. */
@Repository
class RefreshTokenRepository {
    record Stored(UUID id, UUID userId, UUID familyId, Instant expiresAt, Instant revokedAt) { }

    private final JdbcClient jdbc;

    RefreshTokenRepository(JdbcClient jdbc) { this.jdbc = jdbc; }

    void insert(UUID userId, UUID familyId, String hash, Instant expiresAt, String userAgent) {
        String agent = userAgent == null ? null : userAgent.substring(0, Math.min(300, userAgent.length()));
        jdbc.sql("insert into refresh_tokens (id, user_id, family_id, token_hash, expires_at, user_agent) values (:id, :user, :family, :hash, :exp, :ua)")
                .param("id", UUID.randomUUID()).param("user", userId).param("family", familyId).param("hash", hash)
                .param("exp", Timestamp.from(expiresAt)).param("ua", agent).update();
    }

    Optional<Stored> findByHash(String hash) {
        return jdbc.sql("select id, user_id, family_id, expires_at, revoked_at from refresh_tokens where token_hash = :hash").param("hash", hash)
                .query((rs, row) -> new Stored(rs.getObject("id", UUID.class), rs.getObject("user_id", UUID.class), rs.getObject("family_id", UUID.class),
                        rs.getTimestamp("expires_at").toInstant(), rs.getTimestamp("revoked_at") == null ? null : rs.getTimestamp("revoked_at").toInstant()))
                .optional();
    }

    /** Marks one token used. Returns false when somebody else used it first, so only one of two racing requests wins. */
    boolean revoke(UUID id, Instant now) {
        return jdbc.sql("update refresh_tokens set revoked_at = :now where id = :id and revoked_at is null").param("now", Timestamp.from(now)).param("id", id).update() == 1;
    }

    /**
     * Ends every token of one sign-in (sign-out, or a stolen token seen again). They are stamped with the epoch rather than "now"
     * so they are never mistaken for a token that was swapped a moment ago.
     */
    void revokeFamily(UUID familyId) {
        jdbc.sql("update refresh_tokens set revoked_at = :epoch where family_id = :family and revoked_at is null").param("epoch", Timestamp.from(Instant.EPOCH)).param("family", familyId).update();
    }

    /** Signs the person out everywhere (after a password reset). */
    void revokeAllForUser(UUID userId) {
        jdbc.sql("update refresh_tokens set revoked_at = :epoch where user_id = :user and revoked_at is null").param("epoch", Timestamp.from(Instant.EPOCH)).param("user", userId).update();
    }

    void deleteExpired(Instant now) {
        jdbc.sql("delete from refresh_tokens where expires_at < :now").param("now", Timestamp.from(now)).update();
    }
}
