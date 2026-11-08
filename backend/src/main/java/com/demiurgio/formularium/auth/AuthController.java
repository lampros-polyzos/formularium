package com.demiurgio.formularium.auth;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {
    static final String REFRESH_COOKIE = "refresh_token";
    private static final String COOKIE_PATH = "/api/v1/auth";

    private final AuthService auth;
    private final AuthProperties properties;

    AuthController(AuthService auth, AuthProperties properties) {
        this.auth = auth;
        this.properties = properties;
    }

    @PostMapping("/register")
    ResponseEntity<?> register(@Valid @RequestBody AuthRequests.Register body, HttpServletRequest request) {
        AuthService.Session session = auth.register(body, request.getRemoteAddr(), request.getHeader(HttpHeaders.USER_AGENT));
        if (session == null) {
            // The account exists but must confirm its email before signing in: no session yet
            return ResponseEntity.accepted().header(HttpHeaders.CACHE_CONTROL, "no-store").body(Map.of("verification_required", true, "email", body.email().trim().toLowerCase()));
        }
        return respond(HttpStatus.CREATED, session);
    }

    @PostMapping("/verify-email")
    ResponseEntity<Void> verifyEmail(@Valid @RequestBody AuthRequests.Token body) {
        auth.verifyEmail(body.token());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/resend-verification")
    ResponseEntity<Void> resendVerification(@Valid @RequestBody AuthRequests.EmailOnly body, HttpServletRequest request) {
        auth.resendVerification(body, request.getRemoteAddr());
        return ResponseEntity.accepted().build();
    }

    @PostMapping("/forgot-password")
    ResponseEntity<Void> forgotPassword(@Valid @RequestBody AuthRequests.EmailOnly body, HttpServletRequest request) {
        auth.forgotPassword(body, request.getRemoteAddr());
        return ResponseEntity.accepted().build();
    }

    @PostMapping("/reset-password")
    ResponseEntity<Void> resetPassword(@Valid @RequestBody AuthRequests.ResetPassword body) {
        auth.resetPassword(body);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/login")
    ResponseEntity<AuthResponse> login(@Valid @RequestBody AuthRequests.Login body, HttpServletRequest request) {
        return respond(HttpStatus.OK, auth.login(body, request.getRemoteAddr(), request.getHeader(HttpHeaders.USER_AGENT)));
    }

    @PostMapping("/google")
    ResponseEntity<AuthResponse> google(@Valid @RequestBody AuthRequests.Google body, HttpServletRequest request) {
        return respond(HttpStatus.OK, auth.loginWithGoogle(body.idToken(), request.getRemoteAddr(), request.getHeader(HttpHeaders.USER_AGENT)));
    }

    @PostMapping("/refresh")
    ResponseEntity<AuthResponse> refresh(HttpServletRequest request) {
        return respond(HttpStatus.OK, auth.refresh(refreshCookie(request), request.getRemoteAddr(), request.getHeader(HttpHeaders.USER_AGENT)));
    }

    @PostMapping("/logout")
    ResponseEntity<Void> logout(HttpServletRequest request) {
        auth.logout(refreshCookie(request));
        return ResponseEntity.noContent().header(HttpHeaders.SET_COOKIE, cookie("", Duration.ZERO).toString()).build();
    }

    @GetMapping("/me")
    UserView me(@AuthenticationPrincipal Jwt jwt) {
        return auth.me(UUID.fromString(jwt.getSubject()));
    }

    @PatchMapping("/me")
    UserView updateProfile(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody AuthRequests.Profile body) {
        return auth.updateUsername(UUID.fromString(jwt.getSubject()), body.username());
    }

    @DeleteMapping("/me")
    ResponseEntity<Void> deleteAccount(@AuthenticationPrincipal Jwt jwt) {
        auth.deleteAccount(UUID.fromString(jwt.getSubject()));
        return ResponseEntity.noContent().header(HttpHeaders.SET_COOKIE, cookie("", Duration.ZERO).toString()).build();
    }

    private ResponseEntity<AuthResponse> respond(HttpStatus status, AuthService.Session session) {
        return ResponseEntity.status(status)
                .header(HttpHeaders.SET_COOKIE, cookie(session.refreshToken(), properties.refreshTtl()).toString())
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(session.response());
    }

    /** HttpOnly: scripts on the page cannot read it. Only sent to the auth endpoints. */
    private ResponseCookie cookie(String value, Duration maxAge) {
        return ResponseCookie.from(REFRESH_COOKIE, value)
                .httpOnly(true).secure(properties.cookieSecure()).sameSite(properties.cookieSameSite()).path(COOKIE_PATH).maxAge(maxAge).build();
    }

    private static String refreshCookie(HttpServletRequest request) {
        if (request.getCookies() == null) return null;
        for (Cookie c : request.getCookies()) if (REFRESH_COOKIE.equals(c.getName())) return c.getValue();
        return null;
    }
}
