package com.demiurgio.formularium.library;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

/** Request bodies for the stash (ingredients you own) and the containers (bottles and jars you own). */
public final class StashAndContainerRequests {
    private StashAndContainerRequests() { }

    /** A lot of one ingredient you own. Used for both adding and changing one. */
    public record Stash(
            @NotNull @JsonProperty("ingredient_id") UUID ingredientId,
            @Size(max = 200) @JsonProperty("supplier_name") String supplierName,
            @Size(max = 100) @JsonProperty("batch_lot_number") String batchLotNumber,
            @NotNull @DecimalMin("0") @DecimalMax("1000000000") @JsonProperty("amount_left_g") BigDecimal amountLeftG,
            @DecimalMin("0") @DecimalMax("1000000") @JsonProperty("price_per_g") BigDecimal pricePerG,
            @JsonProperty("expiration_date") LocalDate expirationDate,
            @Size(max = 2000) String notes) { }

    public record Container(
            @NotBlank @Size(max = 200) String name,
            @NotBlank @Size(max = 100) @JsonProperty("container_type") String containerType,
            @Size(max = 100) String material,
            @DecimalMin("0") @DecimalMax("1000000") @JsonProperty("volume_ml") BigDecimal volumeMl,
            @Min(0) @Max(1000000) Integer quantity,
            @DecimalMin("0") @DecimalMax("1000000") @JsonProperty("price_per_unit") BigDecimal pricePerUnit,
            @Size(max = 200) @JsonProperty("supplier_name") String supplierName,
            // Shown as a picture in the app, so only web addresses are accepted (not javascript: or data: links)
            @Size(max = 2000) @Pattern(regexp = "(?i)https?://.+", message = "must be a web address starting with http:// or https://") @JsonProperty("image_url") String imageUrl,
            @Size(max = 2000) String notes,
            @Min(0) @Max(1000000) @JsonProperty("low_stock_threshold") Integer lowStockThreshold) { }
}
