package com.demiurgio.formularium.auth;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Duration;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Locale;
import java.util.UUID;

/** Sign-up, sign-in (password or Google), refresh-token rotation, sign-out and account deletion. */
@Service
public class AuthService {
    /** What a correct password (or Google sign-in) leads to: a session, or, for an account with two-step verification, a challenge to answer first. */
    public sealed interface LoginResult permits Session, MfaChallenge { }

    /** The response body for the client and the refresh token for the cookie. */
    public record Session(AuthResponse response, String refreshToken) implements LoginResult { }

    /** The password was right, but a code from the authenticator app is still needed. No session exists yet. */
    public record MfaChallenge(String token) implements LoginResult { }

    /** A refresh token that was used a moment ago is most likely a second tab racing the first, not theft. */
    private static final Duration REUSE_GRACE = Duration.ofSeconds(10);

    private final UserRepository users;
    private final AccountCreator accounts;
    private final RefreshTokenRepository refreshTokens;
    private final TokenService tokens;
    private final PasswordEncoder passwords;
    private final LoginAttemptLimiter limiter;
    private final AuthEvents events;
    private final MfaService mfa;
    private final GuestService guests;
    private final PasswordBreachChecker breach;
    private final CaptchaVerifier captcha;
    private final GoogleTokenVerifier google;
    private final AuthProperties properties;
    private final EmailTokenRepository emailTokens;
    private final EmailSender mail;
    private final Clock clock;
    /** Checked against when the email is unknown, so a wrong email and a wrong password take equally long. */
    private final String decoyHash;

    AuthService(UserRepository users, AccountCreator accounts, RefreshTokenRepository refreshTokens, TokenService tokens, PasswordEncoder passwords, LoginAttemptLimiter limiter,
                AuthEvents events, MfaService mfa, GuestService guests, PasswordBreachChecker breach, CaptchaVerifier captcha, GoogleTokenVerifier google, AuthProperties properties, EmailTokenRepository emailTokens, EmailSender mail, Clock clock) {
        this.users = users;
        this.accounts = accounts;
        this.refreshTokens = refreshTokens;
        this.tokens = tokens;
        this.passwords = passwords;
        this.limiter = limiter;
        this.events = events;
        this.mfa = mfa;
        this.guests = guests;
        this.breach = breach;
        this.captcha = captcha;
        this.google = google;
        this.properties = properties;
        this.emailTokens = emailTokens;
        this.mail = mail;
        this.clock = clock;
        this.decoyHash = passwords.encode(UUID.randomUUID().toString());
    }

    static String normalizeEmail(String email) { return email.trim().toLowerCase(Locale.ROOT); }

    /** bcrypt reads only the first 72 BYTES (not characters), so a longer password is refused rather than silently cut. */
    private static final int MAX_PASSWORD_BYTES = 72;

    private static boolean fitsBcrypt(String password) { return password.getBytes(StandardCharsets.UTF_8).length <= MAX_PASSWORD_BYTES; }

    /** For a password someone is about to SET (sign-up, reset): short enough for bcrypt, and not one that is known from a data breach. */
    private void requireUsablePassword(String password) {
        if (!fitsBcrypt(password)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "password_too_long", "That password is too long: the limit is 72 bytes (72 letters; fewer if it has accents or emoji).");
        }
        if (breach.isBreached(password)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "password_breached", "That password has appeared in a known data breach, so it is not safe to use. Please choose a different one.");
        }
    }

    private void record(String type, String email, String ip, UUID userId, String userAgent) {
        events.record(type, email == null ? null : TokenService.hash(normalizeEmail(email)), ip, userId, userAgent, clock.instant());
    }

    /** The confirmation link is valid for a day, the reset link for an hour; a new one is not sent more than once a minute. */
    static final Duration VERIFY_TTL = Duration.ofDays(1);
    static final Duration RESET_TTL = Duration.ofHours(1);
    static final Duration RESEND_GAP = Duration.ofMinutes(1);

    /** @return the new session, or null when the email must be confirmed first (a link was sent) */
    public Session register(AuthRequests.Register request, String ip, String userAgent) {
        requireCaptcha(request.captchaToken(), ip);
        requireUsablePassword(request.password());
        if (properties.requireVerifiedEmail()) limiter.checkEmailRequest(ip);
        String email = normalizeEmail(request.email());
        String username = request.username().trim();
        if (users.findByEmail(email).isPresent() || users.usernameTaken(username)) throw accountExists();
        try {
            UserAccount user = accounts.create(email, passwords.encode(request.password()), null, username, properties.requireVerifiedEmail() ? null : clock.instant());
            record(AuthEvents.REGISTER, email, ip, user.id(), userAgent);
            if (!properties.requireVerifiedEmail()) return startSession(user, userAgent);
            record(AuthEvents.EMAIL_REQUESTED, null, ip, user.id(), userAgent);
            sendVerification(user);
            return null;
        } catch (DuplicateKeyException e) {
            throw accountExists();   // lost a race with another sign-up
        }
    }

    /** "Try the demo": a new temporary account, signed in at once. No email, no password, but the same bot check as sign-up. */
    public Session startGuest(AuthRequests.Guest request, String ip, String userAgent) {
        requireCaptcha(request.captchaToken(), ip);
        return startSession(guests.create(ip, userAgent), userAgent);
    }

    public LoginResult login(AuthRequests.Login request, String ip, String userAgent) {
        String email = normalizeEmail(request.email());
        String emailHash = TokenService.hash(email);
        limiter.check(emailHash, ip);
        requireCaptcha(request.captchaToken(), ip);
        UserAccount user = users.findByEmail(email).orElse(null);
        String hash = user != null && user.passwordHash() != null ? user.passwordHash() : decoyHash;
        boolean tooLong = !fitsBcrypt(request.password());   // cannot be anyone's password; still spend the same time hashing
        boolean matches = passwords.matches(tooLong ? "" : request.password(), hash) && !tooLong;
        if (user == null || user.passwordHash() == null || !matches) {
            events.record(AuthEvents.LOGIN_FAILED, emailHash, ip, user == null ? null : user.id(), userAgent, clock.instant());
            throw new ApiException(HttpStatus.UNAUTHORIZED, "invalid_credentials", "The email or password is not right.");
        }
        events.record(AuthEvents.LOGIN_SUCCESS, emailHash, ip, user.id(), userAgent, clock.instant());
        if (properties.requireVerifiedEmail() && !user.emailVerified()) {
            // Said only after the password was right, so this does not tell strangers which emails have accounts
            throw new ApiException(HttpStatus.FORBIDDEN, "email_not_verified", "Please confirm your email address first. We sent you a link.");
        }
        if (mfa.isEnabled(user.id())) return new MfaChallenge(mfa.startChallenge(user.id()));   // the session waits for the code
        users.touchLogin(user.id(), clock.instant());
        return startSession(user, userAgent);
    }

    public LoginResult loginWithGoogle(String idToken, String ip, String userAgent) {
        GoogleTokenVerifier.Identity who = google.verify(idToken);
        if (who.email() == null || !who.emailVerified()) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "email_not_verified", "Your Google account has no verified email address.");
        }
        String email = normalizeEmail(who.email());
        UserAccount user = users.findByGoogleSub(who.sub()).orElse(null);
        if (user == null) {
            UserAccount byEmail = users.findByEmail(email).orElse(null);
            if (byEmail != null) {
                // Same verified email: it is the same person, so the accounts are joined
                users.linkGoogle(byEmail.id(), who.sub());
                users.markEmailVerified(byEmail.id(), clock.instant());   // Google vouched for the address
                user = new UserAccount(byEmail.id(), byEmail.email(), byEmail.passwordHash(), who.sub(), byEmail.username(), true, byEmail.guestExpiresAt());
            } else {
                user = createGoogleUser(email, who);
            }
        }
        record(AuthEvents.GOOGLE_LOGIN, null, ip, user.id(), userAgent);
        if (mfa.isEnabled(user.id())) return new MfaChallenge(mfa.startChallenge(user.id()));   // two-step verification covers every way of signing in
        users.touchLogin(user.id(), clock.instant());
        return startSession(user, userAgent);
    }

    /** The second step: a right code (or recovery code) exchanges the one-time token for the session. */
    public Session completeMfaLogin(AuthRequests.MfaLogin request, String ip, String userAgent) {
        UUID userId = mfa.completeChallenge(request.mfaToken(), request.code(), ip, userAgent);
        UserAccount user = users.findById(userId).orElseThrow(AuthService::noSession);
        users.touchLogin(user.id(), clock.instant());
        return startSession(user, userAgent);
    }

    /** Swaps a valid refresh token for a new one (the old one stops working). A token used twice ends the whole sign-in. */
    public Session refresh(String refreshToken, String ip, String userAgent) {
        if (refreshToken == null || refreshToken.isBlank()) throw noSession();
        RefreshTokenRepository.Stored stored = refreshTokens.findByHash(TokenService.hash(refreshToken)).orElseThrow(AuthService::noSession);
        Instant now = clock.instant();
        if (stored.revokedAt() != null) {
            if (Duration.between(stored.revokedAt(), now).compareTo(REUSE_GRACE) <= 0) {
                throw new ApiException(HttpStatus.CONFLICT, "refresh_in_progress", "The session was just renewed. Try again.");
            }
            refreshTokens.revokeFamily(stored.familyId());   // an old token came back: assume it was stolen
            record(AuthEvents.REFRESH_REUSE, null, ip, stored.userId(), userAgent);
            throw noSession();
        }
        if (!stored.expiresAt().isAfter(now)) throw noSession();
        if (!refreshTokens.revoke(stored.id(), now)) throw new ApiException(HttpStatus.CONFLICT, "refresh_in_progress", "The session was just renewed. Try again.");
        UserAccount user = users.findById(stored.userId()).orElseThrow(AuthService::noSession);
        if (user.guestExpired(now)) throw noSession();   // the demo account's day is over, even if the cleanup has not removed it yet
        return issue(user, stored.familyId(), userAgent);
    }

    /** Confirms an address from the link in the email. */
    public void verifyEmail(String token) {
        Instant now = clock.instant();
        EmailTokenRepository.Found found = emailTokens.findUsable(TokenService.hash(token), EmailTokenRepository.VERIFY, now).orElseThrow(AuthService::badLink);
        if (!emailTokens.markUsed(found.id(), now)) throw badLink();
        users.markEmailVerified(found.userId(), now);
        record(AuthEvents.EMAIL_VERIFIED, null, null, found.userId(), null);
    }

    /** Sends a new confirmation link. Answers the same whether or not the email has an account that needs one. */
    public void resendVerification(AuthRequests.EmailOnly request, String ip) {
        requireCaptcha(request.captchaToken(), ip);
        limiter.checkEmailRequest(ip);
        record(AuthEvents.EMAIL_REQUESTED, null, ip, null, null);   // counted whether or not the address has an account, so the answer stays the same
        users.findByEmail(normalizeEmail(request.email())).filter(u -> !u.emailVerified() && !u.guest()).ifPresent(this::sendVerification);
    }

    /** Sends a password reset link. Answers the same whether or not the email has an account. */
    public void forgotPassword(AuthRequests.EmailOnly request, String ip) {
        requireCaptcha(request.captchaToken(), ip);
        limiter.checkEmailRequest(ip);
        record(AuthEvents.EMAIL_REQUESTED, null, ip, null, null);
        users.findByEmail(normalizeEmail(request.email())).filter(u -> !u.guest()).ifPresent(user -> {   // a guest has no real address to send to
            Instant now = clock.instant();
            record(AuthEvents.PASSWORD_RESET_REQUESTED, null, ip, user.id(), null);
            if (recentlySent(user.id(), EmailTokenRepository.RESET, now)) return;
            emailTokens.cancelUnused(user.id(), EmailTokenRepository.RESET, now);
            String token = tokens.newRefreshToken();
            emailTokens.insert(user.id(), EmailTokenRepository.RESET, TokenService.hash(token), now, now.plus(RESET_TTL));
            mail.send(user.email(), "Reset your Formularium password",
                    "Someone asked to reset the password of your Formularium account.\n\nChoose a new password here (the link works once, for one hour):\n"
                            + properties.appUrl() + "/reset-password?token=" + token
                            + "\n\nIf it was not you, you can ignore this email: your password stays as it is.");
        });
    }

    /** Sets a new password from the link in the email, and signs the account out everywhere. */
    public void resetPassword(AuthRequests.ResetPassword request) {
        requireUsablePassword(request.password());   // before the link is used up, so a refused password can be changed and tried again
        Instant now = clock.instant();
        EmailTokenRepository.Found found = emailTokens.findUsable(TokenService.hash(request.token()), EmailTokenRepository.RESET, now).orElseThrow(AuthService::badLink);
        if (!emailTokens.markUsed(found.id(), now)) throw badLink();
        users.setPassword(found.userId(), passwords.encode(request.password()));
        users.markEmailVerified(found.userId(), now);   // the link reached their inbox, so the address is theirs
        emailTokens.cancelUnused(found.userId(), EmailTokenRepository.RESET, now);
        refreshTokens.revokeAllForUser(found.userId());
        record(AuthEvents.PASSWORD_RESET_DONE, null, null, found.userId(), null);
    }

    public void logout(String refreshToken) {
        if (refreshToken == null || refreshToken.isBlank()) return;
        refreshTokens.findByHash(TokenService.hash(refreshToken)).ifPresent(t -> refreshTokens.revokeFamily(t.familyId()));
    }

    /** Changes the display name. It must be free (ignoring upper and lower case, but a member may change the case of their own). */
    public UserView updateUsername(UUID id, String username) {
        String name = username.trim();
        if (users.usernameTakenByAnother(id, name)) throw new ApiException(HttpStatus.CONFLICT, "username_taken", "That name is already in use.");
        try {
            accounts.rename(id, name);
        } catch (DuplicateKeyException e) {
            throw new ApiException(HttpStatus.CONFLICT, "username_taken", "That name is already in use.");
        }
        return me(id);
    }

    public UserView me(UUID id) {
        return users.findById(id).map(UserAccount::view).orElseThrow(AuthService::noSession);
    }

    /** Deletes the account and, through the database's cascading deletes, everything that belongs to it. */
    public void deleteAccount(UUID id) {
        users.delete(id);
    }

    public void purgeExpiredTokens() {
        refreshTokens.deleteExpired(clock.instant());
        emailTokens.deleteExpired(clock.instant());
        events.deleteOlderThan(clock.instant().minus(EVENT_RETENTION));
        mfa.purgeExpired();
        guests.purgeExpired();
    }

    /** Deletes the "Try the demo" accounts whose day is over, with everything in them. Run every hour. */
    public int purgeExpiredGuests() { return guests.purgeExpired(); }

    /** Sign-in events hold addresses and browser strings, so they are not kept for long. */
    static final Duration EVENT_RETENTION = Duration.ofDays(90);

    private UserAccount createGoogleUser(String email, GoogleTokenVerifier.Identity who) {
        String base = (who.name() != null && !who.name().isBlank() ? who.name() : email.substring(0, email.indexOf('@')))
                .replaceAll("[^A-Za-z0-9_.-]+", "_").replaceAll("^_+|_+$", "");
        if (base.length() < 3) base = "user";
        if (base.length() > 24) base = base.substring(0, 24);
        for (int attempt = 0; attempt < 5; attempt++) {
            String username = attempt == 0 && !users.usernameTaken(base) ? base : base + "_" + UUID.randomUUID().toString().substring(0, 5);
            try {
                return accounts.create(email, null, who.sub(), username, clock.instant());
            } catch (DuplicateKeyException e) {
                // a username (or, in a race, the account) was taken a moment ago: try the next name
            }
        }
        throw new ApiException(HttpStatus.CONFLICT, "account_exists", "An account with this email already exists.");
    }

    private void sendVerification(UserAccount user) {
        Instant now = clock.instant();
        if (recentlySent(user.id(), EmailTokenRepository.VERIFY, now)) return;
        emailTokens.cancelUnused(user.id(), EmailTokenRepository.VERIFY, now);
        String token = tokens.newRefreshToken();
        emailTokens.insert(user.id(), EmailTokenRepository.VERIFY, TokenService.hash(token), now, now.plus(VERIFY_TTL));
        mail.send(user.email(), "Confirm your email for Formularium",
                "Welcome to Formularium, " + user.username() + "!\n\nConfirm your email address here (the link works once, for 24 hours):\n"
                        + properties.appUrl() + "/verify-email?token=" + token
                        + "\n\nIf you did not create this account, you can ignore this email.");
    }

    private boolean recentlySent(UUID userId, String purpose, Instant now) {
        return emailTokens.lastSent(userId, purpose).filter(sent -> sent.plus(RESEND_GAP).isAfter(now)).isPresent();
    }

    private static ApiException badLink() {
        return new ApiException(HttpStatus.BAD_REQUEST, "invalid_token", "This link has expired or was already used. Please ask for a new one.");
    }

    private Session startSession(UserAccount user, String userAgent) {
        return issue(user, UUID.randomUUID(), userAgent);
    }

    private Session issue(UserAccount user, UUID family, String userAgent) {
        String refresh = tokens.newRefreshToken();
        Instant expires = clock.instant().plus(properties.refreshTtl());
        if (user.guest() && user.guestExpiresAt().isBefore(expires)) expires = user.guestExpiresAt();   // a demo sign-in never outlives its account
        refreshTokens.insert(user.id(), family, TokenService.hash(refresh), expires, userAgent);
        return new Session(new AuthResponse(tokens.accessToken(user), tokens.accessTtlSeconds(), user.view()), refresh);
    }

    private void requireCaptcha(String token, String ip) {
        if (!captcha.verify(token, ip)) throw new ApiException(HttpStatus.FORBIDDEN, "captcha_failed", "The bot check failed. Try again.");
    }

    private static ApiException accountExists() {
        return new ApiException(HttpStatus.CONFLICT, "account_exists", "That email or username is already in use.");
    }

    private static ApiException noSession() {
        return new ApiException(HttpStatus.UNAUTHORIZED, "no_session", "Please sign in.");
    }
}
