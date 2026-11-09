package com.demiurgio.formularium.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * A member's passkeys: listing, adding and removing. All of it needs a signed-in member who is not a guest (the security rules answer a guest with 403).
 * Signing IN with a passkey is in {@link AuthController}, because it is how a session starts.
 */
@RestController
@RequestMapping("/api/v1/auth/passkeys")
class PasskeyController {
    private final PasskeyService passkeys;
    private final ClientAddress clientAddress;

    PasskeyController(PasskeyService passkeys, ClientAddress clientAddress) {
        this.passkeys = passkeys;
        this.clientAddress = clientAddress;
    }

    @GetMapping
    PasskeyService.Status status(@AuthenticationPrincipal Jwt jwt) { return passkeys.status(user(jwt)); }

    /** Step 1 of adding one: needs the password (when the account has one). */
    @PostMapping("/registration/options")
    ResponseEntity<PasskeyService.Options> registrationOptions(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody AuthRequests.PasskeyPassword body, HttpServletRequest request) {
        return noStore(passkeys.registrationOptions(user(jwt), body.password(), clientAddress.of(request), request.getHeader(HttpHeaders.USER_AGENT)));
    }

    /** Step 2: what the browser made. */
    @PostMapping("/registration")
    ResponseEntity<PasskeyService.View> register(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody AuthRequests.PasskeyRegistration body, HttpServletRequest request) {
        PasskeyService.View added = passkeys.finishRegistration(user(jwt), body.challengeId(), body.credential(), body.name(), clientAddress.of(request), request.getHeader(HttpHeaders.USER_AGENT));
        return ResponseEntity.status(HttpStatus.CREATED).header(HttpHeaders.CACHE_CONTROL, "no-store").body(added);
    }

    /** A POST and not a DELETE, because it carries the password. */
    @PostMapping("/{id}/remove")
    ResponseEntity<Void> remove(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody AuthRequests.PasskeyPassword body, HttpServletRequest request) {
        passkeys.remove(user(jwt), id, body.password(), clientAddress.of(request), request.getHeader(HttpHeaders.USER_AGENT));
        return ResponseEntity.noContent().build();
    }

    private static UUID user(Jwt jwt) { return UUID.fromString(jwt.getSubject()); }

    /** A challenge must never be cached by the browser or a proxy. */
    private static <T> ResponseEntity<T> noStore(T body) {
        return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL, "no-store").body(body);
    }
}
