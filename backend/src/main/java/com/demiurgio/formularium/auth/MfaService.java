package com.demiurgio.formularium.auth;

import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

/**
 * Two-step verification with an authenticator app (TOTP) and single-use recovery codes.
 *
 * <p>Setting it up needs the account password (when the account has one), so someone holding only a stolen access token cannot bind the account
 * to THEIR phone and lock the owner out. Turning it off, or asking for new recovery codes, needs a valid code. At sign-in, a correct password
 * does not start a session: it earns a one-time challenge ({@link #CHALLENGE_TTL}, {@value #MAX_CHALLENGE_ATTEMPTS} tries) that a correct code
 * exchanges for the session. A code works once, and failures are throttled per account and per address.
 */
@Service
class MfaService {
    static final Duration CHALLENGE_TTL = Duration.ofMinutes(5);
    static final int MAX_CHALLENGE_ATTEMPTS = 5;
    static final int RECOVERY_CODE_COUNT = 10;
    static final String ISSUER = "Formularium";

    /** No 0, O, 1, I or L: easy to misread when copied from paper. */
    private static final String CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    private static final int CODE_LENGTH = 10;

    record Status(boolean available, boolean enabled, int recoveryCodesLeft, boolean needsPassword) { }

    record Setup(String secret, String otpauthUri) { }

    private final MfaRepository repository;
    private final MfaCrypto crypto;
    private final UserRepository users;
    private final PasswordEncoder passwords;
    private final TokenService tokens;
    private final AuthEvents events;
    private final LoginAttemptLimiter limiter;
    private final Clock clock;
    private final SecureRandom random = new SecureRandom();

    MfaService(MfaRepository repository, MfaCrypto crypto, UserRepository users, PasswordEncoder passwords, TokenService tokens, AuthEvents events,
               LoginAttemptLimiter limiter, Clock clock) {
        this.repository = repository;
        this.crypto = crypto;
        this.users = users;
        this.passwords = passwords;
        this.tokens = tokens;
        this.events = events;
        this.limiter = limiter;
        this.clock = clock;
    }

    // ---- what the settings screen needs

    Status status(UUID userId) {
        boolean enabled = repository.findFactor(userId).map(MfaRepository.Factor::enabled).orElse(false);
        boolean needsPassword = users.findById(userId).map(u -> u.passwordHash() != null).orElse(false);
        return new Status(crypto.available(), enabled, enabled ? repository.recoveryCodesLeft(userId) : 0, needsPassword);
    }

    boolean isEnabled(UUID userId) {
        return crypto.available() && repository.findFactor(userId).map(MfaRepository.Factor::enabled).orElse(false);
    }

    // ---- setting up, switching off

    /** Makes a fresh secret for the member to put in their authenticator app. It does nothing until {@link #enable} is given a code from it. */
    Setup setup(UUID userId, String password, String ip, String userAgent) {
        requireAvailable();
        UserAccount user = users.findById(userId).orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "no_session", "Please sign in."));
        if (repository.findFactor(userId).map(MfaRepository.Factor::enabled).orElse(false)) {
            throw new ApiException(HttpStatus.CONFLICT, "mfa_already_on", "Two-step verification is already on. Turn it off first to set it up again.");
        }
        if (user.passwordHash() != null) {
            limiter.checkMfa(userId, ip);
            if (password == null || password.isEmpty() || password.getBytes(StandardCharsets.UTF_8).length > 72 || !passwords.matches(password, user.passwordHash())) {
                failed(userId, ip, userAgent);
                throw new ApiException(HttpStatus.UNAUTHORIZED, "invalid_credentials", "That password is not right.");
            }
        }
        byte[] secret = Totp.newSecret();
        if (!repository.savePending(userId, crypto.encrypt(secret, userId), clock.instant())) {
            throw new ApiException(HttpStatus.CONFLICT, "mfa_already_on", "Two-step verification is already on.");
        }
        String base32 = Totp.base32(secret);
        return new Setup(base32, Totp.uri(ISSUER, user.email(), base32));
    }

    /** Switches it on once the member shows they can produce a code. Returns the recovery codes, which are never shown again. */
    List<String> enable(UUID userId, String code, String ip, String userAgent) {
        requireAvailable();
        MfaRepository.Factor factor = repository.findFactor(userId).orElseThrow(() -> new ApiException(HttpStatus.CONFLICT, "mfa_not_started", "Start the setup first."));
        if (factor.enabled()) throw new ApiException(HttpStatus.CONFLICT, "mfa_already_on", "Two-step verification is already on.");
        limiter.checkMfa(userId, ip);
        long step = Totp.match(crypto.decrypt(factor.secretEncrypted(), userId), clean(code), Totp.stepAt(clock.instant()), 0);
        if (step < 0) {
            failed(userId, ip, userAgent);
            throw invalidCode();
        }
        if (!repository.enable(userId, clock.instant(), step)) throw new ApiException(HttpStatus.CONFLICT, "mfa_already_on", "Two-step verification is already on.");
        List<String> codes = storeNewRecoveryCodes(userId);
        events.record(AuthEvents.MFA_ENABLED, null, ip, userId, userAgent, clock.instant());
        return codes;
    }

    void disable(UUID userId, String code, String ip, String userAgent) {
        requireAvailable();
        requireOn(userId);
        requireCode(userId, code, ip, userAgent);
        repository.deleteFactor(userId);
        events.record(AuthEvents.MFA_DISABLED, null, ip, userId, userAgent, clock.instant());
    }

    List<String> newRecoveryCodes(UUID userId, String code, String ip, String userAgent) {
        requireAvailable();
        requireOn(userId);
        requireCode(userId, code, ip, userAgent);
        List<String> codes = storeNewRecoveryCodes(userId);
        events.record(AuthEvents.RECOVERY_CODES_RENEWED, null, ip, userId, userAgent, clock.instant());
        return codes;
    }

    // ---- signing in

    /** After a correct password: a one-time token that, together with a correct code, is exchanged for the session. */
    String startChallenge(UUID userId) {
        String token = tokens.newRefreshToken();
        Instant now = clock.instant();
        repository.createChallenge(userId, TokenService.hash(token), now, now.plus(CHALLENGE_TTL));
        return token;
    }

    /** @return the member the challenge was for, once a right code has used it up */
    UUID completeChallenge(String token, String code, String ip, String userAgent) {
        Instant now = clock.instant();
        MfaRepository.Challenge challenge = repository.findChallenge(TokenService.hash(token), now)
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "mfa_expired", "That sign-in took too long. Please sign in again."));
        limiter.checkMfa(challenge.userId(), ip);
        if (!verify(challenge.userId(), code, ip, userAgent)) {
            failed(challenge.userId(), ip, userAgent);
            if (repository.addAttempt(challenge.id()) >= MAX_CHALLENGE_ATTEMPTS) {
                repository.deleteChallenge(challenge.id());
                throw new ApiException(HttpStatus.UNAUTHORIZED, "mfa_expired", "Too many wrong codes. Please sign in again.");
            }
            throw invalidCode();
        }
        if (!repository.deleteChallenge(challenge.id())) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "mfa_expired", "That sign-in was already used. Please sign in again.");
        }
        events.record(AuthEvents.MFA_LOGIN_SUCCESS, null, ip, challenge.userId(), userAgent, clock.instant());
        return challenge.userId();
    }

    void purgeExpired() { repository.deleteExpiredChallenges(clock.instant()); }

    // ---- the checks

    private void requireCode(UUID userId, String code, String ip, String userAgent) {
        limiter.checkMfa(userId, ip);
        if (!verify(userId, code, ip, userAgent)) {
            failed(userId, ip, userAgent);
            throw invalidCode();
        }
    }

    /** True if the code is a right authenticator code that was not used before, or an unused recovery code (which is used up by this). */
    private boolean verify(UUID userId, String code, String ip, String userAgent) {
        String cleaned = clean(code);
        MfaRepository.Factor factor = repository.findFactor(userId).filter(MfaRepository.Factor::enabled).orElse(null);
        if (factor == null || !crypto.available()) return false;
        if (cleaned.matches("\\d{" + Totp.DIGITS + "}")) {
            long step = Totp.match(crypto.decrypt(factor.secretEncrypted(), userId), cleaned, Totp.stepAt(clock.instant()), factor.lastUsedStep());
            return step >= 0 && repository.advanceStep(userId, step);   // the update refuses a step that someone used a moment ago
        }
        String recovery = cleaned.replace("-", "").toUpperCase(Locale.ROOT);
        if (recovery.length() != CODE_LENGTH) return false;
        boolean used = repository.useRecoveryCode(userId, TokenService.hash(recovery), clock.instant());
        if (used) events.record(AuthEvents.RECOVERY_CODE_USED, null, ip, userId, userAgent, clock.instant());
        return used;
    }

    private void requireOn(UUID userId) {
        if (!repository.findFactor(userId).map(MfaRepository.Factor::enabled).orElse(false)) {
            throw new ApiException(HttpStatus.CONFLICT, "mfa_not_on", "Two-step verification is not on.");
        }
    }

    private void requireAvailable() {
        if (!crypto.available()) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "mfa_unavailable", "Two-step verification is not set up on this server.");
        }
    }

    private void failed(UUID userId, String ip, String userAgent) {
        events.record(AuthEvents.MFA_FAILED, null, ip, userId, userAgent, clock.instant());
    }

    private static ApiException invalidCode() {
        return new ApiException(HttpStatus.UNAUTHORIZED, "invalid_code", "That code is not right. Check the app, or use a recovery code.");
    }

    private static String clean(String code) { return code == null ? "" : code.trim().replace(" ", ""); }

    // ---- recovery codes

    private List<String> storeNewRecoveryCodes(UUID userId) {
        Set<String> raw = new LinkedHashSet<>();
        while (raw.size() < RECOVERY_CODE_COUNT) {
            StringBuilder code = new StringBuilder();
            for (int i = 0; i < CODE_LENGTH; i++) code.append(CODE_ALPHABET.charAt(random.nextInt(CODE_ALPHABET.length())));
            raw.add(code.toString());
        }
        repository.replaceRecoveryCodes(userId, raw.stream().map(TokenService::hash).toList());
        List<String> shown = new ArrayList<>();
        for (String code : raw) shown.add(code.substring(0, 5) + "-" + code.substring(5));
        return shown;
    }
}
