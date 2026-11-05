package com.demiurgio.formularium.starter;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/** Gives a new account its starter formulas. Runs inside the transaction that creates the account, so either both exist or neither does. */
@Service
public class StarterFormulaService {
    private static final Logger log = LoggerFactory.getLogger(StarterFormulaService.class);

    private final JdbcClient jdbc;

    StarterFormulaService(JdbcClient jdbc) { this.jdbc = jdbc; }

    @Transactional(propagation = Propagation.MANDATORY)
    public void createFor(UUID userId) {
        for (StarterFormulas.Formula formula : StarterFormulas.ALL) {
            UUID formulaId = UUID.randomUUID();
            jdbc.sql("insert into formulations (id, user_id, name, profile_id, target_weight_g, target_ph, status) values (:id, :uid, :name, :profile, 100, :ph, 'Draft')")
                    .param("id", formulaId).param("uid", userId).param("name", formula.name()).param("profile", formula.profileId()).param("ph", formula.targetPh()).update();

            for (StarterFormulas.Phase phase : formula.phases()) {
                UUID phaseId = UUID.randomUUID();
                jdbc.sql("insert into formulation_phases (id, formulation_id, phase_letter) values (:id, :formula, :letter)")
                        .param("id", phaseId).param("formula", formulaId).param("letter", phase.letter()).update();

                for (StarterFormulas.Line line : phase.lines()) {
                    UUID ingredientId = jdbc.sql("select id from ingredients where inci_name = :inci and user_id is null").param("inci", line.inciName())
                            .query((rs, n) -> rs.getObject(1, UUID.class)).optional().orElse(null);
                    if (ingredientId == null) {
                        // The library changed. The formula is still created, just without this line, and somebody should look.
                        log.warn("Starter formula \"{}\": \"{}\" is not in the ingredient library, so that line was left out.", formula.name(), line.inciName());
                        continue;
                    }
                    jdbc.sql("insert into formulation_ingredients (id, phase_id, ingredient_id, percentage, is_qs) values (:id, :phase, :ingredient, :pct, :qs)")
                            .param("id", UUID.randomUUID()).param("phase", phaseId).param("ingredient", ingredientId).param("pct", line.amount()).param("qs", line.qs()).update();
                }
            }
        }
    }
}
