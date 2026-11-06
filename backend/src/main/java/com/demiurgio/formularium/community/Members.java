package com.demiurgio.formularium.community;

import com.demiurgio.formularium.auth.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

/** Small facts about members that the community rules need: the name shown on their posts, whether they moderate, and how much they have posted lately. */
@Component
public class Members {
    /** Shown when a member has no name (the database used the same words). */
    static final String ANONYMOUS = "Anonymous Formulary";

    private final JdbcClient jdbc;

    Members(JdbcClient jdbc) { this.jdbc = jdbc; }

    /** The name a member's posts, comments and ratings carry. It always comes from the account, never from the request. */
    public String displayName(UUID uid) {
        if (uid == null) return ANONYMOUS;
        String name = jdbc.sql("select username from app_users where id = :id").param("id", uid).query(String.class).optional().orElse(null);
        return name == null || name.isBlank() ? ANONYMOUS : name;
    }

    public boolean isModerator(UUID uid) {
        return jdbc.sql("select count(*) from community_moderators where user_id = :uid").param("uid", uid).query(Long.class).single() > 0;
    }

    /** How many rows the member added to a table recently (the table and column are fixed names in this code, never request text). */
    long recent(String table, String ownerColumn, UUID uid, Duration within) {
        return jdbc.sql("select count(*) from " + table + " where " + ownerColumn + " = :uid and created_at > :since")
                .param("uid", uid).param("since", Timestamp.from(Instant.now().minus(within))).query(Long.class).single();
    }

    /** Refuses with a "slow down" answer once a member has done something `limit` times within the period. */
    void limit(String table, String ownerColumn, UUID uid, Duration within, int limit, String message) {
        if (recent(table, ownerColumn, uid, within) >= limit) throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "too_many_requests", message);
    }
}
