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

/**
 * Ratings of shared recipes. A member rates another member's recipe once and can change it later. Only people who made the recipe
 * can score the details (texture, stability, ease, efficacy, skin type). The first rating tells the recipe's author; changing it does not.
 */
@Service
public class RatingService {
    private static final String COLUMNS = "r.id, r.post_id, r.user_id, r.author_name, r.version, r.overall, r.texture, r.stability, r.ease, r.efficacy, r.made_it, r.skin_type, r.review, r.created_at, r.updated_at";

    private final JdbcClient jdbc;
    private final Members members;
    private final NotificationService notifications;

    RatingService(JdbcClient jdbc, Members members, NotificationService notifications) {
        this.jdbc = jdbc;
        this.members = members;
        this.notifications = notifications;
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> forPost(UUID postId) {
        return jdbc.sql("select " + COLUMNS + " from recipe_ratings r where r.post_id = :id order by r.updated_at desc, r.id").param("id", postId).query(Rows::map).list();
    }

    /** Just the scores, for the feed to show stars: many recipes at once. */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> scoresFor(List<UUID> postIds) {
        if (postIds.isEmpty()) return List.of();
        return jdbc.sql("select r.post_id, r.overall, r.made_it from recipe_ratings r where r.post_id in (:ids)").param("ids", postIds).query(Rows::map).list();
    }

    @Transactional
    public Map<String, Object> rate(UUID uid, UUID postId, CommunityRequests.Rating body) {
        Map<String, Object> post = jdbc.sql("select author_id, post_type from community_posts where id = :id").param("id", postId).query(Rows::map).optional()
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "not_found", "Post not found."));
        if (!"formulation".equals(post.get("post_type"))) throw new ApiException(HttpStatus.BAD_REQUEST, "not_a_recipe", "Only shared recipes can be rated.");
        if (uid.equals(post.get("author_id"))) throw new ApiException(HttpStatus.BAD_REQUEST, "own_recipe", "You cannot rate your own recipe.");

        boolean madeIt = Boolean.TRUE.equals(body.madeIt());
        // The details only count for people who made it
        Integer texture = madeIt ? body.texture() : null;
        Integer stability = madeIt ? body.stability() : null;
        Integer ease = madeIt ? body.ease() : null;
        Integer efficacy = madeIt ? body.efficacy() : null;
        String skin = madeIt && body.skinType() != null && !body.skinType().isBlank() ? body.skinType() : null;
        String review = body.review() == null || body.review().isBlank() ? null : body.review().trim();
        int version = body.version() == null ? 1 : body.version();
        String name = members.displayName(uid);

        UUID existing = jdbc.sql("select id from recipe_ratings where post_id = :post and user_id = :uid").param("post", postId).param("uid", uid)
                .query((rs, n) -> rs.getObject(1, UUID.class)).optional().orElse(null);
        UUID id = existing != null ? existing : UUID.randomUUID();
        if (existing != null) {
            jdbc.sql("""
                    update recipe_ratings set author_name = :name, version = :version, overall = :overall, texture = :texture, stability = :stability, ease = :ease,
                                              efficacy = :efficacy, made_it = :madeIt, skin_type = :skin, review = :review, updated_at = current_timestamp
                     where id = :id""")
                    .param("name", name).param("version", version).param("overall", body.overall()).param("texture", texture).param("stability", stability).param("ease", ease)
                    .param("efficacy", efficacy).param("madeIt", madeIt).param("skin", skin).param("review", review).param("id", id).update();
        } else {
            jdbc.sql("""
                    insert into recipe_ratings (id, post_id, user_id, author_name, version, overall, texture, stability, ease, efficacy, made_it, skin_type, review)
                    values (:id, :post, :uid, :name, :version, :overall, :texture, :stability, :ease, :efficacy, :madeIt, :skin, :review)""")
                    .param("id", id).param("post", postId).param("uid", uid).param("name", name).param("version", version).param("overall", body.overall()).param("texture", texture)
                    .param("stability", stability).param("ease", ease).param("efficacy", efficacy).param("madeIt", madeIt).param("skin", skin).param("review", review).update();
            notifications.aboutPost(postId, uid, name, "rating");
        }
        return jdbc.sql("select " + COLUMNS + " from recipe_ratings r where r.id = :id").param("id", id).query(Rows::map).single();
    }

    @Transactional
    public void remove(UUID uid, UUID postId) {
        if (jdbc.sql("delete from recipe_ratings where post_id = :post and user_id = :uid").param("post", postId).param("uid", uid).update() == 0) {
            throw new ApiException(HttpStatus.NOT_FOUND, "not_found", "You have not rated this recipe.");
        }
    }
}
