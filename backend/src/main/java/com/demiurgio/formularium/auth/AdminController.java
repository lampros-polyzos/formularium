package com.demiurgio.formularium.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/** The admin tool's API. Needs a signed-in member who is not a guest (the security rules), and then an administrator (asked of the database on every request). */
@RestController
@RequestMapping("/api/v1/admin")
class AdminController {
    private final AdminService admin;
    private final ClientAddress clientAddress;

    AdminController(AdminService admin, ClientAddress clientAddress) {
        this.admin = admin;
        this.clientAddress = clientAddress;
    }

    @GetMapping("/status")
    ResponseEntity<AdminService.Status> status(@AuthenticationPrincipal Jwt jwt) { return noStore(admin.status(user(jwt))); }

    @GetMapping("/members")
    ResponseEntity<List<AdminRepository.Member>> search(@AuthenticationPrincipal Jwt jwt, @RequestParam(defaultValue = "") String q) {
        return noStore(admin.search(user(jwt), q));
    }

    @GetMapping("/members/{id}")
    ResponseEntity<AdminService.Detail> member(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) { return noStore(admin.view(user(jwt), id)); }

    /** A POST because it carries the administrator's password. */
    @PostMapping("/members/{id}/actions")
    ResponseEntity<AdminService.Detail> act(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody AuthRequests.AdminAction body, HttpServletRequest request) {
        return noStore(admin.act(user(jwt), id, body, clientAddress.of(request), request.getHeader(HttpHeaders.USER_AGENT)));
    }

    private static UUID user(Jwt jwt) { return UUID.fromString(jwt.getSubject()); }

    /** Other people's account details must never be cached by the browser or a proxy. */
    private static <T> ResponseEntity<T> noStore(T body) { return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL, "no-store").body(body); }
}
