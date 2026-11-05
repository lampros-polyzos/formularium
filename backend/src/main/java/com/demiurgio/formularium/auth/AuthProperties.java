package com.demiurgio.formularium.auth;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.nio.charset.StandardCharsets;
import java.time.Duration;

/**
 * Sign-in settings, from application.properties or environment variables (AUTH_JWT_SECRET and so on).
 *
 * @param jwtSecret      signs the access tokens; at least 32 characters, and secret. The app refuses to start without it.
 * @param accessTtl      how long an access token is valid (short: it cannot be taken back)
 * @param refreshTtl     how long a refresh token is valid; using it gives a new one, so active users stay signed in
 * @param googleClientId the OAuth client id of the site's "Sign in with Google" button; leave empty to turn Google sign-in off
 * @param turnstileSecret Cloudflare Turnstile secret key; leave empty to skip the bot check (development)
 * @param cookieSecure   send the refresh cookie over HTTPS only. Must be true in production.
 * @param cookieSameSite Lax when the site and API share a registrable domain, None when they do not (needs cookieSecure)
 */
@ConfigurationProperties("auth")
public record AuthProperties(String jwtSecret, Duration accessTtl, Duration refreshTtl, String issuer, String googleClientId,
                             String turnstileSecret, boolean cookieSecure, String cookieSameSite) {

    public AuthProperties {
        if (jwtSecret == null || jwtSecret.getBytes(StandardCharsets.UTF_8).length < 32) {
            throw new IllegalStateException("auth.jwt-secret (AUTH_JWT_SECRET) must be set to a secret of at least 32 characters.");
        }
        if (accessTtl == null) accessTtl = Duration.ofMinutes(15);
        if (refreshTtl == null) refreshTtl = Duration.ofDays(30);
        if (issuer == null || issuer.isBlank()) issuer = "formularium";
        if (cookieSameSite == null || cookieSameSite.isBlank()) cookieSameSite = "Lax";
    }
}
