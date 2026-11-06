package com.demiurgio.formularium.formulas;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/formulas/{formulaId}/versions")
class VersionController {
    private final VersionService versions;

    VersionController(VersionService versions) { this.versions = versions; }

    private static UUID user(Jwt jwt) { return UUID.fromString(jwt.getSubject()); }

    @GetMapping
    List<Map<String, Object>> list(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID formulaId) {
        return versions.list(user(jwt), formulaId);
    }

    @PostMapping
    ResponseEntity<Map<String, Object>> add(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID formulaId, @Valid @RequestBody FormulaRequests.Version body) {
        return ResponseEntity.status(HttpStatus.CREATED).body(versions.add(user(jwt), formulaId, body));
    }

    @DeleteMapping("/{versionId}")
    ResponseEntity<Void> delete(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID formulaId, @PathVariable UUID versionId) {
        versions.delete(user(jwt), formulaId, versionId);
        return ResponseEntity.noContent().build();
    }
}
