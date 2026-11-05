package com.demiurgio.formularium.auth;

import java.util.UUID;

/** A row of app_users. The password hash is empty for accounts that only use Google. */
public record UserAccount(UUID id, String email, String passwordHash, String googleSub, String username) {
    public UserView view() { return new UserView(id, email, username); }
}
