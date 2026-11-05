package com.demiurgio.formularium.auth;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.UUID;

/** Sign-up, sign-in (password or Google), refresh-token rotation, sign-out and account deletion. */
@Service
public class AuthService {
    /** The response body for the client and the refresh token for the cookie. */
    public record Session(AuthResponse response, String refreshToken) { }

    /** A refresh token that was used a moment ago is most likely a second tab racing the first, not theft. */
    private static final Duration REUSE_GRACE = Duration.ofSeconds(10);

    private final UserRepository users;
    private final AccountCreator accounts;
    private final RefreshTokenRepository refreshTokens;
    private final TokenService tokens;
    private final PasswordEncoder passwords;
    private final LoginAttemptLimiter limiter;
    private final CaptchaVerifier captcha;
    private final GoogleTokenVerifier google;
    private final AuthProperties properties;
    private final Clock clock;
    /** Checked against when the email is unknown, so a wrong email and a wrong password take equally long. */
    private final String decoyHash;

    AuthService(UserRepository users, AccountCreator accounts, RefreshTokenRepository refreshTokens, TokenService tokens, PasswordEncoder passwords, LoginAttemptLimiter limiter,
                CaptchaVerifier captcha, GoogleTokenVerifier google, AuthProperties properties, Clock clock) {
        this.users = users;
        this.accounts = accounts;
        this.refreshTokens = refreshTokens;
        this.tokens = tokens;
        this.passwords = passwords;
        this.limiter = limiter;
        this.captcha = captcha;
        this.google = google;
        this.properties = properties;
        this.clock = clock;
        this.decoyHash = passwords.encode(UUID.randomUUID().toString());
    }

    static String normalizeEmail(String email) { return email.trim().toLowerCase(Locale.ROOT); }

    public Session register(AuthRequests.Register request, String ip, String userAgent) {
        requireCaptcha(request.captchaToken(), ip);
        String email = normalizeEmail(request.email());
        String username = request.username().trim();
        if (users.findByEmail(email).isPresent() || users.usernameTaken(username)) throw accountExists();
        try {
            UserAccount user = accounts.create(email, passwords.encode(request.password()), null, username);
            return startSession(user, userAgent);
        } catch (DuplicateKeyException e) {
            throw accountExists();   // lost a race with another sign-up
        }
    }

    public Session login(AuthRequests.Login request, String ip, String userAgent) {
        String email = normalizeEmail(request.email());
        String key = email + "|" + ip;
        limiter.check(key);
        requireCaptcha(request.captchaToken(), ip);
        UserAccount user = users.findByEmail(email).orElse(null);
        String hash = user != null && user.passwordHash() != null ? user.passwordHash() : decoyHash;
        boolean matches = passwords.matches(request.password(), hash);
        if (user == null || user.passwordHash() == null || !matches) {
            limiter.failed(key);
            throw new ApiException(HttpStatus.UNAUTHORIZED, "invalid_credentials", "The email or password is not right.");
        }
        limiter.succeeded(key);
        users.touchLogin(user.id(), clock.instant());
        return startSession(user, userAgent);
    }

    public Session loginWithGoogle(String idToken, String userAgent) {
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
                user = new UserAccount(byEmail.id(), byEmail.email(), byEmail.passwordHash(), who.sub(), byEmail.username());
            } else {
                user = createGoogleUser(email, who);
            }
        }
        users.touchLogin(user.id(), clock.instant());
        return startSession(user, userAgent);
    }

    /** Swaps a valid refresh token for a new one (the old one stops working). A token used twice ends the whole sign-in. */
    public Session refresh(String refreshToken, String userAgent) {
        if (refreshToken == null || refreshToken.isBlank()) throw noSession();
        RefreshTokenRepository.Stored stored = refreshTokens.findByHash(TokenService.hash(refreshToken)).orElseThrow(AuthService::noSession);
        Instant now = clock.instant();
        if (stored.revokedAt() != null) {
            if (Duration.between(stored.revokedAt(), now).compareTo(REUSE_GRACE) <= 0) {
                throw new ApiException(HttpStatus.CONFLICT, "refresh_in_progress", "The session was just renewed. Try again.");
            }
            refreshTokens.revokeFamily(stored.familyId());   // an old token came back: assume it was stolen
            throw noSession();
        }
        if (!stored.expiresAt().isAfter(now)) throw noSession();
        if (!refreshTokens.revoke(stored.id(), now)) throw new ApiException(HttpStatus.CONFLICT, "refresh_in_progress", "The session was just renewed. Try again.");
        UserAccount user = users.findById(stored.userId()).orElseThrow(AuthService::noSession);
        return issue(user, stored.familyId(), userAgent);
    }

    public void logout(String refreshToken) {
        if (refreshToken == null || refreshToken.isBlank()) return;
        refreshTokens.findByHash(TokenService.hash(refreshToken)).ifPresent(t -> refreshTokens.revokeFamily(t.familyId()));
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
    }

    private UserAccount createGoogleUser(String email, GoogleTokenVerifier.Identity who) {
        String base = (who.name() != null && !who.name().isBlank() ? who.name() : email.substring(0, email.indexOf('@')))
                .replaceAll("[^A-Za-z0-9_.-]+", "_").replaceAll("^_+|_+$", "");
        if (base.length() < 3) base = "user";
        if (base.length() > 24) base = base.substring(0, 24);
        for (int attempt = 0; attempt < 5; attempt++) {
            String username = attempt == 0 && !users.usernameTaken(base) ? base : base + "_" + UUID.randomUUID().toString().substring(0, 5);
            try {
                return accounts.create(email, null, who.sub(), username);
            } catch (DuplicateKeyException e) {
                // a username (or, in a race, the account) was taken a moment ago: try the next name
            }
        }
        throw new ApiException(HttpStatus.CONFLICT, "account_exists", "An account with this email already exists.");
    }

    private Session startSession(UserAccount user, String userAgent) {
        return issue(user, UUID.randomUUID(), userAgent);
    }

    private Session issue(UserAccount user, UUID family, String userAgent) {
        String refresh = tokens.newRefreshToken();
        refreshTokens.insert(user.id(), family, TokenService.hash(refresh), clock.instant().plus(properties.refreshTtl()), userAgent);
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
