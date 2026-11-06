package com.demiurgio.formularium.batches;

import com.demiurgio.formularium.auth.ApiException;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.DateTimeException;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/batches")
class BatchController {
    private final BatchService batches;

    BatchController(BatchService batches) { this.batches = batches; }

    private static UUID user(Jwt jwt) { return UUID.fromString(jwt.getSubject()); }

    /** The person's own date (their clock decides when "today" is), within a day of the server's. */
    private static LocalDate today(String text) {
        if (text == null || text.isBlank()) return LocalDate.now();
        try {
            LocalDate given = LocalDate.parse(text);
            long off = Math.abs(java.time.temporal.ChronoUnit.DAYS.between(LocalDate.now(), given));
            return off <= 1 ? given : LocalDate.now();
        } catch (DateTimeException e) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "invalid_request", "today must be a date like 2026-11-06.");
        }
    }

    @GetMapping
    List<Map<String, Object>> list(@AuthenticationPrincipal Jwt jwt) { return batches.list(user(jwt)); }

    /** What went into every batch (for the metrics). */
    @GetMapping("/lines")
    List<Map<String, Object>> lines(@AuthenticationPrincipal Jwt jwt) { return batches.lines(user(jwt)); }

    @GetMapping("/lot-numbers")
    List<String> lotNumbers(@AuthenticationPrincipal Jwt jwt, @RequestParam String prefix) { return batches.lotNumbers(user(jwt), prefix); }

    @GetMapping("/checks/due")
    List<Map<String, Object>> dueChecks(@AuthenticationPrincipal Jwt jwt, @RequestParam(required = false) String today, @RequestParam(defaultValue = "3") int limit) {
        return batches.dueChecks(user(jwt), today(today), Math.max(1, Math.min(limit, 50)));
    }

    @GetMapping("/checks/due/count")
    Map<String, Long> dueCount(@AuthenticationPrincipal Jwt jwt, @RequestParam(required = false) String today) {
        return Map.of("count", batches.dueCount(user(jwt), today(today)));
    }

    @GetMapping("/{id}")
    Map<String, Object> one(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        Map<String, Object> batch = batches.detail(user(jwt), id);
        if (batch == null) throw new ApiException(HttpStatus.NOT_FOUND, "not_found", "That batch does not exist.");
        return batch;
    }

    @PostMapping
    ResponseEntity<Map<String, UUID>> create(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody BatchRequests.Create body) {
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("id", batches.create(user(jwt), body)));
    }

    @PatchMapping("/{id}")
    ResponseEntity<Void> patch(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody BatchRequests.Patch body) {
        batches.patch(user(jwt), id, body);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/void")
    ResponseEntity<Void> voidBatch(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        batches.voidBatch(user(jwt), id);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/{id}")
    ResponseEntity<Void> delete(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        batches.delete(user(jwt), id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/checks")
    ResponseEntity<Void> addCheck(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody BatchRequests.NewCheck body) {
        batches.addCheck(user(jwt), id, body);
        return ResponseEntity.status(HttpStatus.CREATED).build();
    }

    @PutMapping("/checks/{checkId}")
    ResponseEntity<Void> completeCheck(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID checkId, @Valid @RequestBody BatchRequests.CompleteCheck body) {
        batches.completeCheck(user(jwt), checkId, body);
        return ResponseEntity.noContent().build();
    }
}
