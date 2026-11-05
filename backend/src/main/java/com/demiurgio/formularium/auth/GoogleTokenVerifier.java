package com.demiurgio.formularium.auth;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Checks the ID token the "Sign in with Google" button gives the browser: Google's signature (from Google's published keys),
 * that it was issued for this site's client id, that it has not expired, and the issuer.
 */
@Component
class GoogleTokenVerifier {
    record Identity(String sub, String email, boolean emailVerified, String name) { }

    private static final List<String> ISSUERS = List.of("https://accounts.google.com", "accounts.google.com");

    private final JwtDecoder decoder;

    @Autowired
    GoogleTokenVerifier(AuthProperties properties) {
        String clientId = properties.googleClientId();
        if (clientId == null || clientId.isBlank()) {
            this.decoder = null;
            return;
        }
        NimbusJwtDecoder nimbus = NimbusJwtDecoder.withJwkSetUri("https://www.googleapis.com/oauth2/v3/certs").build();
        OAuth2TokenValidator<Jwt> audience = jwt -> jwt.getAudience() != null && jwt.getAudience().contains(clientId)
                ? OAuth2TokenValidatorResult.success()
                : OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token", "The token was not issued for this site.", null));
        OAuth2TokenValidator<Jwt> issuer = jwt -> ISSUERS.contains(jwt.getIssuer() == null ? "" : jwt.getIssuer().toString())
                ? OAuth2TokenValidatorResult.success()
                : OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token", "The token was not issued by Google.", null));
        nimbus.setJwtValidator(new DelegatingOAuth2TokenValidator<>(JwtValidators.createDefault(), audience, issuer));
        this.decoder = nimbus;
    }

    /** For tests: a decoder that does not call Google. */
    GoogleTokenVerifier(JwtDecoder decoder) { this.decoder = decoder; }

    Identity verify(String idToken) {
        if (decoder == null) throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "google_not_configured", "Google sign-in is not available.");
        try {
            Jwt jwt = decoder.decode(idToken);
            return new Identity(jwt.getSubject(), jwt.getClaimAsString("email"), Boolean.TRUE.equals(jwt.getClaim("email_verified")), jwt.getClaimAsString("name"));
        } catch (JwtException e) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "invalid_google_token", "Google sign-in could not be verified.");
        }
    }
}
