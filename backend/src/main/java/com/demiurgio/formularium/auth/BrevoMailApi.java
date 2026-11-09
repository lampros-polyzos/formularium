package com.demiurgio.formularium.auth;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Sends email through Brevo's HTTPS API instead of SMTP. Hosts such as Render's free plan block the SMTP ports (25, 465, 587) but allow HTTPS, so this is
 * the way out on them. Switched on by BREVO_API_KEY; without it the sender falls back to SMTP, or to the log.
 */
@Component
class BrevoMailApi {
    private static final Pattern FROM = Pattern.compile("^\\s*(.*?)\\s*<([^<>]+)>\\s*$");

    private final String apiKey;
    private final String url;
    private final RestClient http;

    BrevoMailApi(@Value("${mail.brevo-api-key:}") String apiKey, @Value("${mail.brevo-api-url:https://api.brevo.com/v3/smtp/email}") String url) {
        this.apiKey = apiKey == null ? "" : apiKey.trim();
        this.url = url;
        // Short limits: a slow mail service must not hold a sign-up request open
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(5));
        factory.setReadTimeout(Duration.ofSeconds(10));
        this.http = RestClient.builder().requestFactory(factory).build();
    }

    boolean enabled() { return !apiKey.isEmpty(); }

    /** Throws when Brevo refuses or cannot be reached; the caller logs it. */
    void send(String from, String to, String subject, String body) {
        Matcher m = FROM.matcher(from);
        Map<String, String> sender = m.matches() && !m.group(1).isBlank()
                ? Map.of("name", m.group(1).replaceAll("^\"|\"$", ""), "email", m.group(2).trim())
                : Map.of("email", m.matches() ? m.group(2).trim() : from.trim());
        http.post().uri(url)
                .header("api-key", apiKey)
                .contentType(MediaType.APPLICATION_JSON)
                .accept(MediaType.APPLICATION_JSON)
                .body(Map.of("sender", sender, "to", List.of(Map.of("email", to)), "subject", subject, "textContent", body))
                .retrieve()
                .toBodilessEntity();
    }
}
