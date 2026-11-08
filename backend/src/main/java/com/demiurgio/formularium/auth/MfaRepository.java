package com.demiurgio.formularium.auth;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Storage for two-step verification: the encrypted secret, the recovery code hashes, and the one-time sign-in challenges. */
@Repository
class MfaRepository {
    record Factor(UUID userId, String secretEncrypted, Instant enabledAt, long lastUsedStep) {
        boolean enabled() { return enabledAt != null; }
    }

    record Challenge(UUID id, UUID userId, int attempts) { }

    private final JdbcClient jdbc;

    MfaRepository(JdbcClient jdbc) { this.jdbc = jdbc; }

    // ---- the secret

    Optional<Factor> findFactor(UUID userId) {
        return jdbc.sql("select user_id, secret_encrypted, enabled_at, last_used_step from user_mfa where user_id = :uid").param("uid", userId)
                .query((rs, n) -> new Factor(rs.getObject("user_id", UUID.class), rs.getString("secret_encrypted"),
                        rs.getTimestamp("enabled_at") == null ? null : rs.getTimestamp("enabled_at").toInstant(), rs.getLong("last_used_step")))
                .optional();
    }

    /** Starts (or restarts) setting up. A secret that was already switched on is never replaced here. */
    boolean savePending(UUID userId, String secretEncrypted, Instant now) {
        int changed = jdbc.sql("""
                insert into user_mfa (user_id, secret_encrypted, created_at) values (:uid, :secret, :now)
                on conflict (user_id) do update set secret_encrypted = excluded.secret_encrypted, created_at = excluded.created_at
                where user_mfa.enabled_at is null""")
                .param("uid", userId).param("secret", secretEncrypted).param("now", Timestamp.from(now)).update();
        return changed > 0;
    }

    /** Switches it on, once, with the step of the code that proved the member has it. */
    boolean enable(UUID userId, Instant now, long step) {
        return jdbc.sql("update user_mfa set enabled_at = :now, last_used_step = :step where user_id = :uid and enabled_at is null")
                .param("uid", userId).param("now", Timestamp.from(now)).param("step", step).update() > 0;
    }

    /** Records the step of an accepted code. False if that step, or a later one, was already used: this is what makes a code work only once. */
    boolean advanceStep(UUID userId, long step) {
        return jdbc.sql("update user_mfa set last_used_step = :step where user_id = :uid and last_used_step < :step").param("uid", userId).param("step", step).update() > 0;
    }

    void deleteFactor(UUID userId) {
        jdbc.sql("delete from mfa_recovery_codes where user_id = :uid").param("uid", userId).update();
        jdbc.sql("delete from mfa_challenges where user_id = :uid").param("uid", userId).update();
        jdbc.sql("delete from user_mfa where user_id = :uid").param("uid", userId).update();
    }

    // ---- recovery codes

    void replaceRecoveryCodes(UUID userId, List<String> hashes) {
        jdbc.sql("delete from mfa_recovery_codes where user_id = :uid").param("uid", userId).update();
        for (String hash : hashes) {
            jdbc.sql("insert into mfa_recovery_codes (id, user_id, code_hash) values (:id, :uid, :hash)")
                    .param("id", UUID.randomUUID()).param("uid", userId).param("hash", hash).update();
        }
    }

    /** Uses a recovery code up. False if there is no such unused code. */
    boolean useRecoveryCode(UUID userId, String hash, Instant now) {
        return jdbc.sql("update mfa_recovery_codes set used_at = :now where user_id = :uid and code_hash = :hash and used_at is null")
                .param("uid", userId).param("hash", hash).param("now", Timestamp.from(now)).update() > 0;
    }

    int recoveryCodesLeft(UUID userId) {
        return jdbc.sql("select count(*) from mfa_recovery_codes where user_id = :uid and used_at is null").param("uid", userId).query(Integer.class).single();
    }

    // ---- sign-in challenges

    void createChallenge(UUID userId, String tokenHash, Instant now, Instant expiresAt) {
        jdbc.sql("insert into mfa_challenges (id, user_id, token_hash, created_at, expires_at) values (:id, :uid, :hash, :now, :exp)")
                .param("id", UUID.randomUUID()).param("uid", userId).param("hash", tokenHash).param("now", Timestamp.from(now)).param("exp", Timestamp.from(expiresAt)).update();
    }

    Optional<Challenge> findChallenge(String tokenHash, Instant now) {
        return jdbc.sql("select id, user_id, attempts from mfa_challenges where token_hash = :hash and expires_at > :now").param("hash", tokenHash).param("now", Timestamp.from(now))
                .query((rs, n) -> new Challenge(rs.getObject("id", UUID.class), rs.getObject("user_id", UUID.class), rs.getInt("attempts"))).optional();
    }

    /** Counts a wrong try and returns the new total. */
    int addAttempt(UUID challengeId) {
        return jdbc.sql("update mfa_challenges set attempts = attempts + 1 where id = :id returning attempts").param("id", challengeId).query(Integer.class).optional().orElse(Integer.MAX_VALUE);
    }

    /** Uses the challenge up. False if someone else already did. */
    boolean deleteChallenge(UUID challengeId) {
        return jdbc.sql("delete from mfa_challenges where id = :id").param("id", challengeId).update() > 0;
    }

    void deleteExpiredChallenges(Instant now) {
        jdbc.sql("delete from mfa_challenges where expires_at < :now").param("now", Timestamp.from(now)).update();
    }
}
