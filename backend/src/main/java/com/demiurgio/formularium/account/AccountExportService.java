package com.demiurgio.formularium.account;

import com.demiurgio.formularium.auth.ApiException;
import com.demiurgio.formularium.library.Rows;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import tools.jackson.databind.json.JsonMapper;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Everything a member owns, as one document (the "access" and "portability" rights in the privacy policy).
 *
 * The list of tables is written out on purpose: it can be read, reviewed and tested, and nothing is exported by accident. A test fails when a table that
 * holds a person's rows is added to the schema and not listed here (or in {@link #NOT_EXPORTED}).
 * Passwords, sign-in tokens and other people's data are never included.
 */
@Service
public class AccountExportService {
    /** A table to export and the condition that picks out the member's rows (":uid" is the member). */
    record Source(String table, String where) { }

    static final List<Source> SOURCES = List.of(
            new Source("ingredients", "user_id = :uid"),
            new Source("user_starred_ingredients", "user_id = :uid"),
            new Source("favorite_ingredients", "user_id = :uid"),
            new Source("user_stash", "user_id = :uid"),
            new Source("user_containers", "user_id = :uid"),
            new Source("formulations", "user_id = :uid"),
            new Source("formulation_phases", "formulation_id in (select id from formulations where user_id = :uid)"),
            new Source("formulation_ingredients", "phase_id in (select p.id from formulation_phases p join formulations f on f.id = p.formulation_id where f.user_id = :uid)"),
            new Source("formulation_versions", "user_id = :uid"),
            new Source("batches", "user_id = :uid"),
            new Source("batch_ingredients", "user_id = :uid"),
            new Source("batch_stash_usage", "user_id = :uid"),
            new Source("batch_checks", "user_id = :uid"),
            new Source("community_posts", "author_id = :uid"),
            new Source("post_snapshots", "post_id in (select id from community_posts where author_id = :uid)"),
            new Source("post_comments", "author_id = :uid"),
            new Source("recipe_ratings", "user_id = :uid"),
            new Source("notifications", "recipient_id = :uid"),
            new Source("community_mutes", "user_id = :uid"),
            new Source("content_reports", "reporter_id = :uid"));

    /** Tables that have a column pointing at a person but are deliberately left out of the export. */
    static final List<String> NOT_EXPORTED = List.of(
            "app_users",            // exported separately, without the password hash
            "refresh_tokens",       // sign-in secrets
            "email_tokens",         // one-time links sent by email, also secrets
            "community_moderators"  // a role given by the operators, not the member's own data
    );

    private final JdbcClient jdbc;
    private final JsonMapper json = JsonMapper.builder().build();

    AccountExportService(JdbcClient jdbc) { this.jdbc = jdbc; }

    public Map<String, Object> export(UUID uid) {
        Map<String, Object> account = jdbc.sql("select id, email, username, created_at from app_users where id = :uid").param("uid", uid)
                .query(Rows::map).optional().orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "not_found", "That account no longer exists."));
        Map<String, Object> data = new LinkedHashMap<>();
        for (Source s : SOURCES) {
            List<Map<String, Object>> rows = jdbc.sql("select * from " + s.table() + " where " + s.where()).param("uid", uid).query(Rows::map).list();
            rows.forEach(this::readJsonColumns);
            data.put(s.table(), rows);
        }
        Map<String, Object> document = new LinkedHashMap<>();
        document.put("exported_at", Instant.now().toString());
        document.put("account", account);
        document.put("data", data);
        return document;
    }

    /** PostgreSQL hands a JSON column back as a typed object; the export wants the JSON itself. */
    private void readJsonColumns(Map<String, Object> row) {
        row.replaceAll((column, value) -> {
            if (value != null && value.getClass().getName().equals("org.postgresql.util.PGobject")) {
                try {
                    return json.readValue(value.toString(), Object.class);
                } catch (RuntimeException e) {
                    return value.toString();
                }
            }
            return value;
        });
    }
}
