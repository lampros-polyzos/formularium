package com.demiurgio.formularium.auth;

import com.yubico.webauthn.CredentialRepository;
import com.yubico.webauthn.RegisteredCredential;
import com.yubico.webauthn.data.ByteArray;
import com.yubico.webauthn.data.PublicKeyCredentialDescriptor;
import com.yubico.webauthn.data.exception.Base64UrlException;
import org.springframework.stereotype.Component;

import java.nio.ByteBuffer;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * How the WebAuthn library finds a member's passkeys. Its "username" is the email address (the name the authenticator shows next to the passkey), and its
 * "user handle" is the account id as 16 bytes: random, stable and not personal, as the standard asks.
 */
@Component
class PasskeyCredentials implements CredentialRepository {
    private final UserRepository users;
    private final PasskeyRepository passkeys;

    PasskeyCredentials(UserRepository users, PasskeyRepository passkeys) {
        this.users = users;
        this.passkeys = passkeys;
    }

    static ByteArray handleOf(UUID userId) {
        return new ByteArray(ByteBuffer.allocate(16).putLong(userId.getMostSignificantBits()).putLong(userId.getLeastSignificantBits()).array());
    }

    static Optional<UUID> userOf(ByteArray handle) {
        byte[] bytes = handle.getBytes();
        if (bytes.length != 16) return Optional.empty();
        ByteBuffer buffer = ByteBuffer.wrap(bytes);
        return Optional.of(new UUID(buffer.getLong(), buffer.getLong()));
    }

    private static Optional<ByteArray> idOf(String base64Url) {
        try {
            return Optional.of(ByteArray.fromBase64Url(base64Url));
        } catch (Base64UrlException e) {
            return Optional.empty();
        }
    }

    @Override
    public Set<PublicKeyCredentialDescriptor> getCredentialIdsForUsername(String username) {
        return users.findByEmail(username).map(user -> passkeys.forUser(user.id()).stream()
                .map(p -> idOf(p.credentialId()).map(id -> PublicKeyCredentialDescriptor.builder().id(id).build()))
                .flatMap(Optional::stream).collect(Collectors.toSet())).orElse(Set.of());
    }

    @Override
    public Optional<ByteArray> getUserHandleForUsername(String username) {
        return users.findByEmail(username).map(user -> handleOf(user.id()));
    }

    @Override
    public Optional<String> getUsernameForUserHandle(ByteArray userHandle) {
        return userOf(userHandle).flatMap(users::findById).map(UserAccount::email);
    }

    @Override
    public Optional<RegisteredCredential> lookup(ByteArray credentialId, ByteArray userHandle) {
        Optional<UUID> owner = userOf(userHandle);
        return passkeys.byCredentialId(credentialId.getBase64Url()).filter(p -> owner.isPresent() && p.userId().equals(owner.get())).flatMap(this::registered);
    }

    @Override
    public Set<RegisteredCredential> lookupAll(ByteArray credentialId) {
        return passkeys.byCredentialId(credentialId.getBase64Url()).flatMap(this::registered).map(Set::of).orElse(Set.of());
    }

    @SuppressWarnings("deprecation")   // the library has no other way to hand back the stored backup flags
    private Optional<RegisteredCredential> registered(PasskeyRepository.Passkey p) {
        Optional<ByteArray> id = idOf(p.credentialId());
        Optional<ByteArray> key = idOf(p.publicKey());
        if (id.isEmpty() || key.isEmpty()) return Optional.empty();
        return Optional.of(RegisteredCredential.builder().credentialId(id.get()).userHandle(handleOf(p.userId())).publicKeyCose(key.get())
                .signatureCount(p.signCount()).backupEligible(p.backupEligible()).backupState(p.backupState()).build());
    }
}
