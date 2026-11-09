package com.demiurgio.formularium.auth;

import tools.jackson.databind.JsonNode;

import java.io.ByteArrayOutputStream;
import java.math.BigInteger;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.security.Signature;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.util.Base64;

/**
 * A pretend phone or security key, for tests: it makes a key pair, builds what a browser would send for {@code navigator.credentials.create} and
 * {@code .get} (the bytes the WebAuthn standard defines), and signs challenges. It can also be made to lie, about the site it is talking to or about its
 * signature counter, to prove the server refuses.
 */
final class SoftwarePasskey {
    private static final Base64.Encoder B64 = Base64.getUrlEncoder().withoutPadding();

    private final KeyPair keys;
    private final byte[] credentialId = new byte[32];
    private final String rpId;
    private final String origin;
    private byte[] userHandle;
    private long counter;
    private boolean synced;

    /** @param rpId and @param origin: the site this authenticator believes it is talking to. */
    SoftwarePasskey(String rpId, String origin) {
        this.rpId = rpId;
        this.origin = origin;
        try {
            KeyPairGenerator generator = KeyPairGenerator.getInstance("EC");
            generator.initialize(new ECGenParameterSpec("secp256r1"));
            this.keys = generator.generateKeyPair();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
        new SecureRandom().nextBytes(credentialId);
    }

    static SoftwarePasskey forThisSite() { return new SoftwarePasskey("localhost", "http://localhost:5173"); }

    String credentialId() { return B64.encodeToString(credentialId); }

    /** The account id the server gave this passkey at registration (an attacker can learn it; it is not a secret). */
    byte[] userHandle() { return userHandle; }

    SoftwarePasskey withUserHandle(byte[] handle) { this.userHandle = handle; return this; }

    SoftwarePasskey synced() { this.synced = true; return this; }

    SoftwarePasskey counter(long value) { this.counter = value; return this; }

    // ---- navigator.credentials.create

    /** The answer to the registration options (the object under "publicKey"). */
    String create(JsonNode options) { return create(options, origin, rpId); }

    /** As {@link #create(JsonNode)}, but claiming to be on another origin or domain than this authenticator was made for. */
    String create(JsonNode options, String claimedOrigin, String claimedRpId) {
        byte[] user = Base64.getUrlDecoder().decode(options.get("user").get("id").asString());
        this.userHandle = user;
        String clientData = clientData("webauthn.create", options.get("challenge").asString(), claimedOrigin);
        byte[] publicKeyCose = coseKey((ECPublicKey) keys.getPublic());
        ByteBuffer auth = ByteBuffer.allocate(32 + 1 + 4 + 16 + 2 + credentialId.length + publicKeyCose.length);
        auth.put(sha256(claimedRpId.getBytes(StandardCharsets.UTF_8)));
        auth.put((byte) (0x01 | 0x04 | 0x40 | (synced ? 0x18 : 0)));   // user present, user verified, attested credential data (, backup eligible and backed up)
        auth.putInt((int) counter);
        auth.put(new byte[16]);                                          // aaguid: none
        auth.putShort((short) credentialId.length);
        auth.put(credentialId);
        auth.put(publicKeyCose);
        ByteArrayOutputStream attestation = new ByteArrayOutputStream();
        attestation.writeBytes(head(5, 3));                              // {"fmt": "none", "attStmt": {}, "authData": h'...'}
        attestation.writeBytes(text("fmt"));
        attestation.writeBytes(text("none"));
        attestation.writeBytes(text("attStmt"));
        attestation.writeBytes(head(5, 0));
        attestation.writeBytes(text("authData"));
        attestation.writeBytes(bytes(auth.array()));
        return "{\"id\":\"" + credentialId() + "\",\"rawId\":\"" + credentialId() + "\",\"type\":\"public-key\",\"authenticatorAttachment\":\"platform\","
                + "\"response\":{\"clientDataJSON\":\"" + B64.encodeToString(clientData.getBytes(StandardCharsets.UTF_8)) + "\",\"attestationObject\":\""
                + B64.encodeToString(attestation.toByteArray()) + "\",\"transports\":[\"internal\"]},\"clientExtensionResults\":{}}";
    }

    // ---- navigator.credentials.get

    /** The answer to the sign-in options. */
    String get(JsonNode options) { return get(options, origin, rpId); }

    String get(JsonNode options, String claimedOrigin, String claimedRpId) {
        return get(options.get("challenge").asString(), claimedOrigin, claimedRpId, true);
    }

    /** Signs a challenge as the user is present but NOT verified (no fingerprint or PIN), which the server must refuse. */
    String getWithoutUserVerification(JsonNode options) { return get(options.get("challenge").asString(), origin, rpId, false); }

    private String get(String challenge, String claimedOrigin, String claimedRpId, boolean verified) {
        counter++;
        String clientData = clientData("webauthn.get", challenge, claimedOrigin);
        ByteBuffer auth = ByteBuffer.allocate(32 + 1 + 4);
        auth.put(sha256(claimedRpId.getBytes(StandardCharsets.UTF_8)));
        auth.put((byte) (0x01 | (verified ? 0x04 : 0) | (synced ? 0x18 : 0)));
        auth.putInt((int) counter);
        byte[] authData = auth.array();
        byte[] signed = concat(authData, sha256(clientData.getBytes(StandardCharsets.UTF_8)));
        byte[] signature;
        try {
            Signature signer = Signature.getInstance("SHA256withECDSA");
            signer.initSign(keys.getPrivate());
            signer.update(signed);
            signature = signer.sign();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
        return "{\"id\":\"" + credentialId() + "\",\"rawId\":\"" + credentialId() + "\",\"type\":\"public-key\",\"response\":{\"clientDataJSON\":\""
                + B64.encodeToString(clientData.getBytes(StandardCharsets.UTF_8)) + "\",\"authenticatorData\":\"" + B64.encodeToString(authData) + "\",\"signature\":\""
                + B64.encodeToString(signature) + "\",\"userHandle\":\"" + B64.encodeToString(userHandle) + "\"},\"clientExtensionResults\":{}}";
    }

    // ---- the bytes

    private static String clientData(String type, String challenge, String origin) {
        return "{\"type\":\"" + type + "\",\"challenge\":\"" + challenge + "\",\"origin\":\"" + origin + "\",\"crossOrigin\":false}";
    }

    private static byte[] sha256(byte[] data) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(data);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static byte[] concat(byte[] a, byte[] b) {
        byte[] all = new byte[a.length + b.length];
        System.arraycopy(a, 0, all, 0, a.length);
        System.arraycopy(b, 0, all, a.length, b.length);
        return all;
    }

    /** A COSE key for an EC P-256 public key: {1: 2, 3: -7, -1: 1, -2: x, -3: y}. */
    private static byte[] coseKey(ECPublicKey key) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.writeBytes(head(5, 5));
        out.writeBytes(new byte[]{0x01, 0x02});          // kty: EC2
        out.writeBytes(new byte[]{0x03, 0x26});          // alg: ES256 (-7)
        out.writeBytes(new byte[]{0x20, 0x01});          // crv: P-256
        out.write(0x21);                                 // x
        out.writeBytes(bytes(unsigned32(key.getW().getAffineX())));
        out.write(0x22);                                 // y
        out.writeBytes(bytes(unsigned32(key.getW().getAffineY())));
        return out.toByteArray();
    }

    private static byte[] unsigned32(BigInteger value) {
        byte[] raw = value.toByteArray();
        byte[] fixed = new byte[32];
        if (raw.length > 32) System.arraycopy(raw, raw.length - 32, fixed, 0, 32);   // drop the sign byte
        else System.arraycopy(raw, 0, fixed, 32 - raw.length, raw.length);
        return fixed;
    }

    // ---- the little of CBOR needed here: byte strings, text strings and map headers

    private static byte[] head(int major, int length) {
        if (length < 24) return new byte[]{(byte) (major << 5 | length)};
        if (length < 256) return new byte[]{(byte) (major << 5 | 24), (byte) length};
        return new byte[]{(byte) (major << 5 | 25), (byte) (length >> 8), (byte) length};
    }

    private static byte[] bytes(byte[] data) { return concat(head(2, data.length), data); }

    private static byte[] text(String value) {
        byte[] data = value.getBytes(StandardCharsets.UTF_8);
        return concat(head(3, data.length), data);
    }
}
