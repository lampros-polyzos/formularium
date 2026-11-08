package com.demiurgio.formularium.config;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * "Is the process up?" for the hosting platform's health check. Deliberately does not touch the database: a database that is paused, slow or
 * restarting must not make the platform kill and restart a backend that is itself fine.
 */
@RestController
class HealthController {

    @GetMapping("/api/v1/public/health")
    Map<String, String> health() {
        return Map.of("status", "ok");
    }
}
