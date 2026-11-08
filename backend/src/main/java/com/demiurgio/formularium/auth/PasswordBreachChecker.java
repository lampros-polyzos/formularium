package com.demiurgio.formularium.auth;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.HexFormat;

/**
 * Refuses passwords that appear in known data breaches, using the free "Pwned Passwords" range service (haveibeenpwned.com), which needs no key.
 *
 * <p>The password never leaves the server and neither does its full hash: only the first 5 characters of its SHA-1 are sent (k-anonymity), and the
 * service answers with every hash suffix that starts that way, among decoy lines (the {@code Add-Padding} header). The comparison happens here.
 *
 * <p>If the service cannot be reached, the password is accepted: signing up must not depend on a third party being up, and the other protections still apply.
 */
@Component
class PasswordBreachChecker {
    private static final Logger log = LoggerFactory.getLogger(PasswordBreachChecker.class);

    private final boolean enabled;
    private final String rangeUrl;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build();

    @Autowired
    PasswordBreachChecker(AuthProperties properties) {
        this(properties.breachedPasswordCheck(), properties.breachedPasswordUrl());
    }

    PasswordBreachChecker(boolean enabled, String rangeUrl) {
        this.enabled = enabled;
        this.rangeUrl = rangeUrl;
    }

    /** True when the password is known from a breach. False when it is not, and also when that could not be found out. */
    boolean isBreached(String password) {
        if (!enabled) return false;
        String sha1 = sha1(password);
        String prefix = sha1.substring(0, 5);
        String suffix = sha1.substring(5);
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(rangeUrl + prefix)).timeout(Duration.ofSeconds(3))
                    .header("Add-Padding", "true").header("User-Agent", "Formularium").GET().build();
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) {
                log.warn("The breached-password service answered {}; the password was accepted unchecked", response.statusCode());
                return false;
            }
            return response.body().lines().anyMatch(line -> {
                int colon = line.indexOf(':');
                if (colon < 0 || !line.substring(0, colon).trim().equalsIgnoreCase(suffix)) return false;
                try {
                    return Long.parseLong(line.substring(colon + 1).trim()) > 0;   // padding lines have a count of 0
                } catch (NumberFormatException e) {
                    return false;
                }
            });
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return false;
        } catch (Exception e) {
            log.warn("The breached-password service could not be reached ({}); the password was accepted unchecked", e.toString());
            return false;
        }
    }

    private static String sha1(String password) {
        try {
            return HexFormat.of().withUpperCase().formatHex(MessageDigest.getInstance("SHA-1").digest(password.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
