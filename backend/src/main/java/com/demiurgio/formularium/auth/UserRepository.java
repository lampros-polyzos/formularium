package com.demiurgio.formularium.auth;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

@Repository
class UserRepository {
    private static final String COLUMNS = "id, email, password_hash, google_sub, username, email_verified_at, guest_expires_at, password_login_disabled_at, exists (select 1 from app_admins a where a.user_id = app_users.id) as is_admin";

    private final JdbcClient jdbc;

    UserRepository(JdbcClient jdbc) { this.jdbc = jdbc; }

    private static UserAccount map(ResultSet rs, int row) throws SQLException {
        return new UserAccount(rs.getObject("id", UUID.class), rs.getString("email"), rs.getString("password_hash"), rs.getString("google_sub"), rs.getString("username"), rs.getTimestamp("email_verified_at") != null,
                instant(rs.getTimestamp("guest_expires_at")), instant(rs.getTimestamp("password_login_disabled_at")), rs.getBoolean("is_admin"));
    }

    private static Instant instant(Timestamp timestamp) { return timestamp == null ? null : timestamp.toInstant(); }

    Optional<UserAccount> findByEmail(String email) {
        return jdbc.sql("select " + COLUMNS + " from app_users where lower(email) = lower(:email)").param("email", email).query(UserRepository::map).optional();
    }

    Optional<UserAccount> findById(UUID id) {
        return jdbc.sql("select " + COLUMNS + " from app_users where id = :id").param("id", id).query(UserRepository::map).optional();
    }

    Optional<UserAccount> findByGoogleSub(String sub) {
        return jdbc.sql("select " + COLUMNS + " from app_users where google_sub = :sub").param("sub", sub).query(UserRepository::map).optional();
    }

    boolean usernameTaken(String username) {
        return jdbc.sql("select count(*) from app_users where lower(username) = lower(:u)").param("u", username).query(Long.class).single() > 0;
    }

    /** @throws org.springframework.dao.DuplicateKeyException when the email, username or Google id is already used */
    UserAccount insert(String email, String passwordHash, String googleSub, String username, Instant verifiedAt) {
        return insert(email, passwordHash, googleSub, username, verifiedAt, null);
    }

    /** @param guestExpiresAt null for a real account; for a guest, the moment it is deleted */
    UserAccount insert(String email, String passwordHash, String googleSub, String username, Instant verifiedAt, Instant guestExpiresAt) {
        UUID id = UUID.randomUUID();
        jdbc.sql("insert into app_users (id, email, password_hash, google_sub, username, email_verified_at, guest_expires_at) values (:id, :email, :hash, :sub, :username, :verified, :guest)")
                .param("id", id).param("email", email).param("hash", passwordHash).param("sub", googleSub).param("username", username)
                .param("verified", verifiedAt == null ? null : Timestamp.from(verifiedAt))
                .param("guest", guestExpiresAt == null ? null : Timestamp.from(guestExpiresAt)).update();
        return new UserAccount(id, email, passwordHash, googleSub, username, verifiedAt != null, guestExpiresAt, null, false);
    }

    long countActiveGuests(Instant now) {
        return jdbc.sql("select count(*) from app_users where guest_expires_at > :now").param("now", Timestamp.from(now)).query(Long.class).single();
    }

    /** Deletes the guests whose time is up. Everything that belongs to them goes with them (every foreign key to app_users cascades). */
    int deleteExpiredGuests(Instant now) {
        return jdbc.sql("delete from app_users where guest_expires_at is not null and guest_expires_at <= :now").param("now", Timestamp.from(now)).update();
    }

    /** Marks the address as confirmed (keeps the first date if it already was). */
    void markEmailVerified(UUID id, Instant now) {
        jdbc.sql("update app_users set email_verified_at = coalesce(email_verified_at, :now) where id = :id").param("now", Timestamp.from(now)).param("id", id).update();
    }

    /** @param at when password sign-in was switched off; null switches it back on */
    void setPasswordLoginDisabled(UUID id, Instant at) {
        jdbc.sql("update app_users set password_login_disabled_at = :at where id = :id").param("at", at == null ? null : Timestamp.from(at)).param("id", id).update();
    }

    void setPassword(UUID id, String passwordHash) {
        jdbc.sql("update app_users set password_hash = :hash where id = :id").param("hash", passwordHash).param("id", id).update();
    }

    boolean usernameTakenByAnother(UUID id, String username) {
        return jdbc.sql("select count(*) from app_users where lower(username) = lower(:u) and id <> :id").param("u", username).param("id", id).query(Long.class).single() > 0;
    }

    void updateUsername(UUID id, String username) {
        jdbc.sql("update app_users set username = :u where id = :id").param("u", username).param("id", id).update();
    }

    void linkGoogle(UUID id, String sub) {
        jdbc.sql("update app_users set google_sub = :sub where id = :id").param("sub", sub).param("id", id).update();
    }

    void touchLogin(UUID id, Instant now) {
        jdbc.sql("update app_users set last_login_at = :now where id = :id").param("now", Timestamp.from(now)).param("id", id).update();
    }

    void delete(UUID id) {
        jdbc.sql("delete from app_users where id = :id").param("id", id).update();
    }
}
