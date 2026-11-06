package com.demiurgio.formularium.community;

import com.demiurgio.formularium.auth.ApiException;
import com.demiurgio.formularium.library.Rows;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Notifications are made by the rules below (a new comment, a first rating), never by a request, so nobody can send one to someone else. */
@Service
public class NotificationService {
    private final JdbcClient jdbc;

    NotificationService(JdbcClient jdbc) { this.jdbc = jdbc; }

    /** Tells a post's author that someone commented on or rated it. Nothing is sent to someone about their own action. */
    @Transactional
    void aboutPost(UUID postId, UUID actor, String actorName, String kind) {
        UUID author = jdbc.sql("select author_id from community_posts where id = :id").param("id", postId).query((rs, n) -> rs.getObject(1, UUID.class)).optional().orElse(null);
        if (author == null || author.equals(actor)) return;
        jdbc.sql("insert into notifications (id, recipient_id, actor_name, post_id, type, is_read) values (:id, :recipient, :actor, :post, :type, false)")
                .param("id", UUID.randomUUID()).param("recipient", author).param("actor", actorName).param("post", postId).param("type", kind).update();
    }

    /** The member's unread notifications, newest first. */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> unread(UUID uid) {
        return jdbc.sql("select id, recipient_id, actor_name, post_id, type, is_read, created_at from notifications where recipient_id = :uid and is_read = false order by created_at desc")
                .param("uid", uid).query(Rows::map).list();
    }

    @Transactional
    public void markRead(UUID uid, UUID id) {
        if (jdbc.sql("update notifications set is_read = true where id = :id and recipient_id = :uid").param("id", id).param("uid", uid).update() == 0) {
            throw new ApiException(HttpStatus.NOT_FOUND, "not_found", "That notification does not exist.");
        }
    }
}
