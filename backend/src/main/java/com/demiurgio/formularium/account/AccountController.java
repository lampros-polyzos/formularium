package com.demiurgio.formularium.account;

import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/account")
class AccountController {
    private final AccountExportService exports;

    AccountController(AccountExportService exports) { this.exports = exports; }

    /** Never cached: it is personal data. */
    @GetMapping("/export")
    ResponseEntity<Map<String, Object>> export(@AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL, "no-store").body(exports.export(UUID.fromString(jwt.getSubject())));
    }
}
