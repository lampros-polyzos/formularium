package com.demiurgio.formularium.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Setting up, checking and switching off two-step verification. All of it needs a signed-in member; signing in with a code is in {@link AuthController}. */
@RestController
@RequestMapping("/api/v1/auth/mfa")
class MfaController {
    private final MfaService mfa;

    MfaController(MfaService mfa) { this.mfa = mfa; }

    @GetMapping
    Map<String, Object> status(@AuthenticationPrincipal Jwt jwt) {
        MfaService.Status status = mfa.status(user(jwt));
        return Map.of("available", status.available(), "enabled", status.enabled(), "recovery_codes_left", status.recoveryCodesLeft(), "needs_password", status.needsPassword());
    }

    /** Makes a secret (and the address for its QR code). Does nothing until a code from it is given to /enable. */
    @PostMapping("/setup")
    ResponseEntity<Map<String, String>> setup(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody AuthRequests.MfaSetup body, HttpServletRequest request) {
        MfaService.Setup setup = mfa.setup(user(jwt), body.password(), request.getRemoteAddr(), request.getHeader(HttpHeaders.USER_AGENT));
        return noStore(Map.of("secret", setup.secret(), "otpauth_uri", setup.otpauthUri()));
    }

    /** Switches it on. The recovery codes in the answer are the only time they are shown. */
    @PostMapping("/enable")
    ResponseEntity<Map<String, List<String>>> enable(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody AuthRequests.MfaCode body, HttpServletRequest request) {
        return noStore(Map.of("recovery_codes", mfa.enable(user(jwt), body.code(), request.getRemoteAddr(), request.getHeader(HttpHeaders.USER_AGENT))));
    }

    @PostMapping("/disable")
    ResponseEntity<Void> disable(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody AuthRequests.MfaCode body, HttpServletRequest request) {
        mfa.disable(user(jwt), body.code(), request.getRemoteAddr(), request.getHeader(HttpHeaders.USER_AGENT));
        return ResponseEntity.noContent().build();
    }

    /** Replaces all recovery codes with new ones (the old ones stop working). */
    @PostMapping("/recovery-codes")
    ResponseEntity<Map<String, List<String>>> recoveryCodes(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody AuthRequests.MfaCode body, HttpServletRequest request) {
        return noStore(Map.of("recovery_codes", mfa.newRecoveryCodes(user(jwt), body.code(), request.getRemoteAddr(), request.getHeader(HttpHeaders.USER_AGENT))));
    }

    private static UUID user(Jwt jwt) { return UUID.fromString(jwt.getSubject()); }

    /** Secrets and recovery codes must never be cached by the browser or a proxy. */
    private static <T> ResponseEntity<T> noStore(T body) {
        return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL, "no-store").body(body);
    }
}
