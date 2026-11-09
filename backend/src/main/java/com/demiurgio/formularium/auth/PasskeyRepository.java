package com.demiurgio.formularium.auth;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** The passkeys of the members (what is needed to check one later: never a secret), and the challenges of registrations and sign-ins under way. */
@Repository
class PasskeyRepository {
    /** One registered passkey. {@code credentialId} and {@code publicKey} are base64url text. */
    record Passkey(UUID id, UUID userId, String credentialId, String publicKey, long signCount, String name, boolean backupEligible, boolean backupState,
                   Instant createdAt, Instant lastUsedAt) { }

    /** A challenge that is waiting for its answer. {@code userId} is empty for a sign-in. */
    record Challenge(UUID id, UUID userId, String requestJson) { }

    private static final String COLUMNS = "id, user_id, credential_id, public_key, sign_count, name, backup_eligible, backup_state, created_at, last_used_at";

    private final JdbcClient jdbc;

    PasskeyRepository(JdbcClient jdbc) { this.jdbc = jdbc; }

    private static Passkey map(ResultSet rs, int row) throws SQLException {
        Timestamp lastUsed = rs.getTimestamp("last_used_at");
        return new Passkey(rs.getObject("id", UUID.class), rs.getObject("user_id", UUID.class), rs.getString("credential_id"), rs.getString("public_key"),
                rs.getLong("sign_count"), rs.getString("name"), rs.getBoolean("backup_eligible"), rs.getBoolean("backup_state"),
                rs.getTimestamp("created_at").toInstant(), lastUsed == null ? null : lastUsed.toInstant());
    }

    List<Passkey> forUser(UUID userId) {
        return jdbc.sql("select " + COLUMNS + " from passkeys where user_id = :user order by created_at").param("user", userId).query(PasskeyRepository::map).list();
    }

    long count(UUID userId) {
        return jdbc.sql("select count(*) from passkeys where user_id = :user").param("user", userId).query(Long.class).single();
    }

    Optional<Passkey> byCredentialId(String credentialId) {
        return jdbc.sql("select " + COLUMNS + " from passkeys where credential_id = :id").param("id", credentialId).query(PasskeyRepository::map).optional();
    }

    /** @throws org.springframework.dao.DuplicateKeyException when this credential is already registered (to anyone) */
    UUID insert(UUID userId, String credentialId, String publicKey, long signCount, String name, boolean backupEligible, boolean backupState, Instant now) {
        UUID id = UUID.randomUUID();
        jdbc.sql("insert into passkeys (id, user_id, credential_id, public_key, sign_count, name, backup_eligible, backup_state, created_at) values (:id, :user, :cred, :key, :count, :name, :eligible, :state, :now)")
                .param("id", id).param("user", userId).param("cred", credentialId).param("key", publicKey).param("count", signCount).param("name", name)
                .param("eligible", backupEligible).param("state", backupState).param("now", Timestamp.from(now)).update();
        return id;
    }

    /** After a successful sign-in: the counter the authenticator reported, whether the passkey is synced now, and when. */
    void used(UUID id, long signCount, boolean backupState, Instant now) {
        jdbc.sql("update passkeys set sign_count = :count, backup_state = :state, last_used_at = :now where id = :id")
                .param("count", signCount).param("state", backupState).param("now", Timestamp.from(now)).param("id", id).update();
    }

    /** @return false when the member has no such passkey (someone else's counts as none) */
    boolean delete(UUID id, UUID userId) {
        return jdbc.sql("delete from passkeys where id = :id and user_id = :user").param("id", id).param("user", userId).update() == 1;
    }

    // ---- challenges

    UUID saveChallenge(String purpose, UUID userId, String requestJson, Instant expiresAt) {
        UUID id = UUID.randomUUID();
        jdbc.sql("insert into webauthn_challenges (id, purpose, user_id, request_json, expires_at) values (:id, :purpose, :user, :json, :expires)")
                .param("id", id).param("purpose", purpose).param("user", userId).param("json", requestJson).param("expires", Timestamp.from(expiresAt)).update();
        return id;
    }

    /** Uses the challenge up: it is deleted as it is read, so an answer can be given once, and an expired or wrong-purpose one is never returned. */
    Optional<Challenge> takeChallenge(UUID id, String purpose, Instant now) {
        return jdbc.sql("delete from webauthn_challenges where id = :id and purpose = :purpose and expires_at > :now returning id, user_id, request_json")
                .param("id", id).param("purpose", purpose).param("now", Timestamp.from(now))
                .query((rs, row) -> new Challenge(rs.getObject("id", UUID.class), rs.getObject("user_id", UUID.class), rs.getString("request_json"))).optional();
    }

    void deleteExpiredChallenges(Instant now) {
        jdbc.sql("delete from webauthn_challenges where expires_at <= :now").param("now", Timestamp.from(now)).update();
    }
}
