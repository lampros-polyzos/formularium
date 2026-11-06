package com.demiurgio.formularium.batches;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** Request bodies for batches. Field names are the ones the app already uses. */
public final class BatchRequests {
    private BatchRequests() { }

    /** Grams to take out of one stash lot for one line. */
    public record Allocation(
            @NotNull @JsonProperty("stash_id") UUID stashId,
            @NotNull @DecimalMin(value = "0", inclusive = false) @DecimalMax("1000000000") BigDecimal grams,
            @Size(max = 200) String label) { }

    public record Line(
            @JsonProperty("ingredient_id") UUID ingredientId,
            @NotBlank @Size(max = 200) String name,
            @Size(max = 200) @JsonProperty("inci_name") String inciName,
            @NotBlank @Pattern(regexp = "[A-Za-z0-9]{1,5}") String phase,
            @NotNull @DecimalMin("0") @DecimalMax("100") BigDecimal percentage,
            @NotNull @DecimalMin("0") @DecimalMax("1000000000") @JsonProperty("planned_g") BigDecimal plannedG,
            @DecimalMin("0") @DecimalMax("1000000000") @JsonProperty("actual_g") BigDecimal actualG,
            @Size(max = 50) @Valid List<Allocation> allocations,
            @DecimalMin("0") @DecimalMax("1000000") @JsonProperty("est_price_per_g") BigDecimal estPricePerG) { }

    /** What the batch is filled into. The name and size stay on the batch even if the container is deleted later. */
    public record Container(
            UUID id,
            @Size(max = 200) String name,
            @DecimalMin(value = "0", inclusive = false) @DecimalMax("1000000") @JsonProperty("volume_ml") BigDecimal volumeMl,
            @DecimalMin(value = "0", inclusive = false) @DecimalMax("1000000") BigDecimal count,
            @DecimalMin("0") @DecimalMax("1000000") @JsonProperty("unit_price") BigDecimal unitPrice,
            @DecimalMin(value = "0", inclusive = false) @DecimalMax("100") @JsonProperty("density_g_ml") BigDecimal densityGMl) { }

    public record Create(
            @JsonProperty("formulation_id") UUID formulationId,
            @NotBlank @Size(max = 200) String name,
            @NotBlank @Size(max = 60) @JsonProperty("lot_number") String lotNumber,
            @NotNull @DecimalMin(value = "0", inclusive = false) @DecimalMax("1000000000") @JsonProperty("batch_size_g") BigDecimal batchSizeG,
            @DecimalMin("0") @DecimalMax("14") @JsonProperty("target_ph") BigDecimal targetPh,
            @Size(max = 4000) String notes,
            @JsonProperty("made_on") LocalDate madeOn,
            @NotEmpty @Size(max = 200) @Valid List<Line> lines,
            @Valid Container container) { }

    /** The parts of a batch that can be edited afterwards. Only what is present is changed. */
    public record Patch(
            @Pattern(regexp = "active|archived|discarded", message = "must be active, archived or discarded") String status,
            @DecimalMin("0") @DecimalMax("14") @JsonProperty("measured_ph") BigDecimal measuredPh,
            @DecimalMin(value = "0", inclusive = false) @DecimalMax("1000000000") @JsonProperty("final_weight_g") BigDecimal finalWeightG,
            @Size(max = 4000) String notes,
            @Size(min = 1, max = 60) @JsonProperty("lot_number") String lotNumber) { }

    public record NewCheck(
            @NotBlank @Size(max = 100) String label,
            @NotNull @JsonProperty("due_on") LocalDate dueOn) { }

    public record CompleteCheck(
            @NotNull @Pattern(regexp = "good|minor|failed") String result,
            @Size(max = 20) List<@Size(max = 60) String> observations,
            @DecimalMin("0") @DecimalMax("14") @JsonProperty("measured_ph") BigDecimal measuredPh,
            @Size(max = 2000) String notes) { }
}
