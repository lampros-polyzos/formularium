package com.demiurgio.formularium.auth;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.regex.Pattern;

/**
 * The address of the person making a request, which the sign-in limits and the audit trail count.
 *
 * Behind a proxy (Render, in production) the connection comes from the proxy, so the real address has to be read from a header. Which header is
 * the host's business and is set with CLIENT_IP_HEADER (Render: CF-Connecting-IP, which its edge sets and a visitor cannot forge). It is NEVER
 * X-Forwarded-For: a visitor can write that header, and the first entry of it is the one that was written, so trusting it would let anyone pick a
 * new address on every request and walk around every per-address limit.
 *
 * Without CLIENT_IP_HEADER (development, tests) the connection's own address is used and every forwarding header is ignored: safe by default.
 */
@Component
public class ClientAddress {
    /** An address, not a list and not text: whatever else arrives is ignored rather than stored. */
    private static final Pattern ADDRESS = Pattern.compile("^[0-9a-fA-F:.]{2,45}$");

    private final String header;

    ClientAddress(@Value("${auth.client-ip-header:}") String header) {
        this.header = header == null ? "" : header.trim();
    }

    public String of(HttpServletRequest request) {
        if (!header.isEmpty()) {
            String value = request.getHeader(header);
            if (value != null) {
                value = value.trim();
                if (ADDRESS.matcher(value).matches() && (value.contains(".") || value.contains(":"))) return value;
            }
        }
        return request.getRemoteAddr();
    }
}
