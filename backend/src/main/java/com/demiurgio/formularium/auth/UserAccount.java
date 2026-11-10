package com.demiurgio.formularium.auth;

import java.time.Instant;
import java.util.UUID;

/**
 * A row of app_users. The password hash is empty for accounts that only use Google, and for guests.
 * A guest (the "Try the demo" account) has an expiry date and is deleted after it.
 * An account that has switched password sign-in off has the date it did so: the password is kept, but does not open the account.
 * {@code admin} is only a hint for the screens (to show the link to the admin page): what an administrator may do is decided by the database on every request.
 */
public record UserAccount(UUID id, String email, String passwordHash, String googleSub, String username, boolean emailVerified, Instant guestExpiresAt,
                          Instant passwordLoginDisabledAt, boolean admin) {
    public boolean passwordLoginDisabled() { return passwordLoginDisabledAt != null; }

    public boolean guest() { return guestExpiresAt != null; }

    /** A guest whose time is up: not to be given a new session, even if the cleanup has not removed it yet. */
    public boolean guestExpired(Instant now) { return guestExpiresAt != null && !guestExpiresAt.isAfter(now); }

    public UserView view() { return new UserView(id, email, username, guest(), passwordHash != null, admin); }
}
