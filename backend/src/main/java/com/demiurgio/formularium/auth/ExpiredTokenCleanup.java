package com.demiurgio.formularium.auth;

import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Once a day, removes refresh tokens that have expired so the table does not grow without end. */
@Component
@EnableScheduling
class ExpiredTokenCleanup {
    private final AuthService auth;

    ExpiredTokenCleanup(AuthService auth) { this.auth = auth; }

    @Scheduled(cron = "0 17 3 * * *")
    void run() { auth.purgeExpiredTokens(); }
}
