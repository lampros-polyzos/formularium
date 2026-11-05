package com.demiurgio.formularium.auth;

import org.springframework.http.HttpStatus;

/** An error the client should see: a status, a stable code to branch on, and a message safe to show. */
public class ApiException extends RuntimeException {
    private final HttpStatus status;
    private final String code;

    public ApiException(HttpStatus status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    public HttpStatus status() { return status; }
    public String code() { return code; }
}
