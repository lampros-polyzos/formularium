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

/** Storage for the admin tool: who is an administrator, what a member's account looks like to one, and the audit trail of what administrators did. */
@Repository
class AdminRepository {
    /** A member's account as an administrator sees it: state only, never a secret, and no address of any sign-in. */
    record Member(UUID id, String email, String username, boolean emailVerified, boolean hasPassword, boolean passwordSignInOff, boolean googleLinked,
                  boolean moderator, boolean twoStepOn, long passkeys, long passkeysUsed, Instant createdAt, Instant lastLoginAt) { }

    record Event(String type, Instant at) { }

    record Device(String userAgent, Instant firstSeenAt, Instant lastSeenAt) { }

    record Action(String adminEmail, String action, String reason, Instant at) { }

    private static final String MEMBER = """
            select u.id, u.email, u.username, u.email_verified_at is not null as verified, u.password_hash is not null as has_password,
                   u.password_login_disabled_at is not null as password_off, u.google_sub is not null as google, u.created_at, u.last_login_at,
                   exists (select 1 from community_moderators m where m.user_id = u.id) as moderator,
                   exists (select 1 from user_mfa f where f.user_id = u.id and f.enabled_at is not null) as two_step,
                   (select count(*) from passkeys p where p.user_id = u.id) as passkeys,
                   (select count(*) from passkeys p where p.user_id = u.id and p.last_used_at is not null) as passkeys_used
            from app_users u""";

    private final JdbcClient jdbc;

    AdminRepository(JdbcClient jdbc) { this.jdbc = jdbc; }

    private static Instant instant(Timestamp t) { return t == null ? null : t.toInstant(); }

    private static Member member(ResultSet rs, int row) throws SQLException {
        return new Member(rs.getObject("id", UUID.class), rs.getString("email"), rs.getString("username"), rs.getBoolean("verified"), rs.getBoolean("has_password"),
                rs.getBoolean("password_off"), rs.getBoolean("google"), rs.getBoolean("moderator"), rs.getBoolean("two_step"), rs.getLong("passkeys"),
                rs.getLong("passkeys_used"), instant(rs.getTimestamp("created_at")), instant(rs.getTimestamp("last_login_at")));
    }

    boolean isAdmin(UUID userId) {
        return jdbc.sql("select count(*) from app_admins where user_id = :id").param("id", userId).query(Long.class).single() > 0;
    }

    /** Real members only (a guest's account is temporary and cannot be acted on). {@code like} is an already escaped pattern. */
    List<Member> search(String like) {
        return jdbc.sql(MEMBER + " where u.guest_expires_at is null and (lower(u.email) like :p escape '\\' or lower(u.username) like :p escape '\\') order by u.email limit 20")
                .param("p", like).query(AdminRepository::member).list();
    }

    Optional<Member> find(UUID id) {
        return jdbc.sql(MEMBER + " where u.id = :id").param("id", id).query(AdminRepository::member).optional();
    }

    List<Event> recentEvents(UUID userId) {
        return jdbc.sql("select type, at from auth_events where user_id = :id order by at desc limit 15").param("id", userId)
                .query((rs, n) -> new Event(rs.getString("type"), rs.getTimestamp("at").toInstant())).list();
    }

    List<Device> devices(UUID userId) {
        return jdbc.sql("select user_agent, first_seen_at, last_seen_at from known_devices where user_id = :id order by last_seen_at desc limit 10").param("id", userId)
                .query((rs, n) -> new Device(rs.getString("user_agent"), rs.getTimestamp("first_seen_at").toInstant(), rs.getTimestamp("last_seen_at").toInstant())).list();
    }

    List<Action> actionsOn(UUID userId) {
        return jdbc.sql("select admin_email, action, reason, created_at from admin_actions where target_user_id = :id and action <> 'view_member' order by created_at desc limit 10")
                .param("id", userId).query((rs, n) -> new Action(rs.getString("admin_email"), rs.getString("action"), rs.getString("reason"), rs.getTimestamp("created_at").toInstant())).list();
    }

    void record(UUID adminId, String adminEmail, UUID targetId, String targetEmail, String action, String reason, Instant at) {
        jdbc.sql("insert into admin_actions (id, admin_id, admin_email, target_user_id, target_email, action, reason, created_at) values (:id, :admin, :aemail, :target, :temail, :action, :reason, :at)")
                .param("id", UUID.randomUUID()).param("admin", adminId).param("aemail", adminEmail).param("target", targetId).param("temail", targetEmail)
                .param("action", action).param("reason", reason).param("at", Timestamp.from(at)).update();
    }

    /** Changes made (not lookups) by this administrator since {@code from}: the hourly cap. */
    long changesSince(UUID adminId, Instant from) {
        return jdbc.sql("select count(*) from admin_actions where admin_id = :id and action <> 'view_member' and created_at >= :from")
                .param("id", adminId).param("from", Timestamp.from(from)).query(Long.class).single();
    }

    int deleteOlderThan(Instant cutoff) {
        return jdbc.sql("delete from admin_actions where created_at < :cutoff").param("cutoff", Timestamp.from(cutoff)).update();
    }

    boolean grantModerator(UUID userId) {
        return jdbc.sql("insert into community_moderators (user_id) values (:id) on conflict (user_id) do nothing").param("id", userId).update() == 1;
    }

    boolean revokeModerator(UUID userId) {
        return jdbc.sql("delete from community_moderators where user_id = :id").param("id", userId).update() == 1;
    }

    int deletePasskeys(UUID userId) {
        return jdbc.sql("delete from passkeys where user_id = :id").param("id", userId).update();
    }
}
