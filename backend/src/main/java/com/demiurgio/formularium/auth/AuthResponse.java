package com.demiurgio.formularium.auth;

/** The access token goes in the body (the app keeps it in memory); the refresh token travels only in an HttpOnly cookie. */
public record AuthResponse(String accessToken, long expiresInSeconds, UserView user) { }
