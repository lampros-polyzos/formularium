package com.demiurgio.formularium.community;

import com.demiurgio.formularium.auth.ApiException;
import com.demiurgio.formularium.library.Rows;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

/**
 * Shared recipes, advice and information posts, their comments and recipe versions. These are the rules the database used to enforce with
 * triggers: the author and the name on a post always come from the account; an author cannot change who wrote a post, what kind it is or when;
 * edits are stamped; only advice posts can be marked answered; and members cannot post or comment faster than a limit.
 */
@Service
public class CommunityService {
    static final int POSTS_PER_HOUR = 10;
    static final int COMMENTS_PER_HOUR = 30;

    private static final String POST_COLUMNS = """
            p.id, p.author_id, p.title, p.write_up, p.tags, p.created_at, p.post_type, p.development_status, p.profile_name, p.author_name,
            p.remixed_from_post_id, p.edited_at, p.answered_at, p.sources""";
    private static final String COMMENT_COLUMNS = "c.id, c.post_id, c.author_id, c.author_name, c.body, c.created_at";
    private static final List<String> ADVICE_TYPES = List.of("advice", "request");

    private final JdbcClient jdbc;
    private final ObjectMapper json;
    private final Members members;
    private final NotificationService notifications;

    CommunityService(JdbcClient jdbc, ObjectMapper json, Members members, NotificationService notifications) {
        this.jdbc = jdbc;
        this.json = json;
        this.members = members;
        this.notifications = notifications;
    }

    // ---- posts

    /** Newest first. With `types`, only those kinds (the screens ask for a tab at a time). */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> posts(List<String> types) {
        if (types == null || types.isEmpty()) {
            return jdbc.sql("select " + POST_COLUMNS + " from community_posts p order by p.created_at desc").query(Rows::map).list();
        }
        return jdbc.sql("select " + POST_COLUMNS + " from community_posts p where p.post_type in (:types) order by p.created_at desc").param("types", types).query(Rows::map).list();
    }

    @Transactional(readOnly = true)
    public Map<String, Object> post(UUID id) {
        return jdbc.sql("select " + POST_COLUMNS + " from community_posts p where p.id = :id").param("id", id).query(Rows::map).optional()
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "not_found", "Post not found."));
    }

    @Transactional
    public Map<String, Object> createPost(UUID uid, CommunityRequests.NewPost body) {
        members.limit("community_posts", "author_id", uid, Duration.ofHours(1), POSTS_PER_HOUR, "You are posting too quickly. Please wait a little and try again.");
        UUID remixedFrom = body.remixedFromPostId() != null && postExists(body.remixedFromPostId()) ? body.remixedFromPostId() : null;
        UUID id = UUID.randomUUID();
        String[] tags = body.tags() == null ? new String[0] : body.tags().toArray(String[]::new);
        jdbc.sql("""
                insert into community_posts (id, author_id, author_name, title, write_up, tags, post_type, development_status, profile_name, sources, remixed_from_post_id)
                values (:id, :uid, :name, :title, :writeUp, :tags, :type, :status, :profile, :sources, :remixed)""")
                .param("id", id).param("uid", uid).param("name", members.displayName(uid)).param("title", body.title().trim()).param("writeUp", blankToNull(body.writeUp()))
                .param("tags", tags).param("type", body.postType()).param("status", body.developmentStatus()).param("profile", blankToNull(body.profileName()))
                .param("sources", blankToNull(body.sources())).param("remixed", remixedFrom, java.sql.Types.OTHER).update();
        return post(id);
    }

    /** The author edits their own post. Changing the text stamps the edit; the author, kind, creation date and name are never changed from here. */
    @Transactional
    public Map<String, Object> editPost(UUID uid, UUID id, CommunityRequests.EditPost body) {
        Map<String, Object> current = ownPost(uid, id);
        List<String> sets = new ArrayList<>();
        Map<String, Object> params = new LinkedHashMap<>();
        boolean textChanged = false;
        if (body.title() != null && !body.title().trim().equals(current.get("title"))) { sets.add("title = :title"); params.put("title", body.title().trim()); textChanged = true; }
        if (body.writeUp() != null && !Objects.equals(blankToNull(body.writeUp()), current.get("write_up"))) { sets.add("write_up = :writeUp"); params.put("writeUp", blankToNull(body.writeUp())); textChanged = true; }
        if (body.sources() != null && !Objects.equals(blankToNull(body.sources()), current.get("sources"))) { sets.add("sources = :sources"); params.put("sources", blankToNull(body.sources())); textChanged = true; }
        if (body.developmentStatus() != null) { sets.add("development_status = :status"); params.put("status", body.developmentStatus()); }
        if (textChanged) sets.add("edited_at = current_timestamp");
        if (!sets.isEmpty()) {
            jdbc.sql("update community_posts set " + String.join(", ", sets) + " where id = :id and author_id = :uid").params(params).param("id", id).param("uid", uid).update();
        }
        return post(id);
    }

    /** Marks an advice post answered, or opens it again. Only the author can, and only on advice posts. */
    @Transactional
    public Map<String, Object> setAnswered(UUID uid, UUID id, boolean answered) {
        Map<String, Object> current = ownPost(uid, id);
        if (!ADVICE_TYPES.contains(String.valueOf(current.get("post_type")))) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "not_advice", "Only advice posts can be marked as answered.");
        }
        jdbc.sql("update community_posts set answered_at = " + (answered ? "current_timestamp" : "null") + " where id = :id and author_id = :uid").param("id", id).param("uid", uid).update();
        return post(id);
    }

    /** The author, or a moderator, removes a post for good, with its comments, ratings, versions and notifications. */
    @Transactional
    public void deletePost(UUID uid, UUID id) {
        boolean allowed = members.isModerator(uid);
        int deleted = jdbc.sql("delete from community_posts where id = :id" + (allowed ? "" : " and author_id = :uid")).param("id", id).params(allowed ? Map.of() : Map.of("uid", uid)).update();
        if (deleted == 0) throw new ApiException(HttpStatus.NOT_FOUND, "not_found", "Post not found, or it is not yours to remove.");
    }

    // ---- comments

    @Transactional(readOnly = true)
    public List<Map<String, Object>> comments(UUID postId) {
        return jdbc.sql("select " + COMMENT_COLUMNS + " from post_comments c where c.post_id = :id order by c.created_at, c.id").param("id", postId).query(Rows::map).list();
    }

    @Transactional
    public Map<String, Object> addComment(UUID uid, UUID postId, CommunityRequests.NewComment body) {
        if (!postExists(postId)) throw new ApiException(HttpStatus.NOT_FOUND, "not_found", "Post not found.");
        members.limit("post_comments", "author_id", uid, Duration.ofHours(1), COMMENTS_PER_HOUR, "You are commenting too quickly. Please wait a little and try again.");
        UUID id = UUID.randomUUID();
        String name = members.displayName(uid);
        jdbc.sql("insert into post_comments (id, post_id, author_id, author_name, body) values (:id, :post, :uid, :name, :body)")
                .param("id", id).param("post", postId).param("uid", uid).param("name", name).param("body", body.body().trim()).update();
        notifications.aboutPost(postId, uid, name, "comment");
        return jdbc.sql("select " + COMMENT_COLUMNS + " from post_comments c where c.id = :id").param("id", id).query(Rows::map).single();
    }

    @Transactional
    public void deleteComment(UUID uid, UUID id) {
        boolean allowed = members.isModerator(uid);
        int deleted = jdbc.sql("delete from post_comments where id = :id" + (allowed ? "" : " and author_id = :uid")).param("id", id).params(allowed ? Map.of() : Map.of("uid", uid)).update();
        if (deleted == 0) throw new ApiException(HttpStatus.NOT_FOUND, "not_found", "Comment not found, or it is not yours to remove.");
    }

    // ---- recipe versions

    /** The versions of a shared recipe, oldest first, each with its ingredients as a list. */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> versions(UUID postId) {
        return jdbc.sql("select version, cast(formulation_data as varchar) as formulation_data, release_notes, created_at from post_snapshots where post_id = :id order by version")
                .param("id", postId).query((rs, n) -> {
                    Map<String, Object> row = Rows.map(rs, n);
                    row.put("formulation_data", parse(row.get("formulation_data")));
                    return row;
                }).list();
    }

    /** The author adds a new version to their own recipe. The number is the next one; it is never taken from the request. */
    @Transactional
    public Map<String, Object> addVersion(UUID uid, UUID postId, CommunityRequests.NewVersion body) {
        ownPost(uid, postId);
        int next = jdbc.sql("select coalesce(max(version), 0) + 1 from post_snapshots where post_id = :id").param("id", postId).query(Integer.class).single();
        String data;
        try {
            data = json.writeValueAsString(body.formulationData());
        } catch (JacksonException e) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "invalid_request", "The recipe could not be read.");
        }
        jdbc.sql("insert into post_snapshots (id, post_id, formulation_data, version, release_notes) values (:id, :post, cast(:data as jsonb), :version, :notes)")
                .param("id", UUID.randomUUID()).param("post", postId).param("data", data).param("version", next).param("notes", blankToNull(body.releaseNotes())).update();
        return versions(postId).stream().filter(v -> Integer.valueOf(next).equals(((Number) v.get("version")).intValue())).findFirst().orElseThrow();
    }

    // ---- reading across posts

    /** Recipes that were made from this one, newest first. */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> remixes(UUID postId, int limit) {
        return jdbc.sql("select p.id, p.title, p.author_name, p.created_at from community_posts p where p.remixed_from_post_id = :id order by p.created_at desc limit " + Math.max(1, Math.min(limit, 50)))
                .param("id", postId).query(Rows::map).list();
    }

    /** How many recipes the member has shared. */
    @Transactional(readOnly = true)
    public long sharedCount(UUID uid) {
        return jdbc.sql("select count(*) from community_posts where author_id = :uid and post_type = 'formulation'").param("uid", uid).query(Long.class).single();
    }

    /**
     * The newest shared recipes by other members, each as of its latest version. Posts without a version are left out. `limited` says there may be more
     * recipes than were looked at.
     */
    @Transactional(readOnly = true)
    public Map<String, Object> recipesByOthers(UUID uid, int limit) {
        int size = Math.max(1, Math.min(limit, 500));
        List<Map<String, Object>> posts = jdbc.sql("select p.id, p.title, p.author_id, p.author_name from community_posts p where p.post_type = 'formulation' order by p.created_at desc limit " + size)
                .query(Rows::map).list();
        List<Map<String, Object>> recipes = new ArrayList<>();
        for (Map<String, Object> post : posts) {
            if (uid.equals(post.get("author_id"))) continue;
            jdbc.sql("select cast(formulation_data as varchar) from post_snapshots where post_id = :id order by version desc limit 1").param("id", post.get("id"))
                    .query((rs, n) -> rs.getString(1)).optional().ifPresent(data -> {
                        Map<String, Object> recipe = new LinkedHashMap<>();
                        recipe.put("id", post.get("id"));
                        recipe.put("title", post.get("title"));
                        recipe.put("author_name", post.get("author_name"));
                        recipe.put("formulation_data", parse(data));
                        recipes.add(recipe);
                    });
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("recipes", recipes);
        result.put("limited", posts.size() >= size);
        return result;
    }

    /** What anyone may see before signing in: a title, a short excerpt and tags of the newest shared recipes. */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> publicPreviews(int limit) {
        int size = Math.max(1, Math.min(limit, 12));
        return jdbc.sql("select p.id, p.title, p.write_up, p.tags, p.development_status, p.created_at from community_posts p where p.post_type = 'formulation' order by p.created_at desc limit " + size)
                .query((rs, n) -> {
                    Map<String, Object> row = Rows.map(rs, n);
                    Object text = row.remove("write_up");
                    String flat = (text == null ? "" : String.valueOf(text)).replaceAll("\\s+", " ").trim();
                    row.put("excerpt", flat.length() > 160 ? flat.substring(0, 160) : flat);
                    return row;
                }).list();
    }

    // ---- small checks

    boolean postExists(UUID id) {
        return jdbc.sql("select count(*) from community_posts where id = :id").param("id", id).query(Long.class).single() > 0;
    }

    private Map<String, Object> ownPost(UUID uid, UUID id) {
        Map<String, Object> post = jdbc.sql("select " + POST_COLUMNS + " from community_posts p where p.id = :id and p.author_id = :uid").param("id", id).param("uid", uid)
                .query(Rows::map).optional().orElse(null);
        if (post == null) throw new ApiException(HttpStatus.NOT_FOUND, "not_found", "Post not found, or it is not yours.");
        return post;
    }

    private Object parse(Object text) {
        if (!(text instanceof String s)) return List.of();
        try {
            Object value = json.readValue(s, Object.class);
            return value instanceof List<?> ? value : List.of();
        } catch (JacksonException e) {
            return List.of();
        }
    }

    private static String blankToNull(String s) { return s == null || s.isBlank() ? null : s.trim(); }
}
