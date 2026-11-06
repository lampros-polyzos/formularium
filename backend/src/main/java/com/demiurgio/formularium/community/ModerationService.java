package com.demiurgio.formularium.community;

import com.demiurgio.formularium.auth.ApiException;
import com.demiurgio.formularium.library.Rows;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Reports, moderators and muting. Members report a post or a comment; moderators (listed in community_moderators) see the open reports,
 * close them and remove what was reported. A member can also mute another member: that hides their posts and comments from this member only.
 */
@Service
public class ModerationService {
    static final int REPORTS_PER_DAY = 20;

    private final JdbcClient jdbc;
    private final Members members;

    ModerationService(JdbcClient jdbc, Members members) {
        this.jdbc = jdbc;
        this.members = members;
    }

    // ---- reports

    /** Sends a report. What it is about is kept with it, so it can still be read after the content is removed. */
    @Transactional
    public void report(UUID uid, CommunityRequests.Report body) {
        UUID postId;
        UUID targetAuthor;
        String snapshot;
        if ("post".equals(body.targetType())) {
            Map<String, Object> post = jdbc.sql("select id, author_id, title from community_posts where id = :id").param("id", body.targetId()).query(Rows::map).optional()
                    .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "not_found", "That post no longer exists."));
            postId = (UUID) post.get("id");
            targetAuthor = (UUID) post.get("author_id");
            snapshot = cut(String.valueOf(post.get("title")), 200);
        } else {
            Map<String, Object> comment = jdbc.sql("select post_id, author_id, body from post_comments where id = :id").param("id", body.targetId()).query(Rows::map).optional()
                    .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "not_found", "That comment no longer exists."));
            postId = (UUID) comment.get("post_id");
            targetAuthor = (UUID) comment.get("author_id");
            snapshot = cut(String.valueOf(comment.get("body")), 300);
        }
        if (uid.equals(targetAuthor)) throw new ApiException(HttpStatus.BAD_REQUEST, "own_content", "You cannot report your own content.");
        members.limit("content_reports", "reporter_id", uid, Duration.ofDays(1), REPORTS_PER_DAY, "You have sent a lot of reports today. Please try again tomorrow.");
        try {
            jdbc.sql("""
                    insert into content_reports (id, reporter_id, target_type, target_id, post_id, target_author_id, snapshot, reason, details, status)
                    values (:id, :uid, :type, :target, :post, :author, :snapshot, :reason, :details, 'open')""")
                    .param("id", UUID.randomUUID()).param("uid", uid).param("type", body.targetType()).param("target", body.targetId()).param("post", postId)
                    .param("author", targetAuthor, java.sql.Types.OTHER).param("snapshot", snapshot).param("reason", body.reason())
                    .param("details", body.details() == null || body.details().isBlank() ? null : body.details().trim()).update();
        } catch (DuplicateKeyException e) {
            throw new ApiException(HttpStatus.CONFLICT, "already_reported", "You have already reported this.");
        }
    }

    /** The open reports, oldest first. Moderators only. */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> openReports(UUID uid) {
        requireModerator(uid);
        return jdbc.sql("select id, target_type, target_id, post_id, target_author_id, snapshot, reason, details, status, created_at from content_reports where status = 'open' order by created_at, id")
                .query(Rows::map).list();
    }

    /** Closes a report, and when asked removes what was reported. Moderators only. */
    @Transactional
    public void resolve(UUID uid, UUID reportId, String outcome, boolean remove) {
        requireModerator(uid);
        Map<String, Object> report = jdbc.sql("select id, target_type, target_id, status from content_reports where id = :id").param("id", reportId).query(Rows::map).optional()
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "not_found", "That report does not exist."));
        if (!"open".equals(report.get("status"))) throw new ApiException(HttpStatus.CONFLICT, "already_closed", "That report was already closed.");
        if (remove) {
            // Removing what is already gone is fine: the report is still closed
            jdbc.sql("delete from " + ("post".equals(report.get("target_type")) ? "community_posts" : "post_comments") + " where id = :id").param("id", report.get("target_id")).update();
        }
        jdbc.sql("update content_reports set status = :outcome, resolved_by = :uid, resolved_at = current_timestamp where id = :id").param("outcome", outcome).param("uid", uid).param("id", reportId).update();
    }

    public boolean isModerator(UUID uid) { return members.isModerator(uid); }

    private void requireModerator(UUID uid) {
        if (!members.isModerator(uid)) throw new ApiException(HttpStatus.FORBIDDEN, "forbidden", "You are not allowed to do that.");
    }

    // ---- muting

    @Transactional(readOnly = true)
    public List<UUID> mutes(UUID uid) {
        return jdbc.sql("select muted_user_id from community_mutes where user_id = :uid").param("uid", uid).query((rs, n) -> rs.getObject(1, UUID.class)).list();
    }

    @Transactional
    public void mute(UUID uid, UUID other) {
        if (uid.equals(other)) throw new ApiException(HttpStatus.BAD_REQUEST, "invalid_request", "You cannot mute yourself.");
        long exists = jdbc.sql("select count(*) from app_users where id = :id").param("id", other).query(Long.class).single();
        if (exists == 0) throw new ApiException(HttpStatus.NOT_FOUND, "not_found", "That member does not exist.");
        long already = jdbc.sql("select count(*) from community_mutes where user_id = :uid and muted_user_id = :other").param("uid", uid).param("other", other).query(Long.class).single();
        if (already == 0) jdbc.sql("insert into community_mutes (user_id, muted_user_id) values (:uid, :other)").param("uid", uid).param("other", other).update();
    }

    @Transactional
    public void unmute(UUID uid, UUID other) {
        jdbc.sql("delete from community_mutes where user_id = :uid and muted_user_id = :other").param("uid", uid).param("other", other).update();
    }

    private static String cut(String text, int max) { return text.length() <= max ? text : text.substring(0, max); }
}
