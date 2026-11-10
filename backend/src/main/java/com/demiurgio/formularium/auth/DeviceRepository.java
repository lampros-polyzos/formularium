package com.demiurgio.formularium.auth;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;

/** The browsers an account has signed in from, each as a hash of the identifier that browser keeps in a cookie. */
@Repository
class DeviceRepository {
    private final JdbcClient jdbc;

    DeviceRepository(JdbcClient jdbc) { this.jdbc = jdbc; }

    /** @return true when this account already knows this browser (and notes that it was seen now) */
    boolean touch(UUID userId, String deviceHash, Instant now, String userAgent) {
        return jdbc.sql("update known_devices set last_seen_at = :now, user_agent = :ua where user_id = :user and device_hash = :hash")
                .param("now", Timestamp.from(now)).param("ua", truncate(userAgent)).param("user", userId).param("hash", deviceHash).update() == 1;
    }

    long count(UUID userId) {
        return jdbc.sql("select count(*) from known_devices where user_id = :user").param("user", userId).query(Long.class).single();
    }

    /** @return true when this call added it, false when a request at the same moment already had (so only one of two racing sign-ins reports it) */
    boolean insert(UUID userId, String deviceHash, String userAgent, Instant now) {
        return jdbc.sql("insert into known_devices (user_id, device_hash, user_agent, first_seen_at, last_seen_at) values (:user, :hash, :ua, :now, :now) on conflict (user_id, device_hash) do nothing")
                .param("user", userId).param("hash", deviceHash).param("ua", truncate(userAgent)).param("now", Timestamp.from(now)).update() == 1;
    }

    int deleteUnseenSince(Instant cutoff) {
        return jdbc.sql("delete from known_devices where last_seen_at < :cutoff").param("cutoff", Timestamp.from(cutoff)).update();
    }

    private static String truncate(String s) { return s == null || s.length() <= 300 ? s : s.substring(0, 300); }
}
