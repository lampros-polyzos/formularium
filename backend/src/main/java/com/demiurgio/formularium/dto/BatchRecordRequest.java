package com.demiurgio.formularium.dto;

import java.util.List;

// A batch exactly as it was stored: what was weighed from which stash lot, what it cost, the measurements and the
// stability check-ins. The frontend sends it and this service lays it out as a printable quality record.
public record BatchRecordRequest(
    String name,
    String lotNumber,
    String madeOn,          // YYYY-MM-DD
    String status,          // active | archived | discarded | voided
    double batchSizeG,
    Double finalWeightG,
    Double yieldPct,
    Double targetPh,
    Double measuredPh,
    String notes,
    boolean stashDeducted,
    String currency,
    Container container,    // null when no container was chosen
    Cost cost,
    List<Line> lines,
    List<Check> checks
) {
    public record Container(String name, Double volumeMl, Double count) {}

    public record Cost(
        Double ingredientTotal,   // null when nothing could be priced
        Double per100g,
        Double perContainer,      // ingredients' share plus the container's price
        Double containerPrice,
        boolean estimated,        // some of it is a guess
        int unpricedCount
    ) {}

    public record Line(
        String name,
        String inciName,
        String phase,
        double percentage,
        double plannedG,
        double actualG,
        Double cost,
        boolean costEstimated,
        List<StashLot> stashLots
    ) {}

    public record StashLot(double grams, String label) {}

    public record Check(
        String label,
        String dueOn,
        String checkedAt,         // null until it has been done
        String result,            // good | minor | failed
        List<String> observations,
        Double measuredPh,
        String notes
    ) {}
}
