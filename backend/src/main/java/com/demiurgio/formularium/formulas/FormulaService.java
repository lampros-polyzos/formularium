package com.demiurgio.formularium.formulas;

import com.demiurgio.formularium.auth.ApiException;
import com.demiurgio.formularium.library.IngredientColumns;
import com.demiurgio.formularium.library.IngredientRepository;
import com.demiurgio.formularium.library.Rows;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * A person's formulas. Every query is limited to the signed-in person's own rows, and a formula is always written together with its
 * phases and ingredient lines in one transaction, so a formula is never left half-saved.
 */
@Service
public class FormulaService {
    private static final Logger log = LoggerFactory.getLogger(FormulaService.class);

    // The columns the app uses (not the claims list and last-validated time, which nothing reads)
    private static final String FORMULA_COLUMNS = """
            f.id, f.user_id, f.name, f.target_weight_g, f.status, f.profile_id, f.created_at, f.target_ph,
            f.community_post_id, f.cloned_from_formulation_id, f.remixed_from_post_id""";

    /** Keys of a phase/line row that are not part of the ingredient. */
    private static final Set<String> LINE_KEYS = Set.of("formula_id", "phase_id", "phase_letter", "line_id", "percentage", "is_qs");

    private final JdbcClient jdbc;
    private final IngredientRepository ingredients;

    FormulaService(JdbcClient jdbc, IngredientRepository ingredients) {
        this.jdbc = jdbc;
        this.ingredients = ingredients;
    }

    // ---- reading

    /** Newest first. */
    public List<Map<String, Object>> list(UUID uid) {
        return jdbc.sql("select " + FORMULA_COLUMNS + " from formulations f where f.user_id = :uid order by f.created_at desc").param("uid", uid).query(Rows::map).list();
    }

    /** One formula with its phases, each with its lines, each with the whole ingredient (the shape the editor reads). Null when it is not yours. */
    public Map<String, Object> detail(UUID uid, UUID id) {
        Map<String, Object> formula = jdbc.sql("select " + FORMULA_COLUMNS + " from formulations f where f.id = :id and f.user_id = :uid").param("id", id).param("uid", uid)
                .query(Rows::map).optional().orElse(null);
        if (formula == null) return null;
        formula.put("formulation_phases", phases(uid, id).getOrDefault(id, List.of()));
        return formula;
    }

    /** All of a person's formulas with their phases and lines, sorted by name. */
    public List<Map<String, Object>> allWithLines(UUID uid) {
        List<Map<String, Object>> formulas = jdbc.sql("select " + FORMULA_COLUMNS + " from formulations f where f.user_id = :uid order by f.name").param("uid", uid).query(Rows::map).list();
        Map<UUID, List<Map<String, Object>>> byFormula = phases(uid, null);
        for (Map<String, Object> f : formulas) f.put("formulation_phases", byFormula.getOrDefault((UUID) f.get("id"), List.of()));
        return formulas;
    }

    /** Phases with their lines, for one formula or (null) for all of a person's formulas. */
    private Map<UUID, List<Map<String, Object>>> phases(UUID uid, UUID formulaId) {
        String sql = "select p.formulation_id as formula_id, p.id as phase_id, p.phase_letter, fi.id as line_id, fi.percentage, fi.is_qs, " + IngredientColumns.SELECT + """

                  from formulation_phases p
                  join formulations f on f.id = p.formulation_id and f.user_id = :uid
                  left join formulation_ingredients fi on fi.phase_id = p.id
                  left join ingredients i on i.id = fi.ingredient_id
                 where 1 = 1""" + (formulaId == null ? "" : " and p.formulation_id = :formula") + " order by p.formulation_id, p.phase_letter, fi.percentage desc";
        JdbcClient.StatementSpec query = jdbc.sql(sql).param("uid", uid);
        if (formulaId != null) query = query.param("formula", formulaId);
        List<Map<String, Object>> rows = query.query(Rows::map).list();

        Map<UUID, Map<UUID, Map<String, Object>>> grouped = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            UUID formula = (UUID) row.get("formula_id");
            UUID phaseId = (UUID) row.get("phase_id");
            Map<String, Object> phase = grouped.computeIfAbsent(formula, k -> new LinkedHashMap<>()).computeIfAbsent(phaseId, k -> {
                Map<String, Object> p = new LinkedHashMap<>();
                p.put("id", phaseId);
                p.put("phase_letter", row.get("phase_letter"));
                p.put("formulation_ingredients", new ArrayList<Map<String, Object>>());
                return p;
            });
            if (row.get("line_id") == null) continue;   // a phase with nothing in it
            Map<String, Object> ingredient = null;
            if (row.get("trade_name") != null) {
                ingredient = new LinkedHashMap<>();
                for (String key : IngredientColumns.KEYS) ingredient.put(key, row.get(key));
            }
            Map<String, Object> line = new LinkedHashMap<>();
            line.put("percentage", row.get("percentage"));
            line.put("is_qs", row.get("is_qs"));
            line.put("ingredients", ingredient);
            @SuppressWarnings("unchecked") List<Map<String, Object>> lines = (List<Map<String, Object>>) phase.get("formulation_ingredients");
            lines.add(line);
        }
        Map<UUID, List<Map<String, Object>>> result = new LinkedHashMap<>();
        grouped.forEach((formula, byPhase) -> result.put(formula, new ArrayList<>(byPhase.values())));
        return result;
    }

    // ---- writing

    /**
     * Creates a formula (a draft) with its contents. When `skipUnavailable` is set, lines whose ingredient the person cannot use are
     * left out instead of refused: a community recipe can contain another member's private ingredient.
     */
    @Transactional
    public Map<String, Object> create(UUID uid, FormulaRequests.Save body, boolean skipUnavailable) {
        requireProfile(body.profileId());
        UUID clonedFrom = body.clonedFromFormulationId();
        if (clonedFrom != null && !owns(uid, clonedFrom)) throw new ApiException(HttpStatus.BAD_REQUEST, "unknown_formula", "The formula to copy from is not yours.");
        // A community recipe that has been deleted since only loses its link: the copy is still made
        UUID remixedFrom = body.remixedFromPostId() != null && postExists(body.remixedFromPostId()) ? body.remixedFromPostId() : null;

        UUID id = UUID.randomUUID();
        jdbc.sql("""
                insert into formulations (id, user_id, name, profile_id, target_weight_g, target_ph, status, cloned_from_formulation_id, remixed_from_post_id)
                values (:id, :uid, :name, :profile, :weight, :ph, 'Draft', :cloned, :remixed)""")
                .param("id", id).param("uid", uid).param("name", body.name().trim()).param("profile", blankToNull(body.profileId()))
                .param("weight", body.targetWeightG() == null ? java.math.BigDecimal.valueOf(100) : body.targetWeightG()).param("ph", body.targetPh())
                .param("cloned", clonedFrom, java.sql.Types.OTHER).param("remixed", remixedFrom, java.sql.Types.OTHER).update();
        writeContents(uid, id, body.ingredients(), skipUnavailable);
        return detail(uid, id);
    }

    /** Saves over a formula: its details, and its whole contents replaced. The status and the remix links are never touched. */
    @Transactional
    public Map<String, Object> save(UUID uid, UUID id, FormulaRequests.Save body) {
        requireProfile(body.profileId());
        int updated = jdbc.sql("update formulations set name = :name, profile_id = :profile, target_weight_g = :weight, target_ph = :ph where id = :id and user_id = :uid")
                .param("id", id).param("uid", uid).param("name", body.name().trim()).param("profile", blankToNull(body.profileId()))
                .param("weight", body.targetWeightG() == null ? java.math.BigDecimal.valueOf(100) : body.targetWeightG()).param("ph", body.targetPh()).update();
        if (updated == 0) throw notFound();
        jdbc.sql("delete from formulation_phases where formulation_id = :id").param("id", id).update();   // the lines go with their phases
        writeContents(uid, id, body.ingredients(), false);
        return detail(uid, id);
    }

    @Transactional
    public void delete(UUID uid, UUID id) {
        if (jdbc.sql("delete from formulations where id = :id and user_id = :uid").param("id", id).param("uid", uid).update() == 0) throw notFound();
    }

    /** Remembers which community post a formula was shared as. Only the post's author can link their own formula to it. */
    @Transactional
    public void linkPost(UUID uid, UUID id, UUID postId) {
        long mine = jdbc.sql("select count(*) from community_posts where id = :post and author_id = :uid").param("post", postId).param("uid", uid).query(Long.class).single();
        if (mine == 0) throw new ApiException(HttpStatus.BAD_REQUEST, "unknown_post", "That post is not yours.");
        if (jdbc.sql("update formulations set community_post_id = :post where id = :id and user_id = :uid").param("post", postId).param("id", id).param("uid", uid).update() == 0) throw notFound();
    }

    private void writeContents(UUID uid, UUID formulaId, List<FormulaRequests.Line> lines, boolean skipUnavailable) {
        Set<UUID> usable = ingredients.usable(uid, lines.stream().map(FormulaRequests.Line::ingredientId).collect(java.util.stream.Collectors.toSet()));
        List<FormulaRequests.Line> kept = new ArrayList<>();
        for (FormulaRequests.Line line : lines) {
            if (usable.contains(line.ingredientId())) kept.add(line);
            else if (skipUnavailable) log.info("A line was left out of a copy: ingredient {} is not available to this person.", line.ingredientId());
            else throw new ApiException(HttpStatus.BAD_REQUEST, "unknown_ingredient", "An ingredient in this formula is not in your library.");
        }

        Map<String, UUID> phaseIds = new LinkedHashMap<>();
        for (String letter : new LinkedHashSet<>(kept.stream().map(l -> l.phaseLetter().toUpperCase(java.util.Locale.ROOT)).toList())) {
            UUID phaseId = UUID.randomUUID();
            jdbc.sql("insert into formulation_phases (id, formulation_id, phase_letter) values (:id, :formula, :letter)").param("id", phaseId).param("formula", formulaId).param("letter", letter).update();
            phaseIds.put(letter, phaseId);
        }
        for (FormulaRequests.Line line : kept) {
            jdbc.sql("insert into formulation_ingredients (id, phase_id, ingredient_id, percentage, is_qs) values (:id, :phase, :ingredient, :pct, :qs)")
                    .param("id", UUID.randomUUID()).param("phase", phaseIds.get(line.phaseLetter().toUpperCase(java.util.Locale.ROOT))).param("ingredient", line.ingredientId())
                    .param("pct", line.percentage()).param("qs", Boolean.TRUE.equals(line.isQs())).update();
        }
    }

    // ---- small checks

    boolean owns(UUID uid, UUID formulaId) {
        return jdbc.sql("select count(*) from formulations where id = :id and user_id = :uid").param("id", formulaId).param("uid", uid).query(Long.class).single() > 0;
    }

    private boolean postExists(UUID postId) {
        return jdbc.sql("select count(*) from community_posts where id = :id").param("id", postId).query(Long.class).single() > 0;
    }

    private void requireProfile(String profileId) {
        if (profileId == null || profileId.isBlank()) return;
        long found = jdbc.sql("select count(*) from formulation_profiles where id = :id").param("id", profileId).query(Long.class).single();
        if (found == 0) throw new ApiException(HttpStatus.BAD_REQUEST, "unknown_profile", "That product type does not exist.");
    }

    private static String blankToNull(String s) { return s == null || s.isBlank() ? null : s; }

    static ApiException notFound() { return new ApiException(HttpStatus.NOT_FOUND, "not_found", "That formula does not exist."); }
}
