package com.demiurgio.formularium.auth;

import java.util.UUID;

/**
 * What the client may know about a user. Never contains the password hash, only whether there is one (a Google-only account has none, so has nothing to
 * change). `guest` is true for the temporary "Try the demo" account. `admin` only decides whether the page shows the link to the admin area; the backend checks
 * the database again on every admin request.
 */
public record UserView(UUID id, String email, String username, boolean guest, boolean hasPassword, boolean admin) { }
