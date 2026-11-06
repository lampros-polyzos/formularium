package com.demiurgio.formularium.community;

import com.demiurgio.formularium.auth.UsernameChanged;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * A new display name shows on everything the member has written. This runs inside the transaction that renames them, so either the name and
 * everything that shows it change together, or nothing does. Posts are not marked as edited by this.
 */
@Component
class CommunityNameFollower {
    private final JdbcClient jdbc;

    CommunityNameFollower(JdbcClient jdbc) { this.jdbc = jdbc; }

    @EventListener
    void follow(UsernameChanged change) {
        jdbc.sql("update community_posts set author_name = :name where author_id = :id").param("name", change.username()).param("id", change.userId()).update();
        jdbc.sql("update post_comments set author_name = :name where author_id = :id").param("name", change.username()).param("id", change.userId()).update();
        jdbc.sql("update recipe_ratings set author_name = :name where user_id = :id").param("name", change.username()).param("id", change.userId()).update();
    }
}
