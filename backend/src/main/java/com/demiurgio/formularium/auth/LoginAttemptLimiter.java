package com.demiurgio.formularium.auth;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

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
    static final int MAX_MFA_FAILURES_PER_USER = 10;
    static final int MAX_MFA_FAILURES_PER_IP = 30;
    static final int MAX_PASSWORD_CHANGE_FAILURES_PER_USER = 10;
    static final int MAX_PASSWORD_CHANGE_FAILURES_PER_IP = 30;
    static final int MAX_PASSKEY_FAILURES_PER_USER = 10;
    static final int MAX_PASSKEY_FAILURES_PER_IP = 30;
    static final int MAX_PASSKEY_STARTS_PER_IP = 60;
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

    /** For second-step codes: 10 wrong ones per account in the window (from anywhere), and 30 per address. A six-digit code is guessable without this. */
    void checkMfa(UUID userId, String ip) {
        Instant now = clock.instant();
        Instant from = now.minus(WINDOW);
        if (events.countForUser(AuthEvents.MFA_FAILED, userId, from, now) >= MAX_MFA_FAILURES_PER_USER
                || events.count(AuthEvents.MFA_FAILED, "ip", ip, from, now) >= MAX_MFA_FAILURES_PER_IP) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "too_many_attempts", "Too many wrong codes. Try again in a few minutes.");
        }
    }

    /**
     * Changing the password asks for the current one, so the form is a way to test guesses for anyone holding a stolen access token:
     * 10 wrong ones per account in the window (from anywhere), and 30 per address.
     */
    void checkPasswordChange(UUID userId, String ip) {
        Instant now = clock.instant();
        Instant from = now.minus(WINDOW);
        if (events.countForUser(AuthEvents.PASSWORD_CHANGE_FAILED, userId, from, now) >= MAX_PASSWORD_CHANGE_FAILURES_PER_USER
                || events.count(AuthEvents.PASSWORD_CHANGE_FAILED, "ip", ip, from, now) >= MAX_PASSWORD_CHANGE_FAILURES_PER_IP) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "too_many_attempts", "Too many wrong passwords. Try again in a few minutes.");
        }
    }

    /** Adding or removing a passkey asks for the password: 10 wrong ones per account in the window (from anywhere), and 30 per address. */
    void checkPasskeyManagement(UUID userId, String ip) {
        Instant now = clock.instant();
        Instant from = now.minus(WINDOW);
        if (events.countForUser(AuthEvents.PASSKEY_FAILED, userId, from, now) >= MAX_PASSKEY_FAILURES_PER_USER
                || events.count(AuthEvents.PASSKEY_FAILED, "ip", ip, from, now) >= MAX_PASSKEY_FAILURES_PER_IP) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "too_many_attempts", "Too many wrong passwords. Try again in a few minutes.");
        }
    }

    /** Signing in with a passkey: 30 failures per address in the window. (There is no account to count against: the passkey has not said who it is.) */
    void checkPasskeyLogin(String ip) {
        Instant now = clock.instant();
        if (events.count(AuthEvents.PASSKEY_FAILED, "ip", ip, now.minus(WINDOW), now) >= MAX_PASSKEY_FAILURES_PER_IP) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "too_many_attempts", "Too many failed passkey attempts. Try again in a few minutes.");
        }
    }

    /** Asking for a passkey challenge writes a row, so it is limited per address: a person needs one or two, so 60 in the window is generous. */
    void checkPasskeyStart(String ip) {
        Instant now = clock.instant();
        if (events.count(AuthEvents.PASSKEY_LOGIN_STARTED, "ip", ip, now.minus(WINDOW), now) >= MAX_PASSKEY_STARTS_PER_IP) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "too_many_attempts", "Too many sign-in attempts. Try again in a few minutes.");
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
