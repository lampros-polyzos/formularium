package com.demiurgio.formularium.config;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * TEMPORARY. Shows the caller what the server sees for their own request, to find out which address the sign-in throttle really counts behind
 * Render's proxy. Stores and logs nothing. Delete this file once the check is done (see docs/deploy.md).
 */
@RestController
class ClientAddressProbe {

    @GetMapping("/api/v1/public/debug/client-address")
    Map<String, String> probe(HttpServletRequest request) {
        Map<String, String> seen = new LinkedHashMap<>();
        seen.put("remote_addr_used_by_the_throttle", request.getRemoteAddr());
        seen.put("true_client_ip", request.getHeader("True-Client-IP"));
        seen.put("cf_connecting_ip", request.getHeader("CF-Connecting-IP"));
        seen.put("x_real_ip", request.getHeader("X-Real-IP"));
        return seen;
    }
}
