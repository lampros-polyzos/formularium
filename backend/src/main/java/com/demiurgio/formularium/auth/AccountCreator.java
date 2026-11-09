package com.demiurgio.formularium.auth;

import com.demiurgio.formularium.starter.StarterFormulaService;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/**
 * Creates an account together with everything a new account starts with, in one transaction: if the starter formulas cannot be written,
 * the account is not created either, and the person can simply try again.
 */
@Service
class AccountCreator {
    private final UserRepository users;
    private final StarterFormulaService starterFormulas;
    private final ApplicationEventPublisher events;

    AccountCreator(UserRepository users, StarterFormulaService starterFormulas, ApplicationEventPublisher events) {
        this.users = users;
        this.starterFormulas = starterFormulas;
        this.events = events;
    }

    /** Changes the display name together with everything that shows it (posts, comments, ratings), or nothing. */
    @Transactional
    void rename(UUID id, String username) {
        users.updateUsername(id, username);
        events.publishEvent(new UsernameChanged(id, username));
    }

    /** A temporary account for "Try the demo": no password, a starting set of formulas like any account, deleted at {@code expiresAt}. */
    @Transactional
    UserAccount createGuest(String email, String username, java.time.Instant verifiedAt, java.time.Instant expiresAt) {
        UserAccount account = users.insert(email, null, null, username, verifiedAt, expiresAt);
        starterFormulas.createFor(account.id());
        return account;
    }

    /** @throws org.springframework.dao.DuplicateKeyException when the email, username or Google id is already used (nothing is kept) */
    @Transactional
    UserAccount create(String email, String passwordHash, String googleSub, String username, java.time.Instant verifiedAt) {
        UserAccount account = users.insert(email, passwordHash, googleSub, username, verifiedAt);
        starterFormulas.createFor(account.id());
        return account;
    }
}
