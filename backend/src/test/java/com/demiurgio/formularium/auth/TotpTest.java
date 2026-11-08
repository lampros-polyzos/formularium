package com.demiurgio.formularium.auth;

import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

/** The algorithm against the test values published in RFC 6238, so it matches every authenticator app. */
class TotpTest {
    // The RFC's SHA-1 test secret is the ASCII string 12345678901234567890. Its 8-digit codes end in the 6-digit ones used here.
    private static final byte[] RFC_SECRET = "12345678901234567890".getBytes(StandardCharsets.US_ASCII);

    private static String at(long seconds) { return Totp.code(RFC_SECRET, Totp.stepAt(Instant.ofEpochSecond(seconds))); }

    @Test
    void producesTheCodesFromTheRfcTestVectors() {
        assertThat(at(59)).isEqualTo("287082");            // RFC: 94287082
        assertThat(at(1111111109L)).isEqualTo("081804");   // RFC: 07081804 (leading zero kept)
        assertThat(at(1111111111L)).isEqualTo("050471");   // RFC: 14050471
        assertThat(at(1234567890L)).isEqualTo("005924");   // RFC: 89005924
        assertThat(at(2000000000L)).isEqualTo("279037");   // RFC: 69279037
        assertThat(at(20000000000L)).isEqualTo("353130");  // RFC: 65353130
    }

    @Test
    void acceptsTheStepsAroundNow_butNotFurtherAway() {
        long now = 1_000_000;
        assertThat(Totp.match(RFC_SECRET, Totp.code(RFC_SECRET, now), now, 0)).isEqualTo(now);
        assertThat(Totp.match(RFC_SECRET, Totp.code(RFC_SECRET, now - 1), now, 0)).isEqualTo(now - 1);   // a phone clock a little slow
        assertThat(Totp.match(RFC_SECRET, Totp.code(RFC_SECRET, now + 1), now, 0)).isEqualTo(now + 1);   // or a little fast
        assertThat(Totp.match(RFC_SECRET, Totp.code(RFC_SECRET, now - 2), now, 0)).isEqualTo(-1);
        assertThat(Totp.match(RFC_SECRET, Totp.code(RFC_SECRET, now + 2), now, 0)).isEqualTo(-1);
    }

    @Test
    void refusesACodeFromAStepThatWasAlreadyUsedOrEarlier() {
        long now = 1_000_000;
        String code = Totp.code(RFC_SECRET, now);
        assertThat(Totp.match(RFC_SECRET, code, now, now - 1)).isEqualTo(now);
        assertThat(Totp.match(RFC_SECRET, code, now, now)).isEqualTo(-1);        // used a moment ago
        assertThat(Totp.match(RFC_SECRET, code, now + 1, now)).isEqualTo(-1);    // still the same code, a step later
    }

    @Test
    void refusesAnythingThatIsNotSixDigits() {
        long now = 1_000_000;
        for (String bad : new String[] { null, "", "12345", "1234567", "12345a", " 123456", "١٢٣٤٥٦" }) {
            assertThat(Totp.match(RFC_SECRET, bad, now, 0)).isEqualTo(-1);
        }
    }

    @Test
    void writesTheSecretInBase32_andReadsItBack() {
        // RFC 4648 test vectors
        assertThat(Totp.base32("foobar".getBytes(StandardCharsets.US_ASCII))).isEqualTo("MZXW6YTBOI");
        assertThat(Totp.base32("fooba".getBytes(StandardCharsets.US_ASCII))).isEqualTo("MZXW6YTB");
        assertThat(new String(Totp.fromBase32("MZXW6YTBOI"), StandardCharsets.US_ASCII)).isEqualTo("foobar");
        byte[] secret = Totp.newSecret();
        assertThat(secret).hasSize(20);
        assertThat(Totp.fromBase32(Totp.base32(secret))).isEqualTo(secret);
        assertThat(Totp.fromBase32(Totp.base32(secret).toLowerCase())).isEqualTo(secret);   // typed by hand, in any case
    }

    @Test
    void buildsTheAddressAnAuthenticatorAppReads() {
        assertThat(Totp.uri("Formularium", "sam+test@example.com", "ABCDEFGH"))
                .isEqualTo("otpauth://totp/Formularium:sam%2Btest%40example.com?secret=ABCDEFGH&issuer=Formularium&algorithm=SHA1&digits=6&period=30");
    }
}
