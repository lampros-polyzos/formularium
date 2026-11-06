package com.demiurgio.formularium.community;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Posts, comments, versions, ratings, reports, mutes and notifications. Everything here is for signed-in members (see SecurityConfig). */
@RestController
@RequestMapping("/api/v1")
class CommunityController {
    private final CommunityService community;
    private final RatingService ratings;
    private final ModerationService moderation;
    private final NotificationService notifications;

    CommunityController(CommunityService community, RatingService ratings, ModerationService moderation, NotificationService notifications) {
        this.community = community;
        this.ratings = ratings;
        this.moderation = moderation;
        this.notifications = notifications;
    }

    private static UUID user(Jwt jwt) { return UUID.fromString(jwt.getSubject()); }

    // ---- what anyone may see before signing in

    @GetMapping("/public/recipe-previews")
    List<Map<String, Object>> previews(@RequestParam(defaultValue = "3") int limit) { return community.publicPreviews(limit); }

    // ---- posts

    /** `types` is a comma-separated list of kinds, or left out for all. */
    @GetMapping("/community/posts")
    List<Map<String, Object>> posts(@RequestParam(required = false) String types) {
        return community.posts(types == null || types.isBlank() ? null : Arrays.stream(types.split(",")).map(String::trim).filter(t -> !t.isEmpty()).toList());
    }

    @GetMapping("/community/posts/{id}")
    Map<String, Object> post(@PathVariable UUID id) { return community.post(id); }

    @PostMapping("/community/posts")
    ResponseEntity<Map<String, Object>> create(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody CommunityRequests.NewPost body) {
        return ResponseEntity.status(HttpStatus.CREATED).body(community.createPost(user(jwt), body));
    }

    @PatchMapping("/community/posts/{id}")
    Map<String, Object> edit(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody CommunityRequests.EditPost body) {
        return community.editPost(user(jwt), id, body);
    }

    @PutMapping("/community/posts/{id}/answered")
    Map<String, Object> answered(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody CommunityRequests.Answered body) {
        return community.setAnswered(user(jwt), id, body.answered());
    }

    @DeleteMapping("/community/posts/{id}")
    ResponseEntity<Void> delete(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        community.deletePost(user(jwt), id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/community/posts/{id}/remixes")
    List<Map<String, Object>> remixes(@PathVariable UUID id, @RequestParam(defaultValue = "10") int limit) { return community.remixes(id, limit); }

    @GetMapping("/community/posts/{id}/versions")
    List<Map<String, Object>> versions(@PathVariable UUID id) { return community.versions(id); }

    @PostMapping("/community/posts/{id}/versions")
    ResponseEntity<Map<String, Object>> addVersion(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody CommunityRequests.NewVersion body) {
        return ResponseEntity.status(HttpStatus.CREATED).body(community.addVersion(user(jwt), id, body));
    }

    // ---- comments

    @GetMapping("/community/posts/{id}/comments")
    List<Map<String, Object>> comments(@PathVariable UUID id) { return community.comments(id); }

    @PostMapping("/community/posts/{id}/comments")
    ResponseEntity<Map<String, Object>> comment(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody CommunityRequests.NewComment body) {
        return ResponseEntity.status(HttpStatus.CREATED).body(community.addComment(user(jwt), id, body));
    }

    @DeleteMapping("/community/comments/{id}")
    ResponseEntity<Void> deleteComment(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        community.deleteComment(user(jwt), id);
        return ResponseEntity.noContent().build();
    }

    // ---- ratings

    @GetMapping("/community/posts/{id}/ratings")
    List<Map<String, Object>> ratings(@PathVariable UUID id) { return ratings.forPost(id); }

    @PutMapping("/community/posts/{id}/rating")
    Map<String, Object> rate(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody CommunityRequests.Rating body) {
        return ratings.rate(user(jwt), id, body);
    }

    @DeleteMapping("/community/posts/{id}/rating")
    ResponseEntity<Void> removeRating(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        ratings.remove(user(jwt), id);
        return ResponseEntity.noContent().build();
    }

    /** The scores of many recipes at once, for the feed. */
    @PostMapping("/community/ratings")
    List<Map<String, Object>> scores(@Valid @RequestBody CommunityRequests.RatingsRequest body) { return ratings.scoresFor(body.postIds()); }

    // ---- reading across posts

    @GetMapping("/community/stats/shared")
    Map<String, Long> shared(@AuthenticationPrincipal Jwt jwt) { return Map.of("count", community.sharedCount(user(jwt))); }

    @GetMapping("/community/recipes")
    Map<String, Object> recipes(@AuthenticationPrincipal Jwt jwt, @RequestParam(defaultValue = "200") int limit) { return community.recipesByOthers(user(jwt), limit); }

    // ---- reports and moderation

    @PostMapping("/community/reports")
    ResponseEntity<Void> report(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody CommunityRequests.Report body) {
        moderation.report(user(jwt), body);
        return ResponseEntity.status(HttpStatus.CREATED).build();
    }

    @GetMapping("/community/moderator")
    Map<String, Boolean> moderator(@AuthenticationPrincipal Jwt jwt) { return Map.of("moderator", moderation.isModerator(user(jwt))); }

    @GetMapping("/community/reports/open")
    List<Map<String, Object>> openReports(@AuthenticationPrincipal Jwt jwt) { return moderation.openReports(user(jwt)); }

    @PostMapping("/community/reports/{id}/resolve")
    ResponseEntity<Void> resolve(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody CommunityRequests.Resolve body) {
        moderation.resolve(user(jwt), id, body.outcome(), Boolean.TRUE.equals(body.remove()));
        return ResponseEntity.noContent().build();
    }

    // ---- muting

    @GetMapping("/community/mutes")
    List<UUID> mutes(@AuthenticationPrincipal Jwt jwt) { return moderation.mutes(user(jwt)); }

    @PutMapping("/community/mutes/{memberId}")
    ResponseEntity<Void> mute(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID memberId) {
        moderation.mute(user(jwt), memberId);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/community/mutes/{memberId}")
    ResponseEntity<Void> unmute(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID memberId) {
        moderation.unmute(user(jwt), memberId);
        return ResponseEntity.noContent().build();
    }

    // ---- notifications

    @GetMapping("/notifications")
    List<Map<String, Object>> unread(@AuthenticationPrincipal Jwt jwt) { return notifications.unread(user(jwt)); }

    @PutMapping("/notifications/{id}/read")
    ResponseEntity<Void> read(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        notifications.markRead(user(jwt), id);
        return ResponseEntity.noContent().build();
    }
}
