package com.demiurgio.formularium.config;

import com.demiurgio.formularium.auth.ClientAddress;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * TEMPORARY. Shows the caller what the server sees for their own request, to confirm which address the sign-in limits count behind Render's proxy.
 * Stores and logs nothing. Delete this file once the check is done.
 */
@RestController
class ClientAddressProbe {
    private final ClientAddress clientAddress;

    ClientAddressProbe(ClientAddress clientAddress) { this.clientAddress = clientAddress; }

    @GetMapping("/api/v1/public/debug/client-address")
    Map<String, String> probe(HttpServletRequest request) {
        Map<String, String> seen = new LinkedHashMap<>();
        seen.put("address_the_limits_count", clientAddress.of(request));
        seen.put("connection_address", request.getRemoteAddr());
        seen.put("cf_connecting_ip", request.getHeader("CF-Connecting-IP"));
        seen.put("true_client_ip", request.getHeader("True-Client-IP"));
        seen.put("x_forwarded_for", request.getHeader("X-Forwarded-For"));
        return seen;
    }
}
