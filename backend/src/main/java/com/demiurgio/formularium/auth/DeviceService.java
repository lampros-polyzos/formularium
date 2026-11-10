package com.demiurgio.formularium.auth;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.Base64;
import java.util.Locale;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * "Someone signed in from a browser we have not seen": tells the account's owner by email, so a stolen password or passkey does not go unnoticed.
 *
 * <p>A browser is recognised by a random identifier it keeps in a cookie after a sign-in (only its hash is stored, per account). There is no fingerprinting:
 * it would be unreliable, and it is not something to do to people. The consequences are honest ones: a browser whose cookies were cleared, or a private window,
 * counts as new, and an attacker who somehow copied the cookie as well would not be reported.
 *
 * <p>The rules that keep it useful and safe:
 * <ul>
 *   <li>The FIRST browser an account is ever seen on is learnt silently: there is nothing to compare with. This also means accounts that existed before this
 *       feature do not get an alert at their next sign-in.</li>
 *   <li>At most {@value #MAX_ALERTS_PER_DAY} emails per account per day, so it cannot be used to flood a mailbox; every new browser is still recorded.</li>
 *   <li>It can never make a sign-in fail: a problem here is logged, and the person is signed in as usual.</li>
 * </ul>
 */
@Service
class DeviceService {
    private static final Logger log = LoggerFactory.getLogger(DeviceService.class);

    static final int MAX_ALERTS_PER_DAY = 5;
    /** The longest a browser keeps a cookie, so a browser not seen for this long has certainly lost it. */
    static final Duration KEEP = Duration.ofDays(400);
    private static final Pattern TOKEN = Pattern.compile("^[A-Za-z0-9_-]{43}$");
    private static final DateTimeFormatter WHEN = DateTimeFormatter.ofPattern("d MMM yyyy, HH:mm 'UTC'", Locale.ENGLISH).withZone(ZoneOffset.UTC);

    private final DeviceRepository repository;
    private final UserRepository users;
    private final AuthEvents events;
    private final EmailSender mail;
    private final AuthProperties properties;
    private final Clock clock;
    private final SecureRandom random = new SecureRandom();

    DeviceService(DeviceRepository repository, UserRepository users, AuthEvents events, EmailSender mail, AuthProperties properties, Clock clock) {
        this.repository = repository;
        this.users = users;
        this.events = events;
        this.mail = mail;
        this.properties = properties;
        this.clock = clock;
    }

    /**
     * Called after a successful sign-in (not a renewal, not a failure, not the demo). Notes the browser, and reports it if it is new.
     *
     * @param cookie the identifier the browser sent, if any
     * @param method how the person signed in, in words for the email ("your password", "a passkey")
     * @return the identifier the browser should keep: the one it sent if that was valid, or a new one
     */
    String recognise(UUID userId, String cookie, String ip, String userAgent, String method) {
        String token = cookie != null && TOKEN.matcher(cookie).matches() ? cookie : newToken();
        try {
            Instant now = clock.instant();
            String hash = TokenService.hash(token);
            boolean hadBaseline = repository.count(userId) > 0;
            if (repository.touch(userId, hash, now, userAgent)) return token;   // a browser this account knows
            if (repository.insert(userId, hash, userAgent, now) && hadBaseline) alert(userId, ip, userAgent, method, now);
        } catch (RuntimeException e) {
            log.warn("Could not note the browser of a sign-in: {}", e.getMessage());   // never at the cost of the sign-in
        }
        return token;
    }

    /** Removes browsers that have not been seen for as long as a browser keeps the cookie. */
    int purgeUnseen() { return repository.deleteUnseenSince(clock.instant().minus(KEEP)); }

    private void alert(UUID userId, String ip, String userAgent, String method, Instant now) {
        long today = events.countForUser(AuthEvents.NEW_DEVICE_SIGN_IN, userId, now.minus(Duration.ofDays(1)), now);
        events.record(AuthEvents.NEW_DEVICE_SIGN_IN, null, ip, userId, userAgent, now);   // recorded every time, even when the email is held back
        if (today >= MAX_ALERTS_PER_DAY) return;
        UserAccount user = users.findById(userId).orElse(null);
        if (user == null || user.guest()) return;
        mail.send(user.email(), "New sign-in to your Formularium account",
                "Hello " + user.username() + ",\n\nYour Formularium account was just signed in to from a browser we have not seen before."
                        + "\n\nWhen: " + WHEN.format(now)
                        + "\nBrowser: " + UserAgents.describe(userAgent)
                        + "\nNetwork address: " + (ip == null || ip.isBlank() ? "unknown" : ip)
                        + "\nSigned in with: " + method
                        + "\n\nIf this was you, there is nothing to do: the browser is remembered now, so you will not be told about it again."
                        + "\n\nIf it was not you, someone else may have access to your account. Secure it right away: sign in, open Settings and change your password (that signs your other devices out),"
                        + " or choose \"Forgot your password?\" on the sign-in form: " + properties.appUrl());
    }

    private String newToken() {
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}
