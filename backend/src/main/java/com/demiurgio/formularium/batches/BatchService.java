package com.demiurgio.formularium.batches;

import com.demiurgio.formularium.auth.ApiException;
import com.demiurgio.formularium.library.IngredientRepository;
import com.demiurgio.formularium.library.Rows;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Date;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Batches: a record of making a formula, the stash it used, what it cost and the check-ins to come. Starting a batch takes the grams out of the
 * stash and works out the cost in one transaction, so the stash and the record can never disagree. Every query is limited to the signed-in
 * person's own rows.
 */
@Service
public class BatchService {
    private static final BigDecimal EPSILON = new BigDecimal("0.0001");
    private static final int COST_SCALE = 4;
    /** The check-ins every new batch gets: when to look at it again. */
    private static final List<Map.Entry<String, Integer>> FIRST_CHECKS = List.of(
            Map.entry("24 hours", 1), Map.entry("1 week", 7), Map.entry("4 weeks", 28), Map.entry("12 weeks", 84));
    private static final int MAX_LINES = 20_000;

    private static final String BATCH_COLUMNS = """
            b.id, b.user_id, b.formulation_id, b.name, b.lot_number, b.batch_size_g, b.made_on, b.status, b.target_ph, b.measured_ph, b.final_weight_g, b.notes,
            b.stash_deducted, b.created_at, b.container_id, b.container_name, b.container_volume_ml, b.container_count, b.container_unit_price, b.density_g_ml,
            b.ingredient_cost, b.unpriced_count""";
    private static final String CHECK_COLUMNS = "c.id, c.batch_id, c.label, c.due_on, c.checked_at, c.result, c.observations, c.measured_ph, c.notes";

    private final JdbcClient jdbc;
    private final IngredientRepository ingredients;

    BatchService(JdbcClient jdbc, IngredientRepository ingredients) {
        this.jdbc = jdbc;
        this.ingredients = ingredients;
    }

    // ---- reading

    /** Newest first, each with its check-ins (the few fields a list needs). */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> list(UUID uid) {
        List<Map<String, Object>> batches = jdbc.sql("select " + BATCH_COLUMNS + " from batches b where b.user_id = :uid order by b.made_on desc, b.created_at desc")
                .param("uid", uid).query(Rows::map).list();
        Map<Object, List<Map<String, Object>>> checks = new LinkedHashMap<>();
        jdbc.sql("select c.batch_id, c.id, c.label, c.due_on, c.checked_at, c.result, c.observations from batch_checks c where c.user_id = :uid order by c.due_on")
                .param("uid", uid).query(Rows::map).list().forEach(row -> checks.computeIfAbsent(row.get("batch_id"), k -> new ArrayList<>()).add(row));
        for (Map<String, Object> batch : batches) {
            List<Map<String, Object>> own = checks.getOrDefault(batch.get("id"), List.of());
            own.forEach(c -> c.remove("batch_id"));
            batch.put("batch_checks", own);
        }
        return batches;
    }

    /** One batch with its lines, the stash it used and its check-ins. Null when it is not yours. */
    @Transactional(readOnly = true)
    public Map<String, Object> detail(UUID uid, UUID id) {
        Map<String, Object> batch = jdbc.sql("select " + BATCH_COLUMNS + " from batches b where b.id = :id and b.user_id = :uid").param("id", id).param("uid", uid).query(Rows::map).optional().orElse(null);
        if (batch == null) return null;
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("batch", batch);
        result.put("lines", jdbc.sql("select id, batch_id, ingredient_id, name, inci_name, phase, percentage, planned_g, actual_g, cost, cost_estimated from batch_ingredients where batch_id = :id order by phase, percentage desc")
                .param("id", id).query(Rows::map).list());
        result.put("usage", jdbc.sql("select id, batch_ingredient_id, grams, label from batch_stash_usage where batch_id = :id").param("id", id).query(Rows::map).list());
        result.put("checks", jdbc.sql("select " + CHECK_COLUMNS + " from batch_checks c where c.batch_id = :id order by c.due_on").param("id", id).query(Rows::map).list());
        return result;
    }

    /** What went into every batch, for the metrics. */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> lines(UUID uid) {
        return jdbc.sql("select i.batch_id, i.ingredient_id, i.name, i.actual_g, i.cost from batch_ingredients i join batches b on b.id = i.batch_id where b.user_id = :uid order by i.id limit " + MAX_LINES)
                .param("uid", uid).query(Rows::map).list();
    }

    /** Lot numbers that start with the text, for suggesting the next one. */
    @Transactional(readOnly = true)
    public List<String> lotNumbers(UUID uid, String prefix) {
        String escaped = prefix.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
        return jdbc.sql("select lot_number from batches where user_id = :uid and lot_number like :prefix escape '\\'").param("uid", uid).param("prefix", escaped + "%")
                .query((rs, n) -> rs.getString(1)).list();
    }

    /** Check-ins that are due or overdue on batches still in progress, oldest first, each with a few fields of its batch. */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> dueChecks(UUID uid, LocalDate today, int limit) {
        return jdbc.sql("""
                select c.id, c.batch_id, c.label, c.due_on, c.checked_at, c.result, c.observations, c.measured_ph, c.notes,
                       b.id as b_id, b.name as b_name, b.lot_number as b_lot_number, b.target_ph as b_target_ph
                  from batch_checks c join batches b on b.id = c.batch_id
                 where c.user_id = :uid and c.checked_at is null and c.due_on <= :today and b.status = 'active'
                 order by c.due_on, c.id limit\s""" + limit)
                .param("uid", uid).param("today", Date.valueOf(today)).query((rs, n) -> {
                    Map<String, Object> all = Rows.map(rs, n);
                    Map<String, Object> batch = new LinkedHashMap<>();
                    batch.put("id", all.remove("b_id"));
                    batch.put("name", all.remove("b_name"));
                    batch.put("lot_number", all.remove("b_lot_number"));
                    batch.put("target_ph", all.remove("b_target_ph"));
                    all.put("batch", batch);
                    return all;
                }).list();
    }

    @Transactional(readOnly = true)
    public long dueCount(UUID uid, LocalDate today) {
        return jdbc.sql("select count(*) from batch_checks c join batches b on b.id = c.batch_id where c.user_id = :uid and c.checked_at is null and c.due_on <= :today and b.status = 'active'")
                .param("uid", uid).param("today", Date.valueOf(today)).query(Long.class).single();
    }

    // ---- starting a batch

    /**
     * Records the batch and takes the allocated grams out of the stash lots, all or nothing. A lot that no longer holds enough stops the whole
     * batch (the stash may have changed since the window was opened). Each line's cost is worked out from the prices of the lots it took from,
     * and from an estimated price for grams that did not come from a priced lot.
     */
    @Transactional
    public UUID create(UUID uid, BatchRequests.Create body) {
        requireUsableIngredients(uid, body);
        UUID batchId = UUID.randomUUID();
        LocalDate madeOn = body.madeOn() != null ? body.madeOn() : LocalDate.now();
        BatchRequests.Container container = body.container();
        try {
            jdbc.sql("""
                    insert into batches (id, user_id, formulation_id, name, lot_number, batch_size_g, target_ph, notes, made_on,
                                         container_id, container_name, container_volume_ml, container_count, container_unit_price, density_g_ml)
                    values (:id, :uid, :formulation, :name, :lot, :size, :ph, :notes, :madeOn, :cId, :cName, :cVolume, :cCount, :cPrice, :density)""")
                    .param("id", batchId).param("uid", uid).param("formulation", ownedFormulaOrNull(uid, body.formulationId()), java.sql.Types.OTHER)
                    .param("name", body.name().trim()).param("lot", body.lotNumber().trim()).param("size", body.batchSizeG()).param("ph", body.targetPh())
                    .param("notes", blankToNull(body.notes())).param("madeOn", Date.valueOf(madeOn))
                    .param("cId", container == null ? null : ownedContainerOrNull(uid, container.id()), java.sql.Types.OTHER)
                    .param("cName", container == null ? null : blankToNull(container.name())).param("cVolume", container == null ? null : container.volumeMl())
                    .param("cCount", container == null ? null : container.count()).param("cPrice", container == null ? null : container.unitPrice())
                    .param("density", container == null ? null : container.densityGMl()).update();
        } catch (DuplicateKeyException e) {
            throw lotTaken();
        }

        boolean deducted = false;
        for (BatchRequests.Line line : body.lines()) {
            BigDecimal actual = line.actualG() != null ? line.actualG() : line.plannedG();
            UUID lineId = UUID.randomUUID();
            jdbc.sql("insert into batch_ingredients (id, batch_id, user_id, ingredient_id, name, inci_name, phase, percentage, planned_g, actual_g) values (:id, :batch, :uid, :ingredient, :name, :inci, :phase, :pct, :planned, :actual)")
                    .param("id", lineId).param("batch", batchId).param("uid", uid).param("ingredient", line.ingredientId(), java.sql.Types.OTHER).param("name", line.name()).param("inci", line.inciName())
                    .param("phase", line.phase().toUpperCase(java.util.Locale.ROOT)).param("pct", line.percentage()).param("planned", line.plannedG()).param("actual", actual).update();

            BigDecimal real = BigDecimal.ZERO;
            BigDecimal allocated = BigDecimal.ZERO;
            BigDecimal unknown = BigDecimal.ZERO;
            boolean hasPrice = false;
            for (BatchRequests.Allocation allocation : line.allocations() == null ? List.<BatchRequests.Allocation>of() : line.allocations()) {
                // Only succeeds while the lot still holds enough: this is what keeps the stash from going negative
                int taken = jdbc.sql("update user_stash set amount_left_g = amount_left_g - :g where id = :id and user_id = :uid and amount_left_g >= :g")
                        .param("g", allocation.grams()).param("id", allocation.stashId()).param("uid", uid).update();
                if (taken == 0) {
                    throw new ApiException(HttpStatus.CONFLICT, "stash_changed",
                            "Not enough " + line.name() + " left in your stash. It may have changed since you opened this window: review the batch and try again.");
                }
                BigDecimal price = jdbc.sql("select price_per_g from user_stash where id = :id and user_id = :uid").param("id", allocation.stashId()).param("uid", uid)
                        .query(BigDecimal.class).optional().orElse(null);
                if (price != null && price.signum() == 0) price = null;   // a price of zero means "not known"

                jdbc.sql("insert into batch_stash_usage (id, batch_id, batch_ingredient_id, user_id, stash_id, grams, label, price_per_g) values (:id, :batch, :line, :uid, :stash, :g, :label, :price)")
                        .param("id", UUID.randomUUID()).param("batch", batchId).param("line", lineId).param("uid", uid).param("stash", allocation.stashId())
                        .param("g", allocation.grams()).param("label", allocation.label()).param("price", price).update();

                allocated = allocated.add(allocation.grams());
                if (price != null) {
                    real = real.add(allocation.grams().multiply(price));
                    hasPrice = true;
                } else {
                    unknown = unknown.add(allocation.grams());
                }
                deducted = true;
            }

            // Grams that did not come from a priced lot are costed with the app's estimate, if there is one
            BigDecimal estimate = line.estPricePerG() != null && line.estPricePerG().signum() != 0 ? line.estPricePerG() : null;
            BigDecimal rest = actual.subtract(allocated).max(BigDecimal.ZERO).add(unknown);
            BigDecimal cost;
            boolean estimated;
            if (rest.compareTo(EPSILON) > 0 && estimate != null) {
                cost = real.add(rest.multiply(estimate));
                estimated = true;
            } else if (hasPrice) {
                cost = real;
                estimated = rest.compareTo(EPSILON) > 0;   // part of it has no price, so the total is understated
            } else {
                cost = null;
                estimated = false;
            }
            jdbc.sql("update batch_ingredients set cost = :cost, cost_estimated = :estimated where id = :id")
                    .param("cost", cost == null ? null : cost.setScale(COST_SCALE, RoundingMode.HALF_UP), java.sql.Types.NUMERIC).param("estimated", estimated).param("id", lineId).update();
        }

        BigDecimal total = jdbc.sql("select sum(cost) from batch_ingredients where batch_id = :id").param("id", batchId).query(BigDecimal.class).optional().orElse(null);
        long unpriced = jdbc.sql("select count(*) from batch_ingredients where batch_id = :id and cost is null").param("id", batchId).query(Long.class).single();
        jdbc.sql("update batches set stash_deducted = :deducted, ingredient_cost = :total, unpriced_count = :unpriced where id = :id")
                .param("deducted", deducted).param("total", total == null ? null : total.setScale(COST_SCALE, RoundingMode.HALF_UP), java.sql.Types.NUMERIC).param("unpriced", (int) unpriced).param("id", batchId).update();

        for (Map.Entry<String, Integer> check : FIRST_CHECKS) {
            jdbc.sql("insert into batch_checks (id, batch_id, user_id, label, due_on) values (:id, :batch, :uid, :label, :due)")
                    .param("id", UUID.randomUUID()).param("batch", batchId).param("uid", uid).param("label", check.getKey()).param("due", Date.valueOf(madeOn.plusDays(check.getValue()))).update();
        }
        return batchId;
    }

    /** Marks the batch undone and puts what it took back into the stash lots that still exist. */
    @Transactional
    public void voidBatch(UUID uid, UUID id) {
        int marked = jdbc.sql("update batches set status = 'voided' where id = :id and user_id = :uid and status <> 'voided'").param("id", id).param("uid", uid).update();
        if (marked == 0) throw new ApiException(HttpStatus.NOT_FOUND, "not_found", "Batch not found, or it was already undone.");
        List<Map<String, Object>> used = jdbc.sql("select stash_id, sum(grams) as total from batch_stash_usage where batch_id = :id and stash_id is not null group by stash_id")
                .param("id", id).query(Rows::map).list();
        for (Map<String, Object> row : used) {
            jdbc.sql("update user_stash set amount_left_g = coalesce(amount_left_g, 0) + :total where id = :stash and user_id = :uid")
                    .param("total", row.get("total")).param("stash", row.get("stash_id")).param("uid", uid).update();
        }
    }

    /** Removes a batch for good, with its lines, stash usage and check-ins. */
    @Transactional
    public void delete(UUID uid, UUID id) {
        if (jdbc.sql("delete from batches where id = :id and user_id = :uid").param("id", id).param("uid", uid).update() == 0) {
            throw new ApiException(HttpStatus.NOT_FOUND, "not_found", "Batch not found, or it was already deleted.");
        }
    }

    // ---- editing

    @Transactional
    public void patch(UUID uid, UUID id, BatchRequests.Patch body) {
        // A voided batch stays voided: the only way to undo one is to undo it, which also puts the stash back
        List<String> sets = new ArrayList<>();
        Map<String, Object> params = new LinkedHashMap<>();
        if (body.status() != null) { sets.add("status = :status"); params.put("status", body.status()); }
        if (body.measuredPh() != null) { sets.add("measured_ph = :ph"); params.put("ph", body.measuredPh()); }
        if (body.finalWeightG() != null) { sets.add("final_weight_g = :weight"); params.put("weight", body.finalWeightG()); }
        if (body.notes() != null) { sets.add("notes = :notes"); params.put("notes", blankToNull(body.notes())); }
        if (body.lotNumber() != null) { sets.add("lot_number = :lot"); params.put("lot", body.lotNumber().trim()); }
        if (sets.isEmpty()) return;
        try {
            int updated = jdbc.sql("update batches set " + String.join(", ", sets) + " where id = :id and user_id = :uid and status <> 'voided'")
                    .params(params).param("id", id).param("uid", uid).update();
            if (updated == 0) throw new ApiException(HttpStatus.NOT_FOUND, "not_found", "Batch not found, or it was undone.");
        } catch (DuplicateKeyException e) {
            throw lotTaken();
        }
    }

    @Transactional
    public void addCheck(UUID uid, UUID batchId, BatchRequests.NewCheck body) {
        int inserted = jdbc.sql("insert into batch_checks (id, batch_id, user_id, label, due_on) select :id, b.id, b.user_id, :label, :due from batches b where b.id = :batch and b.user_id = :uid")
                .param("id", UUID.randomUUID()).param("label", body.label().trim()).param("due", Date.valueOf(body.dueOn())).param("batch", batchId).param("uid", uid).update();
        if (inserted == 0) throw new ApiException(HttpStatus.NOT_FOUND, "not_found", "Batch not found.");
    }

    @Transactional
    public void completeCheck(UUID uid, UUID checkId, BatchRequests.CompleteCheck body) {
        String[] observations = body.observations() == null ? new String[0] : body.observations().toArray(String[]::new);
        int updated = jdbc.sql("update batch_checks set checked_at = current_timestamp, result = :result, observations = :obs, measured_ph = :ph, notes = :notes where id = :id and user_id = :uid")
                .param("result", body.result()).param("obs", observations).param("ph", body.measuredPh()).param("notes", blankToNull(body.notes())).param("id", checkId).param("uid", uid).update();
        if (updated == 0) throw new ApiException(HttpStatus.NOT_FOUND, "not_found", "That check-in does not exist.");
    }

    // ---- small checks

    private void requireUsableIngredients(UUID uid, BatchRequests.Create body) {
        var wanted = body.lines().stream().map(BatchRequests.Line::ingredientId).filter(java.util.Objects::nonNull).collect(java.util.stream.Collectors.toSet());
        if (!ingredients.usable(uid, wanted).containsAll(wanted)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "unknown_ingredient", "An ingredient in this batch is not in your library.");
        }
    }

    /** The formula the batch was made from, if it is yours (a batch can outlive its formula, so it may also be none). */
    private UUID ownedFormulaOrNull(UUID uid, UUID formulaId) {
        if (formulaId == null) return null;
        long mine = jdbc.sql("select count(*) from formulations where id = :id and user_id = :uid").param("id", formulaId).param("uid", uid).query(Long.class).single();
        if (mine == 0) throw new ApiException(HttpStatus.BAD_REQUEST, "unknown_formula", "That formula is not yours.");
        return formulaId;
    }

    /** The container is kept by name and size on the batch, so a container that is gone only loses its link. */
    private UUID ownedContainerOrNull(UUID uid, UUID containerId) {
        if (containerId == null) return null;
        long mine = jdbc.sql("select count(*) from user_containers where id = :id and user_id = :uid").param("id", containerId).param("uid", uid).query(Long.class).single();
        return mine == 0 ? null : containerId;
    }

    private static String blankToNull(String s) { return s == null || s.isBlank() ? null : s.trim(); }

    private static ApiException lotTaken() {
        return new ApiException(HttpStatus.CONFLICT, "lot_number_taken", "That lot number is already used by another batch. Pick a different one.");
    }
}
