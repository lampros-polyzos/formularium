package com.demiurgio.formularium.account;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

@SpringBootTest
@AutoConfigureMockMvc
class AccountExportTest {
    @Autowired private MockMvc mvc;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private JwtEncoder encoder;

    private UUID alice;
    private UUID bob;

    @BeforeEach
    void seed() {
        for (String table : List.of("notifications", "content_reports", "community_mutes", "post_comments", "recipe_ratings", "post_snapshots", "community_posts", "batch_checks",
                "batch_stash_usage", "batch_ingredients", "batches", "formulation_versions", "formulations", "user_stash", "user_containers", "favorite_ingredients",
                "user_starred_ingredients", "ingredients", "refresh_tokens", "app_users")) {
            jdbc.update("delete from " + table);
        }
        alice = user("alice");
        bob = user("bob");
    }

    private UUID user(String name) {
        UUID id = UUID.randomUUID();
        jdbc.update("insert into app_users (id, email, username, password_hash) values (?, ?, ?, 'secret-hash')", id, name + "@example.com", name);
        return id;
    }

    private MvcResult export(UUID user) throws Exception {
        Instant now = Instant.now();
        JwtClaimsSet claims = JwtClaimsSet.builder().issuer("formularium-test").subject(user.toString()).issuedAt(now).expiresAt(now.plusSeconds(600)).build();
        String token = encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims)).getTokenValue();
        return mvc.perform(get("/api/v1/account/export").header("Authorization", "Bearer " + token)).andReturn();
    }

    @Test
    void needsSignIn() throws Exception {
        assertThat(mvc.perform(get("/api/v1/account/export")).andReturn().getResponse().getStatus()).isEqualTo(401);
    }

    @Test
    void holdsOnlyYourOwnRowsAndNeverSecrets() throws Exception {
        UUID mine = UUID.randomUUID();
        UUID theirs = UUID.randomUUID();
        jdbc.update("insert into ingredients (id, user_id, inci_name, trade_name, function, solubility) values (?, ?, 'Mine', 'Mine', 'x', 'water')", mine, alice);
        jdbc.update("insert into ingredients (id, user_id, inci_name, trade_name, function, solubility) values (?, ?, 'Theirs', 'Theirs', 'x', 'water')", theirs, bob);
        jdbc.update("insert into ingredients (id, inci_name, trade_name, function, solubility) values (?, 'Shared', 'Shared', 'x', 'water')", UUID.randomUUID());
        UUID post = UUID.randomUUID();
        jdbc.update("insert into community_posts (id, author_id, author_name, title, post_type) values (?, ?, 'alice', 'Day cream', 'discussion')", post, alice);
        jdbc.update("insert into community_posts (id, author_id, author_name, title, post_type) values (?, ?, 'bob', 'Toner', 'discussion')", UUID.randomUUID(), bob);
        jdbc.update("insert into post_comments (id, post_id, author_id, author_name, body) values (?, ?, ?, 'bob', 'Nice')", UUID.randomUUID(), post, bob);
        jdbc.update("insert into notifications (id, recipient_id, actor_name, post_id, type) values (?, ?, 'bob', ?, 'comment')", UUID.randomUUID(), alice, post);

        MvcResult result = export(alice);
        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        assertThat(result.getResponse().getHeader("Cache-Control")).contains("no-store");
        String body = result.getResponse().getContentAsString();

        assertThat(JsonPath.<String>read(body, "$.account.email")).isEqualTo("alice@example.com");
        assertThat(JsonPath.<List<String>>read(body, "$.data.ingredients[*].trade_name")).containsExactly("Mine");
        assertThat(JsonPath.<List<String>>read(body, "$.data.community_posts[*].title")).containsExactly("Day cream");
        assertThat(JsonPath.<List<String>>read(body, "$.data.post_comments[*].body")).isEmpty();   // Bob's comment on your post is Bob's
        assertThat(JsonPath.<List<Object>>read(body, "$.data.notifications")).hasSize(1);
        assertThat(body).doesNotContain("secret-hash").doesNotContain("password_hash").doesNotContain("Toner").doesNotContain("bob@example.com");
        assertThat(JsonPath.<String>read(body, "$.exported_at")).isNotBlank();
    }

    @Test
    void anAccountWithNothingStillGetsEveryListEmpty() throws Exception {
        String body = export(bob).getResponse().getContentAsString();
        for (AccountExportService.Source s : AccountExportService.SOURCES) {
            assertThat(JsonPath.<List<Object>>read(body, "$.data." + s.table())).as(s.table()).isEmpty();
        }
    }

    /** Fails when a table with a column that points at a person is added to the schema and neither exported nor knowingly left out. */
    @Test
    void everyTableThatHoldsAPersonsRowsIsCoveredOrLeftOutOnPurpose() {
        Set<String> owned = new HashSet<>(jdbc.queryForList(
                "select distinct lower(table_name) from information_schema.columns where table_schema = 'PUBLIC' and lower(column_name) in ('user_id', 'recipient_id', 'author_id', 'owner_id', 'reporter_id')",
                String.class));
        Set<String> covered = new HashSet<>();
        AccountExportService.SOURCES.forEach(s -> covered.add(s.table()));
        covered.addAll(AccountExportService.NOT_EXPORTED);
        assertThat(owned).isSubsetOf(covered);
    }
}
