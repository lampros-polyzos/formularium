package com.demiurgio.formularium.config;

import com.demiurgio.formularium.auth.AuthProperties;
import com.nimbusds.jose.jwk.source.ImmutableSecret;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.authorization.AuthorizationDecision;
import org.springframework.security.authorization.AuthorizationManager;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.security.web.access.intercept.RequestAuthorizationContext;
import org.springframework.security.web.SecurityFilterChain;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Clock;

/**
 * Every /api/v1 endpoint needs a valid access token, except the ones that create a session.
 * Tokens are stateless JWTs signed with auth.jwt-secret; there is no server-side session and so no CSRF token to forge
 * (the only cookie is the HttpOnly, SameSite refresh cookie, sent to /api/v1/auth only).
 */
@Configuration
@EnableWebSecurity
@EnableConfigurationProperties(AuthProperties.class)
public class SecurityConfig {

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http, JwtDecoder decoder) throws Exception {
        http
                .cors(Customizer.withDefaults())
                .csrf(csrf -> csrf.disable())
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                // HTTPS is ended at the host's proxy, so the app itself sees plain HTTP and would never send this on its own. Browsers ignore it over plain HTTP.
                .headers(h -> h.httpStrictTransportSecurity(hsts -> hsts.requestMatcher(request -> true).maxAgeInSeconds(31536000).includeSubDomains(true)))
                .authorizeHttpRequests(a -> a
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/v1/public/**").permitAll()
                        // Free uptime monitors check with HEAD (they only read the status, and GET is a paid option); only the health check answers it
                        .requestMatchers(HttpMethod.HEAD, "/api/v1/public/health").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/v1/auth/register", "/api/v1/auth/login", "/api/v1/auth/login/mfa", "/api/v1/auth/login/passkey/options", "/api/v1/auth/login/passkey", "/api/v1/auth/google", "/api/v1/auth/guest", "/api/v1/auth/refresh", "/api/v1/auth/logout",
                                "/api/v1/auth/verify-email", "/api/v1/auth/resend-verification", "/api/v1/auth/forgot-password", "/api/v1/auth/reset-password").permitAll()
                        // A guest ("Try the demo") may look around and use the tools, but not publish where other people read, or secure an account it will not keep
                        .requestMatchers(HttpMethod.POST, "/api/v1/community/**").access(MEMBERS_ONLY)
                        .requestMatchers(HttpMethod.PUT, "/api/v1/community/**").access(MEMBERS_ONLY)
                        .requestMatchers(HttpMethod.PATCH, "/api/v1/community/**").access(MEMBERS_ONLY)
                        .requestMatchers(HttpMethod.DELETE, "/api/v1/community/**").access(MEMBERS_ONLY)
                        .requestMatchers(HttpMethod.POST, "/api/v1/auth/mfa/**").access(MEMBERS_ONLY)
                        .requestMatchers(HttpMethod.POST, "/api/v1/auth/passkeys/**").access(MEMBERS_ONLY)
                        .requestMatchers(HttpMethod.POST, "/api/v1/auth/password").access(MEMBERS_ONLY)
                        .anyRequest().authenticated())
                .oauth2ResourceServer(o -> o.jwt(j -> j.decoder(decoder)).accessDeniedHandler((request, response, denied) -> {
                    // The only 403 this API gives: a guest asking for something that needs a real account. Same error shape as everywhere else (see GlobalExceptionHandler).
                    response.setStatus(403);
                    response.setContentType("application/json");
                    response.setCharacterEncoding("UTF-8");
                    response.getWriter().write(GUEST_REFUSED);
                }));
        return http.build();
    }

    private static final String GUEST_REFUSED = "{\"error\":{\"code\":\"guest_account\",\"message\":\"This needs a free account. The demo cannot post to the community, change a password, set up two-step verification or add passkeys.\"}}";

    /** Anyone signed in who is not a guest. (Not signed in at all is still answered 401, as for every other protected path.) */
    private static final AuthorizationManager<RequestAuthorizationContext> MEMBERS_ONLY = (authentication, context) -> {
        var who = authentication.get();
        boolean guest = who instanceof JwtAuthenticationToken jwt && Boolean.TRUE.equals(jwt.getToken().getClaim("guest"));
        return new AuthorizationDecision(who != null && who.isAuthenticated() && !(who instanceof AnonymousAuthenticationToken) && !guest);
    };

    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder(12);
    }

    @Bean
    Clock clock() {
        return Clock.systemUTC();
    }

    private static SecretKey key(AuthProperties properties) {
        return new SecretKeySpec(properties.jwtSecret().getBytes(StandardCharsets.UTF_8), "HmacSHA256");
    }

    @Bean
    JwtEncoder jwtEncoder(AuthProperties properties) {
        return new NimbusJwtEncoder(new ImmutableSecret<>(key(properties)));
    }

    @Bean
    JwtDecoder jwtDecoder(AuthProperties properties) {
        return NimbusJwtDecoder.withSecretKey(key(properties)).macAlgorithm(MacAlgorithm.HS256).build();
    }
}
