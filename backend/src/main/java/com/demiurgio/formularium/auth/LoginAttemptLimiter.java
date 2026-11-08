package com.demiurgio.formularium.auth;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;

/**
 * Slows down password guessing and inbox flooding. The counters are the rows of the audit trail ({@link AuthEvents}) in the database, so they are
 * shared by every instance of the backend and survive a restart. Three layers, each within a 15 minute window:
 * <ul>
 *   <li>{@value #MAX_FAILURES} wrong passwords for one account from one address: the usual case, cleared by a right password;</li>
 *   <li>{@value #MAX_FAILURES_PER_EMAIL} for one account from anywhere: stops guessing from many addresses (a distributed attack);</li>
 *   <li>{@value #MAX_FAILURES_PER_IP} from one address against any accounts: stops one password being tried on many accounts.</li>
 * </ul>
 * The second layer lets an attacker lock a person out for the window; the bot check on the sign-in form is what makes that costly, and the
 * window is short. Separately, {@value #MAX_EMAILS_PER_IP} confirmation or reset emails per address per hour can be asked for.
 */
@Component
class LoginAttemptLimiter {
    static final int MAX_FAILURES = 5;
    static final int MAX_FAILURES_PER_EMAIL = 20;
    static final int MAX_FAILURES_PER_IP = 30;
    static final Duration WINDOW = Duration.ofMinutes(15);
    static final int MAX_EMAILS_PER_IP = 10;
    static final Duration EMAIL_WINDOW = Duration.ofHours(1);

    private final AuthEvents events;
    private final Clock clock;

    LoginAttemptLimiter(AuthEvents events, Clock clock) {
        this.events = events;
        this.clock = clock;
    }

    /** @throws ApiException 429 when this sign-in attempt must wait */
    void check(String emailHash, String ip) {
        Instant now = clock.instant();
        Instant from = now.minus(WINDOW);
        if (events.failuresForPair(emailHash, ip, from, now) >= MAX_FAILURES
                || events.count(AuthEvents.LOGIN_FAILED, "email_hash", emailHash, from, now) >= MAX_FAILURES_PER_EMAIL
                || events.count(AuthEvents.LOGIN_FAILED, "ip", ip, from, now) >= MAX_FAILURES_PER_IP) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "too_many_attempts", "Too many failed attempts. Try again in a few minutes.");
        }
    }

    /** @throws ApiException 429 when this address has asked for too many emails; the answer says nothing about any account */
    void checkEmailRequest(String ip) {
        Instant now = clock.instant();
        if (events.count(AuthEvents.EMAIL_REQUESTED, "ip", ip, now.minus(EMAIL_WINDOW), now) >= MAX_EMAILS_PER_IP) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "too_many_requests", "Too many emails were requested from your connection. Try again in an hour.");
        }
    }
}
