package com.demiurgio.formularium.formulas;

import com.demiurgio.formularium.auth.ApiException;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1")
class FormulaController {
    private final FormulaService formulas;
    private final JdbcClient jdbc;

    FormulaController(FormulaService formulas, JdbcClient jdbc) {
        this.formulas = formulas;
        this.jdbc = jdbc;
    }

    private static UUID user(Jwt jwt) { return UUID.fromString(jwt.getSubject()); }

    // ---- product types (the profiles a formula is made for)

    @GetMapping("/profiles")
    List<Map<String, Object>> profiles() {
        return jdbc.sql("select id, name, category, requires_water, requires_oil, requires_emulsifier, requires_preservative, max_oil_phase_percent, default_ph_min, default_ph_max from formulation_profiles order by name")
                .query(com.demiurgio.formularium.library.Rows::map).list();
    }

    @GetMapping("/profiles/{id}")
    Map<String, Object> profile(@PathVariable String id) {
        return jdbc.sql("select id, name, category, requires_water, requires_oil, requires_emulsifier, requires_preservative, max_oil_phase_percent, default_ph_min, default_ph_max from formulation_profiles where id = :id")
                .param("id", id).query(com.demiurgio.formularium.library.Rows::map).optional()
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "not_found", "That product type does not exist."));
    }

    // ---- formulas

    /** Your formulas, newest first. With `lines=true`, each with its phases and ingredients, sorted by name. */
    @GetMapping("/formulas")
    List<Map<String, Object>> list(@AuthenticationPrincipal Jwt jwt, @RequestParam(defaultValue = "false") boolean lines) {
        return lines ? formulas.allWithLines(user(jwt)) : formulas.list(user(jwt));
    }

    @GetMapping("/formulas/{id}")
    Map<String, Object> one(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        Map<String, Object> formula = formulas.detail(user(jwt), id);
        if (formula == null) throw FormulaService.notFound();
        return formula;
    }

    /** Creates a draft. `copy=true` is for a copy of someone else's recipe: lines using an ingredient you cannot see are left out. */
    @PostMapping("/formulas")
    ResponseEntity<Map<String, Object>> create(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody FormulaRequests.Save body, @RequestParam(defaultValue = "false") boolean copy) {
        return ResponseEntity.status(HttpStatus.CREATED).body(formulas.create(user(jwt), body, copy));
    }

    @PutMapping("/formulas/{id}")
    Map<String, Object> save(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody FormulaRequests.Save body) {
        return formulas.save(user(jwt), id, body);
    }

    @DeleteMapping("/formulas/{id}")
    ResponseEntity<Void> delete(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        formulas.delete(user(jwt), id);
        return ResponseEntity.noContent().build();
    }

    @PutMapping("/formulas/{id}/post")
    ResponseEntity<Void> linkPost(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody FormulaRequests.LinkPost body) {
        formulas.linkPost(user(jwt), id, body.communityPostId());
        return ResponseEntity.noContent().build();
    }
}
