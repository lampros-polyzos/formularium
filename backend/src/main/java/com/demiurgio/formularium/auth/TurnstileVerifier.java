package com.demiurgio.formularium.auth;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;

import java.util.Map;

/** Cloudflare Turnstile. With no secret configured (development) every request passes. */
@Component
class TurnstileVerifier implements CaptchaVerifier {
    private static final Logger log = LoggerFactory.getLogger(TurnstileVerifier.class);
    private static final String VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

    private final String secret;
    private final RestClient http = RestClient.create();

    TurnstileVerifier(AuthProperties properties) { this.secret = properties.turnstileSecret(); }

    @Override
    public boolean verify(String token, String clientIp) {
        if (secret == null || secret.isBlank()) return true;
        if (token == null || token.isBlank()) return false;
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("secret", secret);
        form.add("response", token);
        if (clientIp != null) form.add("remoteip", clientIp);
        try {
            Map<?, ?> result = http.post().uri(VERIFY_URL).contentType(MediaType.APPLICATION_FORM_URLENCODED).body(form).retrieve().body(Map.class);
            return result != null && Boolean.TRUE.equals(result.get("success"));
        } catch (RuntimeException e) {
            log.warn("Turnstile could not be reached: {}", e.getMessage());
            return false;   // when the check cannot be made, do not let the request through
        }
    }
}
