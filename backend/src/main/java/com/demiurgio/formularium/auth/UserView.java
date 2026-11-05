package com.demiurgio.formularium.auth;

import java.util.UUID;

/** What the client may know about a user. Never contains the password hash. */
public record UserView(UUID id, String email, String username) { }
