package com.demiurgio.formularium.auth;

import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Once a day, removes refresh tokens that have expired so the table does not grow without end; every hour, the "Try the demo" accounts whose day is over. */
@Component
@EnableScheduling
class ExpiredTokenCleanup {
    private final AuthService auth;

    ExpiredTokenCleanup(AuthService auth) { this.auth = auth; }

    @Scheduled(cron = "0 17 3 * * *")
    void run() { auth.purgeExpiredTokens(); }

    @Scheduled(cron = "0 41 * * * *")
    void purgeGuests() { auth.purgeExpiredGuests(); }
}
