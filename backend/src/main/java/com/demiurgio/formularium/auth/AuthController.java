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
    /** Recognises this browser at the next sign-in, so that a sign-in from a different one can be reported to the account's owner. */
    static final String DEVICE_COOKIE = "device_id";
    private static final String COOKIE_PATH = "/api/v1/auth";

    private final AuthService auth;
    private final AuthProperties properties;
    private final ClientAddress clientAddress;
    private final DeviceService devices;

    AuthController(AuthService auth, AuthProperties properties, ClientAddress clientAddress, DeviceService devices) {
        this.auth = auth;
        this.properties = properties;
        this.clientAddress = clientAddress;
        this.devices = devices;
    }

    @PostMapping("/register")
    ResponseEntity<?> register(@Valid @RequestBody AuthRequests.Register body, HttpServletRequest request) {
        AuthService.Session session = auth.register(body, clientAddress.of(request), request.getHeader(HttpHeaders.USER_AGENT));
        if (session == null) {
            // The account exists but must confirm its email before signing in: no session yet
            return ResponseEntity.accepted().header(HttpHeaders.CACHE_CONTROL, "no-store").body(Map.of("verification_required", true, "email", body.email().trim().toLowerCase()));
        }
        return respondSignIn(HttpStatus.CREATED, session, request, "sign-up");
    }

    /** "Try the demo": a temporary account and a session at once. */
    @PostMapping("/guest")
    ResponseEntity<AuthResponse> guest(@Valid @RequestBody AuthRequests.Guest body, HttpServletRequest request) {
        return respond(HttpStatus.CREATED, auth.startGuest(body, clientAddress.of(request), request.getHeader(HttpHeaders.USER_AGENT)));
    }

    @PostMapping("/verify-email")
    ResponseEntity<Void> verifyEmail(@Valid @RequestBody AuthRequests.Token body) {
        auth.verifyEmail(body.token());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/resend-verification")
    ResponseEntity<Void> resendVerification(@Valid @RequestBody AuthRequests.EmailOnly body, HttpServletRequest request) {
        auth.resendVerification(body, clientAddress.of(request));
        return ResponseEntity.accepted().build();
    }

    @PostMapping("/forgot-password")
    ResponseEntity<Void> forgotPassword(@Valid @RequestBody AuthRequests.EmailOnly body, HttpServletRequest request) {
        auth.forgotPassword(body, clientAddress.of(request));
        return ResponseEntity.accepted().build();
    }

    @PostMapping("/reset-password")
    ResponseEntity<Void> resetPassword(@Valid @RequestBody AuthRequests.ResetPassword body) {
        auth.resetPassword(body);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/login")
    ResponseEntity<?> login(@Valid @RequestBody AuthRequests.Login body, HttpServletRequest request) {
        return respondLogin(auth.login(body, clientAddress.of(request), request.getHeader(HttpHeaders.USER_AGENT)), request, "your password");
    }

    /** The second step of signing in, for accounts with two-step verification. */
    @PostMapping("/login/mfa")
    ResponseEntity<AuthResponse> loginMfa(@Valid @RequestBody AuthRequests.MfaLogin body, HttpServletRequest request) {
        return respondSignIn(HttpStatus.OK, auth.completeMfaLogin(body, clientAddress.of(request), request.getHeader(HttpHeaders.USER_AGENT)), request, "two-step verification");
    }

    /** Signing in with a passkey, step 1: a challenge for the browser. */
    @PostMapping("/login/passkey/options")
    ResponseEntity<PasskeyService.Options> passkeyOptions(HttpServletRequest request) {
        return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL, "no-store").body(auth.passkeyLoginOptions(clientAddress.of(request)));
    }

    /** Step 2: the browser's signature, which starts the session. */
    @PostMapping("/login/passkey")
    ResponseEntity<AuthResponse> loginPasskey(@Valid @RequestBody AuthRequests.PasskeyLogin body, HttpServletRequest request) {
        return respondSignIn(HttpStatus.OK, auth.loginWithPasskey(body, clientAddress.of(request), request.getHeader(HttpHeaders.USER_AGENT)), request, "a passkey");
    }

    @PostMapping("/google")
    ResponseEntity<?> google(@Valid @RequestBody AuthRequests.Google body, HttpServletRequest request) {
        return respondLogin(auth.loginWithGoogle(body.idToken(), clientAddress.of(request), request.getHeader(HttpHeaders.USER_AGENT)), request, "Google");
    }

    @PostMapping("/refresh")
    ResponseEntity<AuthResponse> refresh(HttpServletRequest request) {
        return respond(HttpStatus.OK, auth.refresh(refreshCookie(request), clientAddress.of(request), request.getHeader(HttpHeaders.USER_AGENT)));
    }

    @PostMapping("/logout")
    ResponseEntity<Void> logout(HttpServletRequest request) {
        auth.logout(refreshCookie(request));
        return ResponseEntity.noContent().header(HttpHeaders.SET_COOKIE, cookie("", Duration.ZERO).toString()).build();
    }

    /** Changes the password of the signed-in member. The refresh cookie says which sign-in is this one, so it is the one that stays. */
    @PostMapping("/password")
    ResponseEntity<Void> changePassword(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody AuthRequests.ChangePassword body, HttpServletRequest request) {
        auth.changePassword(UUID.fromString(jwt.getSubject()), body, refreshCookie(request), clientAddress.of(request), request.getHeader(HttpHeaders.USER_AGENT));
        return ResponseEntity.noContent().header(HttpHeaders.CACHE_CONTROL, "no-store").build();
    }

    /** Switches password sign-in off or on for the signed-in member. The refresh cookie says which sign-in is this one, so it is the one that stays. */
    @PostMapping("/password-sign-in")
    ResponseEntity<Void> passwordSignIn(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody AuthRequests.PasswordSignIn body, HttpServletRequest request) {
        auth.setPasswordSignIn(UUID.fromString(jwt.getSubject()), body, refreshCookie(request), clientAddress.of(request), request.getHeader(HttpHeaders.USER_AGENT));
        return ResponseEntity.noContent().header(HttpHeaders.CACHE_CONTROL, "no-store").build();
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

    /** A session (with its cookie), or, when a code is still needed, the one-time token for the second step and no cookie at all. */
    private ResponseEntity<?> respondLogin(AuthService.LoginResult result, HttpServletRequest request, String method) {
        if (result instanceof AuthService.MfaChallenge challenge) {
            return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL, "no-store").body(Map.of("mfa_required", true, "mfa_token", challenge.token()));
        }
        return respondSignIn(HttpStatus.OK, (AuthService.Session) result, request, method);
    }

    /**
     * A session that a person has just signed in to (not a renewal): as {@link #respond}, and the browser is noted. If it is one this account has not been seen on, its
     * owner is emailed; the browser gets the cookie that will recognise it next time.
     */
    private ResponseEntity<AuthResponse> respondSignIn(HttpStatus status, AuthService.Session session, HttpServletRequest request, String method) {
        String device = devices.recognise(session.response().user().id(), cookieValue(request, DEVICE_COOKIE), clientAddress.of(request), request.getHeader(HttpHeaders.USER_AGENT), method);
        return ResponseEntity.status(status)
                .header(HttpHeaders.SET_COOKIE, cookie(session.refreshToken(), properties.refreshTtl()).toString())
                .header(HttpHeaders.SET_COOKIE, deviceCookie(device).toString())
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(session.response());
    }

    /** Long-lived and HttpOnly like the refresh cookie, and only sent to the auth endpoints. It identifies a browser, never a person. */
    private ResponseCookie deviceCookie(String value) {
        return ResponseCookie.from(DEVICE_COOKIE, value)
                .httpOnly(true).secure(properties.cookieSecure()).sameSite(properties.cookieSameSite()).path(COOKIE_PATH).maxAge(DeviceService.KEEP).build();
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

    private static String refreshCookie(HttpServletRequest request) { return cookieValue(request, REFRESH_COOKIE); }

    private static String cookieValue(HttpServletRequest request, String name) {
        if (request.getCookies() == null) return null;
        for (Cookie c : request.getCookies()) if (name.equals(c.getName())) return c.getValue();
        return null;
    }
}
