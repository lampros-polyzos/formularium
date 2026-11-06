package com.demiurgio.formularium.community;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Request bodies for the community. Field names are the ones the app already uses. The limits are the ones the database used to enforce. */
public final class CommunityRequests {
    private CommunityRequests() { }

    public static final int TITLE_MAX = 150;
    public static final int TEXT_MAX = 10_000;
    public static final int COMMENT_MAX = 2_000;
    public static final int SOURCES_MAX = 2_000;
    public static final int REPORT_DETAILS_MAX = 1_000;
    public static final int REVIEW_MAX = 1_000;

    public record NewPost(
            @NotBlank @Size(max = TITLE_MAX, message = "can be up to 150 characters") String title,
            @JsonProperty("write_up") @Size(max = TEXT_MAX, message = "can be up to 10,000 characters") String writeUp,
            @NotNull @JsonProperty("post_type") @Pattern(regexp = "formulation|discussion|advice|information") String postType,
            @Size(max = 20) List<@Size(max = 40) String> tags,
            @JsonProperty("development_status") @Pattern(regexp = "concept|in-testing|stable") String developmentStatus,
            @JsonProperty("profile_name") @Size(max = 100) String profileName,
            @Size(max = SOURCES_MAX, message = "can be up to 2,000 characters") String sources,
            @JsonProperty("remixed_from_post_id") UUID remixedFromPostId) { }

    /** Only what is present changes. */
    public record EditPost(
            @Size(min = 1, max = TITLE_MAX, message = "can be up to 150 characters") String title,
            @JsonProperty("write_up") @Size(max = TEXT_MAX, message = "can be up to 10,000 characters") String writeUp,
            @Size(max = SOURCES_MAX, message = "can be up to 2,000 characters") String sources,
            @JsonProperty("development_status") @Pattern(regexp = "concept|in-testing|stable") String developmentStatus) { }

    public record Answered(@NotNull Boolean answered) { }

    public record NewComment(@NotBlank @Size(max = COMMENT_MAX, message = "can be up to 2,000 characters") String body) { }

    /** A new version of a shared recipe: its ingredients as they are now. */
    public record NewVersion(
            @NotNull @Size(max = 300) @JsonProperty("formulation_data") List<Map<String, Object>> formulationData,
            @JsonProperty("release_notes") @Size(max = 2000) String releaseNotes) { }

    public record Rating(
            @Min(1) @Max(1000) Integer version,
            @NotNull @Min(1) @Max(5) Integer overall,
            @JsonProperty("made_it") Boolean madeIt,
            @Min(1) @Max(5) Integer texture,
            @Min(1) @Max(5) Integer stability,
            @Min(1) @Max(5) Integer ease,
            @Min(1) @Max(5) Integer efficacy,
            @JsonProperty("skin_type") @Pattern(regexp = "dry|oily|combination|normal|sensitive") String skinType,
            @Size(max = REVIEW_MAX, message = "can be up to 1,000 characters") String review) { }

    public record RatingsRequest(@NotNull @Size(max = 300) @JsonProperty("post_ids") List<UUID> postIds) { }

    public record Report(
            @NotNull @JsonProperty("target_type") @Pattern(regexp = "post|comment") String targetType,
            @NotNull @JsonProperty("target_id") UUID targetId,
            @NotNull @Pattern(regexp = "dangerous|medical|spam|harassment|copied|personal|other") String reason,
            @Size(max = REPORT_DETAILS_MAX, message = "can be up to 1,000 characters") String details) { }

    public record Resolve(@NotNull @Pattern(regexp = "resolved|dismissed") String outcome, Boolean remove) { }
}
