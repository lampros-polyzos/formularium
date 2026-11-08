package com.demiurgio.formularium.auth;

import org.springframework.stereotype.Component;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.UUID;

/**
 * Encrypts the authenticator secrets stored in the database (AES-256-GCM). A TOTP secret has to be readable again to check a code, so unlike a
 * password it cannot be hashed; encrypting it means a copy of the database alone is not enough to produce anyone's codes.
 *
 * <p>The key is its own setting ({@code AUTH_MFA_ENCRYPTION_KEY}), deliberately NOT derived from the token secret: rotating the token secret is
 * routine and must not make every member's authenticator stop working. Each value is also bound to its owner's id, so a ciphertext copied onto
 * another account does not decrypt.
 */
@Component
class MfaCrypto {
    private static final int IV_BYTES = 12;
    private static final int TAG_BITS = 128;

    private final SecretKeySpec key;
    private final SecureRandom random = new SecureRandom();

    MfaCrypto(AuthProperties properties) {
        String configured = properties.mfaEncryptionKey();
        this.key = configured == null || configured.isBlank() ? null : new SecretKeySpec(Base64.getDecoder().decode(configured.trim()), "AES");
    }

    /** False when no key is configured: two-step verification is then switched off rather than storing secrets unprotected. */
    boolean available() { return key != null; }

    String encrypt(byte[] plain, UUID owner) {
        try {
            byte[] iv = new byte[IV_BYTES];
            random.nextBytes(iv);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, iv));
            cipher.updateAAD(owner.toString().getBytes(StandardCharsets.UTF_8));
            byte[] encrypted = cipher.doFinal(plain);
            return Base64.getEncoder().encodeToString(ByteBuffer.allocate(iv.length + encrypted.length).put(iv).put(encrypted).array());
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Could not encrypt the secret", e);
        }
    }

    byte[] decrypt(String stored, UUID owner) {
        try {
            byte[] all = Base64.getDecoder().decode(stored);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, all, 0, IV_BYTES));
            cipher.updateAAD(owner.toString().getBytes(StandardCharsets.UTF_8));
            return cipher.doFinal(all, IV_BYTES, all.length - IV_BYTES);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Could not decrypt the secret (wrong key, or not this member's)", e);
        }
    }
}
