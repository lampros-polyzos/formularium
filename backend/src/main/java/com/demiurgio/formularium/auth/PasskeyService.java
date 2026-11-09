package com.demiurgio.formularium.auth;

import com.yubico.webauthn.AssertionRequest;
import com.yubico.webauthn.AssertionResult;
import com.yubico.webauthn.FinishAssertionOptions;
import com.yubico.webauthn.FinishRegistrationOptions;
import com.yubico.webauthn.RegistrationResult;
import com.yubico.webauthn.RelyingParty;
import com.yubico.webauthn.StartAssertionOptions;
import com.yubico.webauthn.StartRegistrationOptions;
import com.yubico.webauthn.data.AuthenticatorAssertionResponse;
import com.yubico.webauthn.data.AuthenticatorAttestationResponse;
import com.yubico.webauthn.data.AuthenticatorSelectionCriteria;
import com.yubico.webauthn.data.ClientAssertionExtensionOutputs;
import com.yubico.webauthn.data.ClientRegistrationExtensionOutputs;
import com.yubico.webauthn.data.PublicKeyCredential;
import com.yubico.webauthn.data.PublicKeyCredentialCreationOptions;
import com.yubico.webauthn.data.ResidentKeyRequirement;
import com.yubico.webauthn.data.UserIdentity;
import com.yubico.webauthn.data.UserVerificationRequirement;
import com.yubico.webauthn.exception.AssertionFailedException;
import com.yubico.webauthn.exception.RegistrationFailedException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Passkeys (WebAuthn): signing in with a fingerprint, face or device PIN. The browser holds a private key for this website and proves it has it by
 * signing a one-time challenge from us; we keep only the public half. The proof is bound to the site's own domain, so a look-alike site cannot ask for it,
 * which is what two-step codes cannot do.
 *
 * <ul>
 *   <li><b>A passkey is a full sign-in.</b> It needs the device and the person's fingerprint, face or PIN (user verification is required), so it counts as two
 *       factors on its own and skips both the password and the authenticator code. The password stays available as another way in.</li>
 *   <li><b>Adding or removing one needs the account password</b> (when the account has one), as setting up two-step verification does, so someone who has only
 *       stolen an access token cannot bind their own device to the account.</li>
 *   <li>The challenge of each registration or sign-in is stored in the database for {@link #CHALLENGE_TTL} and deleted as it is used, so it works once and any
 *       instance of the backend can finish what another started.</li>
 *   <li>Sign-in is "usernameless": the browser offers the passkeys it holds for this site, and the passkey says who it belongs to.</li>
 * </ul>
 */
@Service
class PasskeyService {
    private static final Logger log = LoggerFactory.getLogger(PasskeyService.class);

    static final Duration CHALLENGE_TTL = Duration.ofMinutes(5);
    static final int MAX_PER_MEMBER = 10;
    private static final String REGISTER = "register";
    private static final String LOGIN = "login";

    /** What the browser needs to start: the id to send back with the answer, and the options for {@code navigator.credentials}. */
    record Options(UUID challengeId, JsonNode options) { }

    /** A passkey as the settings screen lists it. {@code synced} is true when it lives in a password manager or cloud keychain and so follows the member between devices. */
    record View(UUID id, String name, Instant createdAt, Instant lastUsedAt, boolean synced) { }

    record Status(boolean available, boolean needsPassword, List<View> passkeys) { }

    private final RelyingParty rp;
    private final PasskeyRepository repository;
    private final UserRepository users;
    private final PasswordEncoder passwords;
    private final AuthEvents events;
    private final LoginAttemptLimiter limiter;
    private final Clock clock;
    private final boolean enabled;
    private final JsonMapper json = JsonMapper.builder().build();

    PasskeyService(RelyingParty rp, PasskeyRepository repository, UserRepository users, PasswordEncoder passwords, AuthEvents events, LoginAttemptLimiter limiter,
                   Clock clock, @Value("${auth.passkeys.enabled:true}") boolean enabled) {
        this.rp = rp;
        this.repository = repository;
        this.users = users;
        this.passwords = passwords;
        this.events = events;
        this.limiter = limiter;
        this.clock = clock;
        this.enabled = enabled;
    }

    // ---- what the settings screen needs

    Status status(UUID userId) {
        boolean needsPassword = users.findById(userId).map(u -> u.passwordHash() != null).orElse(false);
        return new Status(enabled, needsPassword, repository.forUser(userId).stream().map(PasskeyService::view).toList());
    }

    // ---- adding one

    /** Step 1: the options the browser needs to make a new passkey. Needs the password, and makes nothing until the browser's answer comes to {@link #finishRegistration}. */
    Options registrationOptions(UUID userId, String password, String ip, String userAgent) {
        requireEnabled();
        UserAccount user = requireMember(userId);
        requirePassword(user, password, ip, userAgent);
        if (repository.count(userId) >= MAX_PER_MEMBER) {
            throw new ApiException(HttpStatus.CONFLICT, "too_many_passkeys", "You can have up to " + MAX_PER_MEMBER + " passkeys. Remove one to add another.");
        }
        PublicKeyCredentialCreationOptions request = rp.startRegistration(StartRegistrationOptions.builder()
                .user(UserIdentity.builder().name(user.email()).displayName(user.username()).id(PasskeyCredentials.handleOf(userId)).build())
                .authenticatorSelection(AuthenticatorSelectionCriteria.builder()
                        .residentKey(ResidentKeyRequirement.REQUIRED)             // a "discoverable" passkey, so sign-in needs no username
                        .userVerification(UserVerificationRequirement.REQUIRED)   // fingerprint, face or PIN, not just possession
                        .build())
                .build());
        try {
            UUID id = repository.saveChallenge(REGISTER, userId, request.toJson(), clock.instant().plus(CHALLENGE_TTL));
            return new Options(id, json.readTree(request.toCredentialsCreateJson()).get("publicKey"));
        } catch (IOException e) {
            throw new IllegalStateException("Could not write the passkey options", e);
        }
    }

    /** Step 2: checks what the browser made against the challenge, and keeps the public key. */
    @SuppressWarnings("deprecation")   // the library's backup-flag accessors are the only ones there are; the flags are stored and handed back so it can notice a change
    View finishRegistration(UUID userId, UUID challengeId, JsonNode credential, String name, String ip, String userAgent) {
        requireEnabled();
        requireMember(userId);
        Instant now = clock.instant();
        PasskeyRepository.Challenge challenge = repository.takeChallenge(challengeId, REGISTER, now).filter(c -> userId.equals(c.userId()))
                .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "passkey_expired", "That took too long. Please try adding the passkey again."));
        RegistrationResult result;
        try {
            PublicKeyCredential<AuthenticatorAttestationResponse, ClientRegistrationExtensionOutputs> answer = PublicKeyCredential.parseRegistrationResponseJson(json.writeValueAsString(credential));
            result = rp.finishRegistration(FinishRegistrationOptions.builder().request(PublicKeyCredentialCreationOptions.fromJson(challenge.requestJson())).response(answer).build());
        } catch (IOException | RegistrationFailedException | RuntimeException e) {
            log.info("A passkey registration was refused: {}", e.getMessage());
            throw new ApiException(HttpStatus.BAD_REQUEST, "passkey_invalid", "That passkey could not be added. Try again, or use another device.");
        }
        String label = cleanName(name);
        try {
            UUID id = repository.insert(userId, result.getKeyId().getId().getBase64Url(), result.getPublicKeyCose().getBase64Url(), result.getSignatureCount(), label,
                    result.isBackupEligible(), result.isBackedUp(), now);
            events.record(AuthEvents.PASSKEY_ADDED, null, ip, userId, userAgent, now);
            return new View(id, label, now, null, result.isBackedUp());
        } catch (DuplicateKeyException e) {
            throw new ApiException(HttpStatus.CONFLICT, "passkey_exists", "That passkey is already registered.");
        }
    }

    // ---- removing one

    void remove(UUID userId, UUID passkeyId, String password, String ip, String userAgent) {
        requireEnabled();
        UserAccount user = users.findById(userId).orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "no_session", "Please sign in."));
        requirePassword(user, password, ip, userAgent);
        if (!repository.delete(passkeyId, userId)) throw new ApiException(HttpStatus.NOT_FOUND, "not_found", "That passkey does not exist.");
        events.record(AuthEvents.PASSKEY_REMOVED, null, ip, userId, userAgent, clock.instant());
    }

    // ---- signing in

    /** Step 1 of signing in, for anyone: a challenge, and the options for the browser. Nothing says who is asking. */
    Options loginOptions(String ip) {
        requireEnabled();
        limiter.checkPasskeyStart(ip);
        Instant now = clock.instant();
        events.record(AuthEvents.PASSKEY_LOGIN_STARTED, null, ip, null, null, now);
        AssertionRequest request = rp.startAssertion(StartAssertionOptions.builder().userVerification(UserVerificationRequirement.REQUIRED).build());
        try {
            UUID id = repository.saveChallenge(LOGIN, null, request.toJson(), now.plus(CHALLENGE_TTL));
            return new Options(id, json.readTree(request.toCredentialsGetJson()).get("publicKey"));
        } catch (IOException e) {
            throw new IllegalStateException("Could not write the passkey options", e);
        }
    }

    /**
     * Step 2: checks the browser's signature over the challenge. Every way of failing gives the same answer, so it says nothing about which passkeys exist.
     *
     * @return the member the passkey belongs to; the caller starts the session (no password and no authenticator code are asked: the passkey is both)
     */
    @SuppressWarnings("deprecation")   // as above
    UserAccount finishLogin(UUID challengeId, JsonNode credential, String ip, String userAgent) {
        requireEnabled();
        limiter.checkPasskeyLogin(ip);
        Instant now = clock.instant();
        PasskeyRepository.Challenge challenge = repository.takeChallenge(challengeId, LOGIN, now).orElseThrow(() -> failedLogin(ip, userAgent, "no such challenge"));
        AssertionResult result;
        try {
            PublicKeyCredential<AuthenticatorAssertionResponse, ClientAssertionExtensionOutputs> answer = PublicKeyCredential.parseAssertionResponseJson(json.writeValueAsString(credential));
            result = rp.finishAssertion(FinishAssertionOptions.builder().request(AssertionRequest.fromJson(challenge.requestJson())).response(answer).build());
        } catch (IOException | AssertionFailedException | RuntimeException e) {
            throw failedLogin(ip, userAgent, e.getMessage());
        }
        if (!result.isSuccess()) throw failedLogin(ip, userAgent, "the signature did not check out");
        if (!result.isSignatureCounterValid()) throw failedLogin(ip, userAgent, "the signature counter went backwards: a copied key?");
        UserAccount user = PasskeyCredentials.userOf(result.getCredential().getUserHandle()).flatMap(users::findById).orElseThrow(() -> failedLogin(ip, userAgent, "no such member"));
        PasskeyRepository.Passkey stored = repository.byCredentialId(result.getCredential().getCredentialId().getBase64Url()).filter(p -> p.userId().equals(user.id()))
                .orElseThrow(() -> failedLogin(ip, userAgent, "no such passkey"));
        if (user.guestExpired(now)) throw failedLogin(ip, userAgent, "an expired guest");
        repository.used(stored.id(), result.getSignatureCount(), result.isBackedUp(), now);
        events.record(AuthEvents.PASSKEY_LOGIN, null, ip, user.id(), userAgent, now);
        return user;
    }

    void purgeExpired() { repository.deleteExpiredChallenges(clock.instant()); }

    // ---- the checks

    private void requireEnabled() {
        if (!enabled) throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "passkeys_unavailable", "Passkeys are not available on this server.");
    }

    /** A guest has a temporary account with nothing to secure (the API refuses it earlier; this is the second lock). */
    private UserAccount requireMember(UUID userId) {
        UserAccount user = users.findById(userId).orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "no_session", "Please sign in."));
        if (user.guest()) throw new ApiException(HttpStatus.FORBIDDEN, "guest_account", "This needs a free account. The demo cannot add passkeys.");
        return user;
    }

    /** Changing which devices may sign in needs the password, so a stolen access token alone is not enough. Accounts without a password (Google only) go on the token. */
    private void requirePassword(UserAccount user, String password, String ip, String userAgent) {
        if (user.passwordHash() == null) return;
        limiter.checkPasskeyManagement(user.id(), ip);
        if (password == null || password.isEmpty() || password.getBytes(StandardCharsets.UTF_8).length > 72 || !passwords.matches(password, user.passwordHash())) {
            events.record(AuthEvents.PASSKEY_FAILED, null, ip, user.id(), userAgent, clock.instant());
            throw new ApiException(HttpStatus.UNAUTHORIZED, "invalid_credentials", "That password is not right.");
        }
    }

    private ApiException failedLogin(String ip, String userAgent, String why) {
        log.info("A passkey sign-in was refused: {}", why);
        events.record(AuthEvents.PASSKEY_FAILED, null, ip, null, userAgent, clock.instant());
        return new ApiException(HttpStatus.UNAUTHORIZED, "passkey_failed", "That passkey did not work. Try again, or sign in another way.");
    }

    private static View view(PasskeyRepository.Passkey p) { return new View(p.id(), p.name(), p.createdAt(), p.lastUsedAt(), p.backupState()); }

    private static String cleanName(String name) {
        String trimmed = name == null ? "" : name.trim();
        if (trimmed.isEmpty()) return "Passkey";
        return trimmed.length() > 60 ? trimmed.substring(0, 60) : trimmed;
    }
}
