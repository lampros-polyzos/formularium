package com.demiurgio.formularium.community;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class CommunityApiTest {
    @Autowired private MockMvc mvc;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private JwtEncoder encoder;

    private UUID alice;
    private UUID bob;
    private UUID carol;   // a moderator

    @BeforeEach
    void seed() {
        for (String table : List.of("content_reports", "community_mutes", "community_moderators", "notifications", "recipe_ratings", "post_comments", "post_snapshots", "batch_checks",
                "batch_stash_usage", "batch_ingredients", "batches", "formulation_versions", "formulations", "community_posts", "user_stash", "user_containers", "favorite_ingredients",
                "user_starred_ingredients", "ingredients", "refresh_tokens", "app_users")) {
            jdbc.update("delete from " + table);
        }
        alice = user("alice");
        bob = user("bob");
        carol = user("carol");
        jdbc.update("insert into community_moderators (user_id) values (?)", carol);
    }

    // ---- helpers

    private UUID user(String name) {
        UUID id = UUID.randomUUID();
        jdbc.update("insert into app_users (id, email, username) values (?, ?, ?)", id, name + "@example.com", name);
        return id;
    }

    private String token(UUID user) {
        Instant now = Instant.now();
        JwtClaimsSet claims = JwtClaimsSet.builder().issuer("formularium-test").subject(user.toString()).issuedAt(now).expiresAt(now.plusSeconds(600)).build();
        return encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims)).getTokenValue();
    }

    private MvcResult run(UUID user, MockHttpServletRequestBuilder request) throws Exception {
        return mvc.perform(request.header("Authorization", "Bearer " + token(user))).andReturn();
    }

    private MvcResult json(UUID user, MockHttpServletRequestBuilder request, String body) throws Exception {
        return run(user, request.contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private static int code(MvcResult r) { return r.getResponse().getStatus(); }

    private <T> T read(MvcResult r, String path) throws Exception { return JsonPath.read(r.getResponse().getContentAsString(), path); }

    private long count(String sql, Object... args) { return jdbc.queryForObject(sql, Long.class, args); }

    private String newPost(UUID user, String type, String title) throws Exception {
        MvcResult r = json(user, post("/api/v1/community/posts"), "{\"title\":\"" + title + "\",\"write_up\":\"Some text\",\"post_type\":\"" + type + "\",\"tags\":[\"face\",\"vegan\"]}");
        assertThat(code(r)).as(r.getResponse().getContentAsString()).isEqualTo(201);
        return read(r, "$.id");
    }

    private UUID insertPost(UUID author, String type, String title) {
        UUID id = UUID.randomUUID();
        jdbc.update("insert into community_posts (id, author_id, author_name, title, write_up, post_type) values (?, ?, 'x', ?, 'text', ?)", id, author, title, type);
        return id;
    }

    private String comment(UUID user, String postId, String body) throws Exception {
        MvcResult r = json(user, post("/api/v1/community/posts/" + postId + "/comments"), "{\"body\":\"" + body + "\"}");
        assertThat(code(r)).as(r.getResponse().getContentAsString()).isEqualTo(201);
        return read(r, "$.id");
    }

    // ---- access

    @Test
    void everythingExceptThePublicPreviewNeedsSignIn() throws Exception {
        UUID someId = UUID.randomUUID();
        for (MockHttpServletRequestBuilder request : List.of(get("/api/v1/community/posts"), get("/api/v1/community/posts/" + someId), get("/api/v1/community/posts/" + someId + "/comments"),
                get("/api/v1/community/posts/" + someId + "/versions"), get("/api/v1/community/posts/" + someId + "/ratings"), get("/api/v1/community/mutes"),
                get("/api/v1/community/moderator"), get("/api/v1/community/reports/open"), get("/api/v1/notifications"), delete("/api/v1/community/posts/" + someId))) {
            mvc.perform(request).andExpect(status().isUnauthorized());
        }
        mvc.perform(get("/api/v1/public/recipe-previews")).andExpect(status().isOk());
    }

    // ---- creating posts

    @Test
    void theAuthorAndTheNameOnAPostComeFromTheAccount_notFromTheRequest() throws Exception {
        MvcResult r = json(alice, post("/api/v1/community/posts"), "{\"title\":\" My lotion \",\"write_up\":\"Nice\",\"post_type\":\"discussion\",\"author_id\":\"" + bob + "\",\"author_name\":\"Somebody Else\",\"edited_at\":\"2020-01-01T00:00:00Z\"}");
        assertThat(code(r)).isEqualTo(201);
        assertThat((String) read(r, "$.author_id")).isEqualTo(alice.toString());
        assertThat((String) read(r, "$.author_name")).isEqualTo("alice");
        assertThat((String) read(r, "$.title")).isEqualTo("My lotion");
        assertThat(this.<Object>read(r, "$.edited_at")).isNull();
        assertThat(this.<Object>read(r, "$.answered_at")).isNull();
    }

    @Test
    void keepsTheTagsAndTheKindOfPost() throws Exception {
        MvcResult r = json(alice, post("/api/v1/community/posts"), "{\"title\":\"Ask\",\"write_up\":\"Help\",\"post_type\":\"advice\",\"tags\":[\"acne\",\"oily\"],\"sources\":\" a source \",\"development_status\":\"concept\"}");
        assertThat(this.<List<String>>read(r, "$.tags")).containsExactly("acne", "oily");
        assertThat((String) read(r, "$.post_type")).isEqualTo("advice");
        assertThat((String) read(r, "$.sources")).isEqualTo("a source");
        assertThat((String) read(r, "$.development_status")).isEqualTo("concept");
    }

    @Test
    void enforcesTheLimitsOnWhatPeopleWrite() throws Exception {
        String ok = "\"write_up\":\"x\",\"post_type\":\"discussion\"";
        assertThat(code(json(alice, post("/api/v1/community/posts"), "{\"title\":\"" + "t".repeat(150) + "\"," + ok + "}"))).isEqualTo(201);
        assertThat(code(json(alice, post("/api/v1/community/posts"), "{\"title\":\"" + "t".repeat(151) + "\"," + ok + "}"))).isEqualTo(400);
        assertThat(code(json(alice, post("/api/v1/community/posts"), "{\"title\":\"\"," + ok + "}"))).isEqualTo(400);
        assertThat(code(json(alice, post("/api/v1/community/posts"), "{\"title\":\"t\",\"write_up\":\"" + "w".repeat(10_001) + "\",\"post_type\":\"discussion\"}"))).isEqualTo(400);
        assertThat(code(json(alice, post("/api/v1/community/posts"), "{\"title\":\"t\",\"write_up\":\"" + "w".repeat(10_000) + "\",\"post_type\":\"discussion\"}"))).isEqualTo(201);
        assertThat(code(json(alice, post("/api/v1/community/posts"), "{\"title\":\"t\",\"write_up\":\"x\",\"post_type\":\"discussion\",\"sources\":\"" + "s".repeat(2_001) + "\"}"))).isEqualTo(400);
        assertThat(code(json(alice, post("/api/v1/community/posts"), "{\"title\":\"t\",\"write_up\":\"x\",\"post_type\":\"gossip\"}"))).isEqualTo(400);
        assertThat(code(json(alice, post("/api/v1/community/posts"), "{\"title\":\"t\",\"write_up\":\"x\",\"post_type\":\"discussion\",\"development_status\":\"done\"}"))).isEqualTo(400);
    }

    @Test
    void membersCannotPostFasterThanTenAnHour() throws Exception {
        for (int i = 0; i < 10; i++) insertPost(alice, "discussion", "Earlier " + i);
        MvcResult r = json(alice, post("/api/v1/community/posts"), "{\"title\":\"One too many\",\"write_up\":\"x\",\"post_type\":\"discussion\"}");
        assertThat(code(r)).isEqualTo(429);
        assertThat((String) read(r, "$.error.message")).isEqualTo("You are posting too quickly. Please wait a little and try again.");
        assertThat(code(json(bob, post("/api/v1/community/posts"), "{\"title\":\"Bob is fine\",\"write_up\":\"x\",\"post_type\":\"discussion\"}"))).as("the limit is per member").isEqualTo(201);

        jdbc.update("update community_posts set created_at = timestamp '2020-01-01 00:00:00' where author_id = ?", alice);   // an hour or more ago
        assertThat(code(json(alice, post("/api/v1/community/posts"), "{\"title\":\"Allowed again\",\"write_up\":\"x\",\"post_type\":\"discussion\"}"))).isEqualTo(201);
    }

    @Test
    void aRemixKeepsItsLinkOnlyWhileTheOriginalExists() throws Exception {
        String original = newPost(bob, "formulation", "Original");
        MvcResult remix = json(alice, post("/api/v1/community/posts"), "{\"title\":\"Remix\",\"write_up\":\"x\",\"post_type\":\"formulation\",\"remixed_from_post_id\":\"" + original + "\"}");
        assertThat((String) read(remix, "$.remixed_from_post_id")).isEqualTo(original);
        assertThat(this.<List<String>>read(run(alice, get("/api/v1/community/posts/" + original + "/remixes")), "$[*].title")).containsExactly("Remix");

        MvcResult gone = json(alice, post("/api/v1/community/posts"), "{\"title\":\"Orphan\",\"write_up\":\"x\",\"post_type\":\"formulation\",\"remixed_from_post_id\":\"" + UUID.randomUUID() + "\"}");
        assertThat(code(gone)).isEqualTo(201);
        assertThat(this.<Object>read(gone, "$.remixed_from_post_id")).isNull();

        run(bob, delete("/api/v1/community/posts/" + original));
        assertThat(this.<Object>read(run(alice, get("/api/v1/community/posts/" + read(remix, "$.id"))), "$.remixed_from_post_id")).isNull();   // deleting the original only clears the link
    }

    // ---- reading

    @Test
    void listsPostsNewestFirst_orOnlyTheKindsAskedFor() throws Exception {
        String a = newPost(alice, "discussion", "First");
        String b = newPost(bob, "advice", "Second");
        String c = newPost(alice, "formulation", "Third");
        jdbc.update("update community_posts set created_at = timestamp '2020-01-01 00:00:00' where id = ?", UUID.fromString(a));

        assertThat(this.<List<String>>read(run(carol, get("/api/v1/community/posts")), "$[*].id")).containsExactlyInAnyOrder(c, b, a);
        assertThat(this.<List<String>>read(run(carol, get("/api/v1/community/posts")), "$[-1:].id")).containsExactly(a);
        assertThat(this.<List<String>>read(run(carol, get("/api/v1/community/posts?types=advice,formulation")), "$[*].title")).containsExactlyInAnyOrder("Second", "Third");
        assertThat(code(run(carol, get("/api/v1/community/posts/" + UUID.randomUUID())))).isEqualTo(404);
    }

    // ---- editing

    @Test
    void anAuthorCanEditTheirOwnPost_andOnlyTheTextMarksItEdited() throws Exception {
        String id = newPost(alice, "discussion", "Original title");
        MvcResult changed = json(alice, patch("/api/v1/community/posts/" + id), "{\"title\":\"New title\",\"write_up\":\"Better text\",\"author_id\":\"" + bob + "\",\"post_type\":\"advice\",\"author_name\":\"Fake\"}");
        assertThat(code(changed)).isEqualTo(200);
        assertThat((String) read(changed, "$.title")).isEqualTo("New title");
        assertThat((String) read(changed, "$.write_up")).isEqualTo("Better text");
        assertThat(this.<Object>read(changed, "$.edited_at")).isNotNull();
        assertThat((String) read(changed, "$.author_id")).as("who wrote it never changes").isEqualTo(alice.toString());
        assertThat((String) read(changed, "$.post_type")).as("what kind it is never changes").isEqualTo("discussion");
        assertThat((String) read(changed, "$.author_name")).isEqualTo("alice");
    }

    @Test
    void savingTheSameTextDoesNotMarkThePostAsEdited_andChangingTheStatusAloneDoesNot() throws Exception {
        String id = newPost(alice, "formulation", "Cream");
        assertThat(this.<Object>read(json(alice, patch("/api/v1/community/posts/" + id), "{\"title\":\"Cream\",\"write_up\":\"Some text\"}"), "$.edited_at")).isNull();
        MvcResult status = json(alice, patch("/api/v1/community/posts/" + id), "{\"development_status\":\"stable\"}");
        assertThat((String) read(status, "$.development_status")).isEqualTo("stable");
        assertThat(this.<Object>read(status, "$.edited_at")).isNull();
    }

    @Test
    void nobodyElseCanEditAPost_notEvenAModerator() throws Exception {
        String id = newPost(alice, "discussion", "Mine");
        assertThat(code(json(bob, patch("/api/v1/community/posts/" + id), "{\"title\":\"Hijack\"}"))).isEqualTo(404);
        assertThat(code(json(carol, patch("/api/v1/community/posts/" + id), "{\"title\":\"Hijack\"}"))).isEqualTo(404);
        assertThat((String) read(run(alice, get("/api/v1/community/posts/" + id)), "$.title")).isEqualTo("Mine");
        assertThat(code(json(alice, patch("/api/v1/community/posts/" + id), "{\"title\":\"" + "t".repeat(151) + "\"}"))).isEqualTo(400);
    }

    @Test
    void onlyAdvicePostsCanBeMarkedAnswered_andOnlyByTheirAuthor() throws Exception {
        String advice = newPost(alice, "advice", "Help me");
        String discussion = newPost(alice, "discussion", "Chat");

        MvcResult answered = json(alice, put("/api/v1/community/posts/" + advice + "/answered"), "{\"answered\":true}");
        assertThat(this.<Object>read(answered, "$.answered_at")).isNotNull();
        assertThat(this.<Object>read(json(alice, put("/api/v1/community/posts/" + advice + "/answered"), "{\"answered\":false}"), "$.answered_at")).isNull();

        assertThat(code(json(alice, put("/api/v1/community/posts/" + discussion + "/answered"), "{\"answered\":true}"))).isEqualTo(400);
        assertThat(code(json(bob, put("/api/v1/community/posts/" + advice + "/answered"), "{\"answered\":true}"))).isEqualTo(404);
    }

    // ---- removing

    @Test
    void theAuthorOrAModeratorCanRemoveAPost_withEverythingOnIt() throws Exception {
        String id = newPost(alice, "formulation", "Cream");
        comment(bob, id, "Nice");
        json(bob, put("/api/v1/community/posts/" + id + "/rating"), "{\"overall\":5}");
        json(alice, post("/api/v1/community/posts/" + id + "/versions"), "{\"formulation_data\":[]}");
        assertThat(count("select count(*) from notifications")).isEqualTo(2);

        assertThat(code(run(bob, delete("/api/v1/community/posts/" + id)))).as("a stranger cannot").isEqualTo(404);
        assertThat(code(run(carol, delete("/api/v1/community/posts/" + id)))).as("a moderator can").isEqualTo(204);
        assertThat(count("select count(*) from community_posts")).isZero();
        assertThat(count("select count(*) from post_comments")).isZero();
        assertThat(count("select count(*) from recipe_ratings")).isZero();
        assertThat(count("select count(*) from post_snapshots")).isZero();
        assertThat(count("select count(*) from notifications")).isZero();

        String mine = newPost(alice, "discussion", "Mine");
        assertThat(code(run(alice, delete("/api/v1/community/posts/" + mine)))).isEqualTo(204);
        assertThat(code(run(alice, delete("/api/v1/community/posts/" + mine)))).isEqualTo(404);
    }

    // ---- comments

    @Test
    void commentsCarryTheNameOfTheirAuthor_andTellThePostsAuthor() throws Exception {
        String id = newPost(alice, "discussion", "Question");
        MvcResult r = json(bob, post("/api/v1/community/posts/" + id + "/comments"), "{\"body\":\"  Try less glycerin  \",\"author_id\":\"" + alice + "\",\"author_name\":\"Fake\"}");
        assertThat(code(r)).isEqualTo(201);
        assertThat((String) read(r, "$.author_name")).isEqualTo("bob");
        assertThat((String) read(r, "$.author_id")).isEqualTo(bob.toString());
        assertThat((String) read(r, "$.body")).isEqualTo("Try less glycerin");

        MvcResult inbox = run(alice, get("/api/v1/notifications"));
        assertThat(this.<List<String>>read(inbox, "$[*].type")).containsExactly("comment");
        assertThat(this.<List<String>>read(inbox, "$[*].actor_name")).containsExactly("bob");
        assertThat(this.<List<String>>read(inbox, "$[*].post_id")).containsExactly(id);
        assertThat(this.<List<?>>read(run(bob, get("/api/v1/notifications")), "$")).as("nobody is told about their own comment").isEmpty();

        comment(alice, id, "Thanks!");
        assertThat(count("select count(*) from notifications")).as("commenting on your own post tells nobody").isEqualTo(1);
    }

    @Test
    void commentsAreLimited_inLengthAndInSpeed() throws Exception {
        String id = newPost(alice, "discussion", "Q");
        assertThat(code(json(bob, post("/api/v1/community/posts/" + id + "/comments"), "{\"body\":\"" + "c".repeat(2_001) + "\"}"))).isEqualTo(400);
        assertThat(code(json(bob, post("/api/v1/community/posts/" + id + "/comments"), "{\"body\":\"   \"}"))).isEqualTo(400);
        assertThat(code(json(bob, post("/api/v1/community/posts/" + UUID.randomUUID() + "/comments"), "{\"body\":\"hi\"}"))).isEqualTo(404);

        for (int i = 0; i < 30; i++) jdbc.update("insert into post_comments (id, post_id, author_id, author_name, body) values (?, ?, ?, 'bob', 'old')", UUID.randomUUID(), UUID.fromString(id), bob);
        MvcResult r = json(bob, post("/api/v1/community/posts/" + id + "/comments"), "{\"body\":\"one more\"}");
        assertThat(code(r)).isEqualTo(429);
        assertThat((String) read(r, "$.error.message")).isEqualTo("You are commenting too quickly. Please wait a little and try again.");
    }

    @Test
    void commentsAreListedOldestFirst_andOnlyTheirAuthorOrAModeratorRemovesThem() throws Exception {
        String id = newPost(alice, "discussion", "Q");
        String first = comment(bob, id, "First");
        String second = comment(alice, id, "Second");
        jdbc.update("update post_comments set created_at = timestamp '2020-01-01 00:00:00' where id = ?", UUID.fromString(second));
        assertThat(this.<List<String>>read(run(carol, get("/api/v1/community/posts/" + id + "/comments")), "$[*].body")).containsExactly("Second", "First");

        assertThat(code(run(alice, delete("/api/v1/community/comments/" + first)))).as("not hers").isEqualTo(404);
        assertThat(code(run(bob, delete("/api/v1/community/comments/" + first)))).isEqualTo(204);
        assertThat(code(run(carol, delete("/api/v1/community/comments/" + second)))).as("a moderator may").isEqualTo(204);
        assertThat(count("select count(*) from post_comments")).isZero();
    }

    // ---- recipe versions

    @Test
    void anAuthorAddsNumberedVersionsToTheirRecipe_andEveryoneCanReadThem() throws Exception {
        String id = newPost(alice, "formulation", "Cream");
        String one = "{\"formulation_data\":[{\"id\":\"i1\",\"name\":\"Water\",\"phase\":\"A\",\"percentage\":80}],\"release_notes\":\" first \",\"version\":99}";
        MvcResult first = json(alice, post("/api/v1/community/posts/" + id + "/versions"), one);
        assertThat(code(first)).isEqualTo(201);
        assertThat(((Number) read(first, "$.version")).intValue()).as("the number is never taken from the request").isEqualTo(1);
        assertThat((String) read(first, "$.release_notes")).isEqualTo("first");
        json(alice, post("/api/v1/community/posts/" + id + "/versions"), "{\"formulation_data\":[]}");

        MvcResult list = run(bob, get("/api/v1/community/posts/" + id + "/versions"));
        assertThat(this.<List<Integer>>read(list, "$[*].version")).containsExactly(1, 2);
        assertThat(this.<List<String>>read(list, "$[0].formulation_data[*].name")).containsExactly("Water");
        assertThat(this.<List<Number>>read(list, "$[0].formulation_data[*].percentage").get(0).intValue()).isEqualTo(80);
        assertThat(this.<List<?>>read(list, "$[1].formulation_data")).isEmpty();
    }

    @Test
    void onlyTheAuthorCanAddAVersion() throws Exception {
        String id = newPost(alice, "formulation", "Cream");
        assertThat(code(json(bob, post("/api/v1/community/posts/" + id + "/versions"), "{\"formulation_data\":[]}"))).isEqualTo(404);
        assertThat(code(json(alice, post("/api/v1/community/posts/" + id + "/versions"), "{}"))).isEqualTo(400);
        assertThat(count("select count(*) from post_snapshots")).isZero();
    }

    // ---- ratings

    @Test
    void ratesSomeoneElsesRecipe_oncePerMember_andChangesItLater() throws Exception {
        String id = newPost(alice, "formulation", "Cream");
        MvcResult first = json(bob, put("/api/v1/community/posts/" + id + "/rating"), "{\"overall\":4,\"made_it\":true,\"texture\":5,\"stability\":4,\"ease\":3,\"efficacy\":4,\"skin_type\":\"dry\",\"review\":\"  Lovely  \",\"version\":2}");
        assertThat(code(first)).isEqualTo(200);
        assertThat((String) read(first, "$.author_name")).isEqualTo("bob");
        assertThat((String) read(first, "$.user_id")).isEqualTo(bob.toString());
        assertThat((String) read(first, "$.review")).isEqualTo("Lovely");
        assertThat(((Number) read(first, "$.version")).intValue()).isEqualTo(2);

        MvcResult again = json(bob, put("/api/v1/community/posts/" + id + "/rating"), "{\"overall\":2,\"made_it\":true,\"texture\":1}");
        assertThat((String) read(again, "$.id")).as("the same rating is changed, not a second one added").isEqualTo(read(first, "$.id"));
        assertThat(((Number) read(again, "$.overall")).intValue()).isEqualTo(2);
        assertThat(count("select count(*) from recipe_ratings")).isEqualTo(1);
        assertThat(count("select count(*) from notifications")).as("only the first rating tells the author").isEqualTo(1);
        assertThat(this.<List<String>>read(run(alice, get("/api/v1/notifications")), "$[*].type")).containsExactly("rating");
    }

    @Test
    void theDetailsOnlyCountForPeopleWhoMadeTheRecipe() throws Exception {
        String id = newPost(alice, "formulation", "Cream");
        MvcResult r = json(bob, put("/api/v1/community/posts/" + id + "/rating"), "{\"overall\":3,\"made_it\":false,\"texture\":5,\"stability\":5,\"ease\":5,\"efficacy\":5,\"skin_type\":\"oily\"}");
        assertThat(code(r)).isEqualTo(200);
        for (String field : List.of("texture", "stability", "ease", "efficacy", "skin_type")) assertThat(this.<Object>read(r, "$." + field)).as(field).isNull();
        assertThat((Boolean) read(r, "$.made_it")).isFalse();
    }

    @Test
    void refusesRatingsThatBreakTheRules() throws Exception {
        String recipe = newPost(alice, "formulation", "Cream");
        String chat = newPost(alice, "discussion", "Chat");
        assertThat(code(json(alice, put("/api/v1/community/posts/" + recipe + "/rating"), "{\"overall\":5}"))).as("your own recipe").isEqualTo(400);
        assertThat(code(json(bob, put("/api/v1/community/posts/" + chat + "/rating"), "{\"overall\":5}"))).as("not a recipe").isEqualTo(400);
        assertThat(code(json(bob, put("/api/v1/community/posts/" + UUID.randomUUID() + "/rating"), "{\"overall\":5}"))).isEqualTo(404);
        for (String bad : List.of("{\"overall\":0}", "{\"overall\":6}", "{}", "{\"overall\":3,\"made_it\":true,\"texture\":9}", "{\"overall\":3,\"skin_type\":\"scaly\"}", "{\"overall\":3,\"review\":\"" + "r".repeat(1_001) + "\"}")) {
            assertThat(code(json(bob, put("/api/v1/community/posts/" + recipe + "/rating"), bad))).as(bad).isEqualTo(400);
        }
        assertThat(count("select count(*) from recipe_ratings")).isZero();
    }

    @Test
    void ratingsAreListedNewestChangeFirst_removedByTheirOwner_andSummarisedForTheFeed() throws Exception {
        String id = newPost(alice, "formulation", "Cream");
        String other = newPost(alice, "formulation", "Toner");
        json(bob, put("/api/v1/community/posts/" + id + "/rating"), "{\"overall\":4}");
        json(carol, put("/api/v1/community/posts/" + id + "/rating"), "{\"overall\":5,\"made_it\":true}");
        jdbc.update("update recipe_ratings set updated_at = timestamp '2020-01-01 00:00:00' where user_id = ?", bob);

        assertThat(this.<List<String>>read(run(alice, get("/api/v1/community/posts/" + id + "/ratings")), "$[*].author_name")).containsExactly("carol", "bob");

        MvcResult scores = json(alice, post("/api/v1/community/ratings"), "{\"post_ids\":[\"" + id + "\",\"" + other + "\"]}");
        assertThat(this.<List<Integer>>read(scores, "$[*].overall")).containsExactlyInAnyOrder(4, 5);
        assertThat(scores.getResponse().getContentAsString()).doesNotContain("review");

        assertThat(code(run(carol, delete("/api/v1/community/posts/" + id + "/rating")))).isEqualTo(204);
        assertThat(code(run(carol, delete("/api/v1/community/posts/" + id + "/rating")))).isEqualTo(404);
        assertThat(count("select count(*) from recipe_ratings")).isEqualTo(1);
    }

    // ---- reports and moderation

    @Test
    void membersReportAPostOrAComment_andWhatItWasAboutIsKept() throws Exception {
        String id = newPost(alice, "advice", "Use pure lemon juice on your face");
        String bad = comment(alice, id, "Also try bleach");

        assertThat(code(json(bob, post("/api/v1/community/reports"), "{\"target_type\":\"post\",\"target_id\":\"" + id + "\",\"reason\":\"dangerous\",\"details\":\"  Unsafe  \"}"))).isEqualTo(201);
        assertThat(code(json(bob, post("/api/v1/community/reports"), "{\"target_type\":\"comment\",\"target_id\":\"" + bad + "\",\"reason\":\"harassment\"}"))).isEqualTo(201);

        MvcResult open = run(carol, get("/api/v1/community/reports/open"));
        assertThat(this.<List<String>>read(open, "$[*].target_type")).containsExactly("post", "comment");
        assertThat(this.<List<String>>read(open, "$[*].snapshot")).containsExactly("Use pure lemon juice on your face", "Also try bleach");
        assertThat(this.<List<String>>read(open, "$[*].post_id")).containsExactly(id, id);
        assertThat(this.<List<String>>read(open, "$[*].target_author_id")).containsExactly(alice.toString(), alice.toString());
        assertThat((String) read(open, "$[0].details")).isEqualTo("Unsafe");
        assertThat(open.getResponse().getContentAsString()).as("who reported is not shown").doesNotContain("reporter");
    }

    @Test
    void refusesReportsThatBreakTheRules() throws Exception {
        String id = newPost(alice, "advice", "Advice");
        String report = "{\"target_type\":\"post\",\"target_id\":\"" + id + "\",\"reason\":\"spam\"}";
        MvcResult own = json(alice, post("/api/v1/community/reports"), report);
        assertThat(code(own)).isEqualTo(400);
        assertThat((String) read(own, "$.error.message")).isEqualTo("You cannot report your own content.");

        MvcResult missing = json(bob, post("/api/v1/community/reports"), "{\"target_type\":\"post\",\"target_id\":\"" + UUID.randomUUID() + "\",\"reason\":\"spam\"}");
        assertThat(code(missing)).isEqualTo(404);
        assertThat((String) read(missing, "$.error.message")).isEqualTo("That post no longer exists.");
        assertThat((String) read(json(bob, post("/api/v1/community/reports"), "{\"target_type\":\"comment\",\"target_id\":\"" + UUID.randomUUID() + "\",\"reason\":\"spam\"}"), "$.error.message")).isEqualTo("That comment no longer exists.");

        assertThat(code(json(bob, post("/api/v1/community/reports"), report.replace("spam", "rude")))).isEqualTo(400);
        assertThat(code(json(bob, post("/api/v1/community/reports"), report.replace("\"reason\":\"spam\"", "\"reason\":\"spam\",\"details\":\"" + "d".repeat(1_001) + "\"")))).isEqualTo(400);

        assertThat(code(json(bob, post("/api/v1/community/reports"), report))).isEqualTo(201);
        MvcResult again = json(bob, post("/api/v1/community/reports"), report);
        assertThat(code(again)).isEqualTo(409);
        assertThat((String) read(again, "$.error.message")).isEqualTo("You have already reported this.");
    }

    @Test
    void membersCannotSendMoreThanTwentyReportsADay() throws Exception {
        for (int i = 0; i < 20; i++) {
            UUID target = insertPost(alice, "discussion", "Post " + i);
            jdbc.update("insert into content_reports (id, reporter_id, target_type, target_id, reason) values (?, ?, 'post', ?, 'spam')", UUID.randomUUID(), bob, target);
        }
        jdbc.update("update community_posts set created_at = timestamp '2020-01-01 00:00:00' where author_id = ?", alice);   // old posts, so the post limit is not in the way
        String id = newPost(alice, "discussion", "One more");
        MvcResult r = json(bob, post("/api/v1/community/reports"), "{\"target_type\":\"post\",\"target_id\":\"" + id + "\",\"reason\":\"spam\"}");
        assertThat(code(r)).isEqualTo(429);
        assertThat((String) read(r, "$.error.message")).isEqualTo("You have sent a lot of reports today. Please try again tomorrow.");
    }

    @Test
    void onlyModeratorsSeeAndCloseReports() throws Exception {
        String id = newPost(alice, "advice", "Bad advice");
        json(bob, post("/api/v1/community/reports"), "{\"target_type\":\"post\",\"target_id\":\"" + id + "\",\"reason\":\"dangerous\"}");
        String reportId = read(run(carol, get("/api/v1/community/reports/open")), "$[0].id");

        assertThat((Boolean) read(run(carol, get("/api/v1/community/moderator")), "$.moderator")).isTrue();
        assertThat((Boolean) read(run(bob, get("/api/v1/community/moderator")), "$.moderator")).isFalse();
        assertThat(code(run(bob, get("/api/v1/community/reports/open")))).isEqualTo(403);
        assertThat(code(json(bob, post("/api/v1/community/reports/" + reportId + "/resolve"), "{\"outcome\":\"dismissed\"}"))).isEqualTo(403);
        assertThat(code(json(alice, post("/api/v1/community/reports/" + reportId + "/resolve"), "{\"outcome\":\"dismissed\"}"))).as("not even the author of the reported post").isEqualTo(403);
        assertThat(count("select count(*) from content_reports where status = 'open'")).isEqualTo(1);
    }

    @Test
    void aModeratorCanCloseAReportAndRemoveWhatWasReported_orLeaveItBe() throws Exception {
        String keep = newPost(alice, "advice", "Fine really");
        String remove = newPost(alice, "advice", "Dangerous");
        String comment = comment(alice, remove, "Worse");
        json(bob, post("/api/v1/community/reports"), "{\"target_type\":\"post\",\"target_id\":\"" + keep + "\",\"reason\":\"other\"}");
        json(bob, post("/api/v1/community/reports"), "{\"target_type\":\"post\",\"target_id\":\"" + remove + "\",\"reason\":\"dangerous\"}");
        json(bob, post("/api/v1/community/reports"), "{\"target_type\":\"comment\",\"target_id\":\"" + comment + "\",\"reason\":\"dangerous\"}");
        List<String> ids = read(run(carol, get("/api/v1/community/reports/open")), "$[*].id");

        assertThat(code(json(carol, post("/api/v1/community/reports/" + ids.get(0) + "/resolve"), "{\"outcome\":\"dismissed\"}"))).isEqualTo(204);
        assertThat(count("select count(*) from community_posts where id = ?", UUID.fromString(keep))).as("dismissed: the post stays").isEqualTo(1);

        assertThat(code(json(carol, post("/api/v1/community/reports/" + ids.get(1) + "/resolve"), "{\"outcome\":\"resolved\",\"remove\":true}"))).isEqualTo(204);
        assertThat(count("select count(*) from community_posts where id = ?", UUID.fromString(remove))).as("resolved with removal: the post is gone").isZero();

        // the comment went with its post, so removing it again is fine and the report is still closed
        assertThat(code(json(carol, post("/api/v1/community/reports/" + ids.get(2) + "/resolve"), "{\"outcome\":\"resolved\",\"remove\":true}"))).isEqualTo(204);
        assertThat(count("select count(*) from content_reports where status = 'open'")).isZero();
        assertThat(jdbc.queryForObject("select resolved_by from content_reports where id = ?", UUID.class, UUID.fromString(ids.get(0)))).isEqualTo(carol);
        assertThat(code(json(carol, post("/api/v1/community/reports/" + ids.get(0) + "/resolve"), "{\"outcome\":\"resolved\"}"))).as("a closed report cannot be closed again").isEqualTo(409);
        assertThat(code(json(carol, post("/api/v1/community/reports/" + UUID.randomUUID() + "/resolve"), "{\"outcome\":\"resolved\"}"))).isEqualTo(404);
        assertThat(code(json(carol, post("/api/v1/community/reports/" + ids.get(0) + "/resolve"), "{\"outcome\":\"banned\"}"))).isEqualTo(400);
    }

    @Test
    void aReportOutlivesTheContentItWasAbout() throws Exception {
        String id = newPost(alice, "advice", "Soon gone");
        json(bob, post("/api/v1/community/reports"), "{\"target_type\":\"post\",\"target_id\":\"" + id + "\",\"reason\":\"spam\"}");
        run(alice, delete("/api/v1/community/posts/" + id));
        assertThat(this.<List<String>>read(run(carol, get("/api/v1/community/reports/open")), "$[*].snapshot")).containsExactly("Soon gone");
    }

    // ---- muting

    @Test
    void membersMuteAndUnmuteOthers_andOnlySeeTheirOwnList() throws Exception {
        assertThat(code(run(alice, put("/api/v1/community/mutes/" + bob)))).isEqualTo(204);
        assertThat(code(run(alice, put("/api/v1/community/mutes/" + bob)))).as("muting twice is fine").isEqualTo(204);
        assertThat(code(run(alice, put("/api/v1/community/mutes/" + carol)))).isEqualTo(204);
        assertThat(this.<List<String>>read(run(alice, get("/api/v1/community/mutes")), "$")).containsExactlyInAnyOrder(bob.toString(), carol.toString());
        assertThat(this.<List<?>>read(run(bob, get("/api/v1/community/mutes")), "$")).isEmpty();

        assertThat(code(run(alice, delete("/api/v1/community/mutes/" + bob)))).isEqualTo(204);
        assertThat(code(run(alice, delete("/api/v1/community/mutes/" + bob)))).isEqualTo(204);
        assertThat(this.<List<String>>read(run(alice, get("/api/v1/community/mutes")), "$")).containsExactly(carol.toString());
    }

    @Test
    void youCannotMuteYourselfOrSomeoneWhoDoesNotExist() throws Exception {
        assertThat(code(run(alice, put("/api/v1/community/mutes/" + alice)))).isEqualTo(400);
        assertThat(code(run(alice, put("/api/v1/community/mutes/" + UUID.randomUUID())))).isEqualTo(404);
        assertThat(count("select count(*) from community_mutes")).isZero();
    }

    // ---- notifications

    @Test
    void notificationsAreYoursAlone_andMarkedReadOneByOne() throws Exception {
        String id = newPost(alice, "formulation", "Cream");
        comment(bob, id, "One");
        comment(carol, id, "Two");
        MvcResult inbox = run(alice, get("/api/v1/notifications"));
        assertThat(this.<List<String>>read(inbox, "$[*].actor_name")).hasSize(2).containsExactlyInAnyOrder("bob", "carol");
        String first = read(inbox, "$[0].id");

        assertThat(code(run(bob, put("/api/v1/notifications/" + first + "/read")))).as("someone else's").isEqualTo(404);
        assertThat(code(run(alice, put("/api/v1/notifications/" + first + "/read")))).isEqualTo(204);
        assertThat(this.<List<?>>read(run(alice, get("/api/v1/notifications")), "$")).hasSize(1);
        assertThat(code(run(alice, put("/api/v1/notifications/" + UUID.randomUUID() + "/read")))).isEqualTo(404);
    }

    // ---- display names

    @Test
    void changingYourNameChangesItOnEverythingYouWrote_withoutMarkingPostsEdited() throws Exception {
        String mine = newPost(alice, "formulation", "Cream");
        String other = newPost(bob, "formulation", "Toner");
        comment(alice, other, "Nice toner");
        json(alice, put("/api/v1/community/posts/" + other + "/rating"), "{\"overall\":5}");

        MvcResult renamed = json(alice, patch("/api/v1/auth/me"), "{\"username\":\"Alice.Formulates\"}");
        assertThat(code(renamed)).isEqualTo(200);
        assertThat((String) read(renamed, "$.username")).isEqualTo("Alice.Formulates");

        assertThat((String) read(run(bob, get("/api/v1/community/posts/" + mine)), "$.author_name")).isEqualTo("Alice.Formulates");
        assertThat(this.<Object>read(run(bob, get("/api/v1/community/posts/" + mine)), "$.edited_at")).as("a rename is not an edit").isNull();
        assertThat(this.<List<String>>read(run(bob, get("/api/v1/community/posts/" + other + "/comments")), "$[*].author_name")).containsExactly("Alice.Formulates");
        assertThat(this.<List<String>>read(run(bob, get("/api/v1/community/posts/" + other + "/ratings")), "$[*].author_name")).containsExactly("Alice.Formulates");
        assertThat((String) read(run(bob, get("/api/v1/community/posts/" + other)), "$.author_name")).as("other people's posts are untouched").isEqualTo("bob");
        assertThat(count("select count(*) from app_users where username = 'Alice.Formulates'")).isEqualTo(1);
    }

    @Test
    void aNewNameMustBeFreeAndValid_butYouMayChangeTheCaseOfYourOwn() throws Exception {
        assertThat(code(json(alice, patch("/api/v1/auth/me"), "{\"username\":\"BOB\"}"))).as("taken, ignoring case").isEqualTo(409);
        assertThat(code(json(alice, patch("/api/v1/auth/me"), "{\"username\":\"ALICE\"}"))).isEqualTo(200);
        for (String bad : List.of("{\"username\":\"ab\"}", "{\"username\":\"has space\"}", "{\"username\":\"\"}", "{\"username\":\"" + "n".repeat(31) + "\"}", "{}")) {
            assertThat(code(json(alice, patch("/api/v1/auth/me"), bad))).as(bad).isEqualTo(400);
        }
        assertThat(jdbc.queryForObject("select username from app_users where id = ?", String.class, alice)).isEqualTo("ALICE");
    }

    // ---- reading across posts

    @Test
    void anyoneCanSeeAShortPreviewOfTheNewestSharedRecipes_andNothingMore() throws Exception {
        MvcResult shared = json(alice, post("/api/v1/community/posts"), "{\"title\":\"Light day cream\",\"write_up\":\"" + ("word ".repeat(100)) + "\\n\\n   spaced   out\",\"post_type\":\"formulation\",\"tags\":[\"face\"],\"development_status\":\"stable\"}");
        assertThat(code(shared)).isEqualTo(201);
        newPost(bob, "advice", "Private-ish advice");
        newPost(bob, "discussion", "Chat");

        MvcResult previews = mvc.perform(get("/api/v1/public/recipe-previews?limit=5")).andReturn();   // no sign-in
        assertThat(code(previews)).isEqualTo(200);
        assertThat(this.<List<String>>read(previews, "$[*].title")).containsExactly("Light day cream");
        String excerpt = read(previews, "$[0].excerpt");
        assertThat(excerpt).hasSize(160).doesNotContain("\n").doesNotContain("  ");
        assertThat(this.<List<String>>read(previews, "$[0].tags")).containsExactly("face");
        assertThat((String) read(previews, "$[0].development_status")).isEqualTo("stable");
        assertThat(previews.getResponse().getContentAsString()).doesNotContain("write_up").doesNotContain("author");
    }

    @Test
    void thePreviewListIsCapped() throws Exception {
        for (int i = 0; i < 15; i++) insertPost(i % 2 == 0 ? alice : bob, "formulation", "Recipe " + i);
        assertThat(this.<List<?>>read(mvc.perform(get("/api/v1/public/recipe-previews?limit=100")).andReturn(), "$")).hasSize(12);
        assertThat(this.<List<?>>read(mvc.perform(get("/api/v1/public/recipe-previews?limit=0")).andReturn(), "$")).hasSize(1);
        assertThat(this.<List<?>>read(mvc.perform(get("/api/v1/public/recipe-previews")).andReturn(), "$")).hasSize(3);
    }

    @Test
    void recipesByOthersCarryOnlyTheirLatestVersion_andLeaveOutYourOwn() throws Exception {
        String bobs = newPost(bob, "formulation", "Bob's cream");
        String alices = newPost(alice, "formulation", "Alice's cream");
        newPost(bob, "formulation", "No versions yet");
        json(bob, post("/api/v1/community/posts/" + bobs + "/versions"), "{\"formulation_data\":[{\"id\":\"old\",\"percentage\":1}]}");
        json(bob, post("/api/v1/community/posts/" + bobs + "/versions"), "{\"formulation_data\":[{\"id\":\"new\",\"percentage\":2}]}");
        json(alice, post("/api/v1/community/posts/" + alices + "/versions"), "{\"formulation_data\":[]}");

        MvcResult r = run(alice, get("/api/v1/community/recipes"));
        assertThat(this.<List<String>>read(r, "$.recipes[*].title")).containsExactly("Bob's cream");
        assertThat(this.<List<String>>read(r, "$.recipes[0].formulation_data[*].id")).containsExactly("new");
        assertThat((Boolean) read(r, "$.limited")).isFalse();
        assertThat((Boolean) read(run(alice, get("/api/v1/community/recipes?limit=3")), "$.limited")).isTrue();
    }

    @Test
    void countsTheRecipesYouHaveShared() throws Exception {
        newPost(alice, "formulation", "One");
        newPost(alice, "formulation", "Two");
        newPost(alice, "advice", "Not a recipe");
        newPost(bob, "formulation", "Bob's");
        assertThat(((Number) read(run(alice, get("/api/v1/community/stats/shared")), "$.count")).intValue()).isEqualTo(2);
    }

    // ---- accounts

    @Test
    void deletingYourAccountRemovesWhatYouSharedAndSaid() throws Exception {
        String id = newPost(alice, "formulation", "Cream");
        String bobsPost = newPost(bob, "discussion", "Q");
        comment(alice, bobsPost, "Answer");
        json(bob, put("/api/v1/community/posts/" + id + "/rating"), "{\"overall\":5}");
        run(bob, put("/api/v1/community/mutes/" + alice));

        run(alice, delete("/api/v1/auth/me"));
        assertThat(count("select count(*) from community_posts")).isEqualTo(1);
        assertThat(count("select count(*) from post_comments")).isZero();
        assertThat(count("select count(*) from recipe_ratings")).isZero();
        assertThat(count("select count(*) from community_mutes")).isZero();
        // what she received is gone with her; what Bob received about her comment stays (it points at his own post)
        assertThat(count("select count(*) from notifications")).isEqualTo(1);
        assertThat(jdbc.queryForObject("select recipient_id from notifications", UUID.class)).isEqualTo(bob);
    }
}
