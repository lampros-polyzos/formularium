package com.demiurgio.formularium.auth;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URLEncoder;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;

/**
 * Time-based one-time passwords (RFC 6238): the six digits an authenticator app shows, changing every 30 seconds.
 * HMAC-SHA1 with 6 digits is what every authenticator app understands, and is not weakened by SHA-1's collision problems.
 */
final class Totp {
    static final int DIGITS = 6;
    static final long STEP_SECONDS = 30;
    /** One step either side of now is accepted, for clocks that are a little off. */
    static final int WINDOW = 1;

    private static final String BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    private static final SecureRandom RANDOM = new SecureRandom();

    private Totp() { }

    /** 160 random bits, the size RFC 4226 recommends. */
    static byte[] newSecret() {
        byte[] secret = new byte[20];
        RANDOM.nextBytes(secret);
        return secret;
    }

    static long stepAt(Instant time) { return time.getEpochSecond() / STEP_SECONDS; }

    /** The code for one 30-second step. */
    static String code(byte[] secret, long step) {
        try {
            Mac mac = Mac.getInstance("HmacSHA1");
            mac.init(new SecretKeySpec(secret, "HmacSHA1"));
            byte[] hash = mac.doFinal(ByteBuffer.allocate(8).putLong(step).array());
            int offset = hash[hash.length - 1] & 0x0f;
            int binary = ((hash[offset] & 0x7f) << 24) | ((hash[offset + 1] & 0xff) << 16) | ((hash[offset + 2] & 0xff) << 8) | (hash[offset + 3] & 0xff);
            return String.format("%0" + DIGITS + "d", binary % 1_000_000);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }

    /**
     * Checks a submitted code against the steps around now.
     *
     * @param lastUsedStep the step of the last code that was accepted: a code from that step or an earlier one is refused, so a code works once
     * @return the step the code belongs to, or -1 when it is wrong, malformed or already used
     */
    static long match(byte[] secret, String submitted, long nowStep, long lastUsedStep) {
        if (submitted == null || !submitted.matches("\\d{" + DIGITS + "}")) return -1;
        byte[] given = submitted.getBytes(StandardCharsets.US_ASCII);
        long found = -1;
        for (long step = nowStep - WINDOW; step <= nowStep + WINDOW; step++) {   // no early exit, so the time taken says nothing about which step matched
            boolean same = MessageDigest.isEqual(code(secret, step).getBytes(StandardCharsets.US_ASCII), given);
            if (same && step > lastUsedStep) found = Math.max(found, step);
        }
        return found;
    }

    /** The address an authenticator app reads from the QR code. */
    static String uri(String issuer, String account, String secretBase32) {
        String label = URLEncoder.encode(issuer, StandardCharsets.UTF_8).replace("+", "%20") + ":" + URLEncoder.encode(account, StandardCharsets.UTF_8).replace("+", "%20");
        return "otpauth://totp/" + label + "?secret=" + secretBase32 + "&issuer=" + URLEncoder.encode(issuer, StandardCharsets.UTF_8).replace("+", "%20")
                + "&algorithm=SHA1&digits=" + DIGITS + "&period=" + STEP_SECONDS;
    }

    /** RFC 4648 base32 without padding, the form authenticator apps expect for the secret. */
    static String base32(byte[] bytes) {
        StringBuilder out = new StringBuilder();
        int buffer = 0, bits = 0;
        for (byte b : bytes) {
            buffer = (buffer << 8) | (b & 0xff);
            bits += 8;
            while (bits >= 5) {
                out.append(BASE32.charAt((buffer >> (bits - 5)) & 31));
                bits -= 5;
            }
        }
        if (bits > 0) out.append(BASE32.charAt((buffer << (5 - bits)) & 31));
        return out.toString();
    }

    static byte[] fromBase32(String text) {
        String clean = text.replace("=", "").replace(" ", "").toUpperCase();
        ByteBuffer out = ByteBuffer.allocate(clean.length() * 5 / 8 + 1);
        int buffer = 0, bits = 0;
        for (char c : clean.toCharArray()) {
            int value = BASE32.indexOf(c);
            if (value < 0) throw new IllegalArgumentException("not base32: " + c);
            buffer = (buffer << 5) | value;
            bits += 5;
            if (bits >= 8) {
                out.put((byte) ((buffer >> (bits - 8)) & 0xff));
                bits -= 8;
            }
        }
        byte[] bytes = new byte[out.position()];
        out.flip();
        out.get(bytes);
        return bytes;
    }
}
