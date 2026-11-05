package com.demiurgio.formularium.library;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/** Request bodies for the ingredient library. Field names match the database columns the app already uses. */
public final class IngredientRequests {
    private IngredientRequests() { }

    /** One way a row can match. Only these columns and operators are allowed, so a request can never reach other columns. */
    public record Filter(
            @NotNull @Pattern(regexp = "function|inci_name|trade_name") String column,
            /** ilike: case-insensitive, % means "anything". eq: the exact text. */
            @NotNull @Pattern(regexp = "ilike|eq") String op,
            @NotNull @Size(max = 200) String value) { }

    /**
     * Ingredients matching ANY of `anyOf`, and (when given) only among `ids`. With neither, nothing is returned: the whole library
     * has its own endpoint.
     */
    public record Search(
            @Size(max = 200) @Valid List<Filter> anyOf,
            @Size(max = 300) List<UUID> ids,
            @Min(1) @Max(500) Integer limit,
            @Pattern(regexp = "trade_name") String orderBy) { }

    public record ByIds(@NotNull @Size(max = 300) List<UUID> ids) { }

    /** A custom ingredient someone adds to their own library. */
    public record Create(
            @NotBlank @Size(max = 200) @JsonProperty("trade_name") String tradeName,
            @NotBlank @Size(max = 200) @JsonProperty("inci_name") String inciName,
            @Size(max = 100) String function,
            @Pattern(regexp = "(?i)water|oil|alcohol|silicone|dispersible", message = "must be water, oil, alcohol, silicone or dispersible") String solubility,
            @DecimalMin("0") @DecimalMax("100") @JsonProperty("default_min_usage") BigDecimal defaultMinUsage,
            @DecimalMin("0") @DecimalMax("100") @JsonProperty("default_max_usage") BigDecimal defaultMaxUsage,
            @Size(max = 2000) String notes,
            @JsonProperty("is_vegan") Boolean isVegan,
            @JsonProperty("is_cosmos") Boolean isCosmos,
            @JsonProperty("is_sulfate") Boolean isSulfate,
            @JsonProperty("is_silicone") Boolean isSilicone,
            @JsonProperty("is_paraben") Boolean isParaben,
            @JsonProperty("is_fragrance") Boolean isFragrance) { }
}
