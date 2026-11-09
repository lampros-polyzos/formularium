package com.demiurgio.formularium.auth;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

/**
 * "Try the demo": a temporary account for a visitor who has not signed up. Each press makes a NEW private account (with the starting formulas every
 * account gets), so visitors never see or spoil each other's data, and there is no shared password to leak. It is deleted after a day.
 *
 * Open to anyone, so it is limited: the bot check on the endpoint, a number per address per hour, and a ceiling on how many guests exist at once.
 * What a guest may not do (post to the community, set up two-step verification) is enforced in {@code SecurityConfig}.
 */
@Service
class GuestService {
    private static final Duration PER_ADDRESS_WINDOW = Duration.ofHours(1);

    private final UserRepository users;
    private final AccountCreator accounts;
    private final AuthEvents events;
    private final Clock clock;
    private final boolean enabled;
    private final Duration lifetime;
    private final int maxActive;
    private final int perAddressPerHour;

    GuestService(UserRepository users, AccountCreator accounts, AuthEvents events, Clock clock,
                 @Value("${auth.guest.enabled:true}") boolean enabled,
                 @Value("${auth.guest.ttl-hours:24}") int ttlHours,
                 @Value("${auth.guest.max-active:200}") int maxActive,
                 @Value("${auth.guest.per-ip-per-hour:10}") int perAddressPerHour) {
        this.users = users;
        this.accounts = accounts;
        this.events = events;
        this.clock = clock;
        this.enabled = enabled;
        this.lifetime = Duration.ofHours(Math.max(1, ttlHours));
        this.maxActive = maxActive;
        this.perAddressPerHour = perAddressPerHour;
    }

    /** @throws ApiException when the demo is switched off, this connection has made enough of them, or too many guests exist right now */
    UserAccount create(String ip, String userAgent) {
        if (!enabled) throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "demo_unavailable", "The demo is not available right now. You can create a free account instead.");
        Instant now = clock.instant();
        if (events.count(AuthEvents.GUEST_CREATED, "ip", ip, now.minus(PER_ADDRESS_WINDOW), now) >= perAddressPerHour) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "too_many_requests", "Too many demo sessions were started from your connection. Try again in an hour, or create a free account.");
        }
        if (users.countActiveGuests(now) >= maxActive) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "demo_busy", "The demo is busy right now. Try again in a few minutes, or create a free account.");
        }
        for (int attempt = 0; attempt < 5; attempt++) {
            String id = UUID.randomUUID().toString().replace("-", "");
            try {
                // ".invalid" can never receive mail (RFC 2606), so a password reset or confirmation sent to it goes nowhere
                UserAccount guest = accounts.createGuest("guest-" + id + "@guest.invalid", "guest-" + id.substring(0, 8), now, now.plus(lifetime));
                events.record(AuthEvents.GUEST_CREATED, null, ip, guest.id(), userAgent, now);
                return guest;
            } catch (DuplicateKeyException e) {
                // a random name collided (practically never): try another
            }
        }
        throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "demo_busy", "The demo could not be started. Please try again.");
    }

    /** @return how many expired guests were deleted, with everything that belonged to them */
    int purgeExpired() { return users.deleteExpiredGuests(clock.instant()); }
}
