package com.demiurgio.formularium.formulas;

import com.demiurgio.formularium.auth.ApiException;
import com.demiurgio.formularium.library.Rows;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * The history of a formula: copies of it at moments the owner chose, each with a note. A version is a frozen copy: it cannot be changed,
 * only deleted. The numbers count up per formula.
 */
@Service
public class VersionService {
    private static final String COLUMNS = "v.id, v.version_number, v.note, v.name, v.profile_id, v.target_weight_g, v.target_ph, v.lines, v.created_at";

    private final JdbcClient jdbc;
    private final ObjectMapper json;

    VersionService(JdbcClient jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    /** Newest first. */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> list(UUID uid, UUID formulaId) {
        requireOwner(uid, formulaId, false);
        return jdbc.sql("select " + COLUMNS + " from formulation_versions v where v.formulation_id = :f order by v.version_number desc").param("f", formulaId)
                .query((rs, n) -> readable(Rows.map(rs, n))).list();
    }

    @Transactional
    public Map<String, Object> add(UUID uid, UUID formulaId, FormulaRequests.Version body) {
        requireOwner(uid, formulaId, true);   // locks the formula, so two saves at once cannot take the same number
        int number = jdbc.sql("select coalesce(max(version_number), 0) + 1 from formulation_versions where formulation_id = :f").param("f", formulaId).query(Integer.class).single();
        UUID id = UUID.randomUUID();
        String lines;
        try {
            lines = json.writeValueAsString(body.lines());
        } catch (JacksonException e) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "invalid_request", "The version could not be read.");
        }
        jdbc.sql("""
                insert into formulation_versions (id, formulation_id, user_id, version_number, note, name, profile_id, target_weight_g, target_ph, lines)
                values (:id, :f, :uid, :number, :note, :name, :profile, :weight, :ph, :lines)""")
                .param("id", id).param("f", formulaId).param("uid", uid).param("number", number)
                .param("note", body.note() == null || body.note().isBlank() ? null : body.note().trim()).param("name", body.name().trim())
                .param("profile", body.profileId() == null || body.profileId().isBlank() ? null : body.profileId()).param("weight", body.targetWeightG()).param("ph", body.targetPh())
                .param("lines", lines).update();
        return jdbc.sql("select " + COLUMNS + " from formulation_versions v where v.id = :id").param("id", id).query((rs, n) -> readable(Rows.map(rs, n))).single();
    }

    @Transactional
    public void delete(UUID uid, UUID formulaId, UUID versionId) {
        requireOwner(uid, formulaId, false);
        int deleted = jdbc.sql("delete from formulation_versions where id = :v and formulation_id = :f").param("v", versionId).param("f", formulaId).update();
        if (deleted == 0) throw new ApiException(HttpStatus.NOT_FOUND, "not_found", "That version does not exist.");
    }

    private void requireOwner(UUID uid, UUID formulaId, boolean lock) {
        long found = jdbc.sql("select count(*) from (select id from formulations where id = :f and user_id = :uid" + (lock ? " for update" : "") + ") x")
                .param("f", formulaId).param("uid", uid).query(Long.class).single();
        if (found == 0) throw FormulaService.notFound();
    }

    /** The lines are stored as JSON text; the client gets them as a list. */
    private Map<String, Object> readable(Map<String, Object> row) {
        Object text = row.get("lines");
        if (text instanceof String s) {
            try {
                row.put("lines", json.readValue(s, List.class));
            } catch (JacksonException e) {
                row.put("lines", List.of());
            }
        }
        return row;
    }
}
