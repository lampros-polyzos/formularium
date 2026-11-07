package com.demiurgio.formularium.formulas;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/** Request bodies for formulas and their version history. Field names are the database column names the app already uses. */
public final class FormulaRequests {
    private FormulaRequests() { }

    /** One ingredient in one phase of a formula. */
    public record Line(
            @NotNull @JsonProperty("ingredient_id") UUID ingredientId,
            @NotBlank @Pattern(regexp = "[A-Za-z0-9]{1,5}", message = "must be 1 to 5 letters or digits") @JsonProperty("phase_letter") String phaseLetter,
            @NotNull @DecimalMin("0") @DecimalMax("100") BigDecimal percentage,
            @JsonProperty("is_qs") Boolean isQs) { }

    /**
     * A formula to create or to save over. On a save the whole contents are replaced by `ingredients`.
     * The remix links are only read when creating: a saved formula keeps the ones it was born with.
     */
    public record Save(
            @NotBlank @Size(max = 200) String name,
            @JsonProperty("profile_id") @Size(max = 100) String profileId,
            @DecimalMin(value = "0", inclusive = false) @DecimalMax("10000000") @JsonProperty("target_weight_g") BigDecimal targetWeightG,
            @DecimalMin("0") @DecimalMax("14") @JsonProperty("target_ph") BigDecimal targetPh,
            @JsonProperty("cloned_from_formulation_id") UUID clonedFromFormulationId,
            @JsonProperty("remixed_from_post_id") UUID remixedFromPostId,
            @NotNull @Size(max = 300) List<@Valid Line> ingredients) { }

    /** Links a formula to the community post it was shared as. */
    public record LinkPost(@NotNull @JsonProperty("community_post_id") UUID communityPostId) { }

    public record VersionLine(
            @NotNull @JsonProperty("ingredient_id") UUID ingredientId,
            @Size(max = 200) @JsonProperty("inci_name") String inciName,
            @Size(max = 200) @JsonProperty("trade_name") String tradeName,
            @NotBlank @Pattern(regexp = "[A-Za-z0-9]{1,5}") String phase,
            @NotNull @DecimalMin("0") @DecimalMax("100") BigDecimal percentage,
            @JsonProperty("is_qs") Boolean isQs) { }

    /** A copy of the formula as it is, with a note on what changed and why. */
    public record Version(
            @Size(max = 2000) String note,
            @NotBlank @Size(max = 200) String name,
            @JsonProperty("profile_id") @Size(max = 100) String profileId,
            @DecimalMin("0") @DecimalMax("10000000") @JsonProperty("target_weight_g") BigDecimal targetWeightG,
            @DecimalMin("0") @DecimalMax("14") @JsonProperty("target_ph") BigDecimal targetPh,
            @NotNull @Size(max = 300) List<@Valid VersionLine> lines) { }
}
