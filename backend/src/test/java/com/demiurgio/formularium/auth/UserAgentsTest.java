package com.demiurgio.formularium.auth;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** A browser's identification string in words a person recognises. The order of the checks is the point: most browsers claim to be several others. */
class UserAgentsTest {

    @Test
    void recognisesTheCommonOnes() {
        assertThat(UserAgents.describe("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36")).isEqualTo("Chrome on Windows");
        assertThat(UserAgents.describe("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0")).isEqualTo("Edge on Windows");
        assertThat(UserAgents.describe("Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0")).isEqualTo("Firefox on Windows");
        assertThat(UserAgents.describe("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15")).isEqualTo("Safari on macOS");
        assertThat(UserAgents.describe("Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0")).isEqualTo("Firefox on Linux");
        assertThat(UserAgents.describe("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 OPR/115.0.0.0")).isEqualTo("Opera on Windows");
    }

    @Test
    void phonesAreNotMistakenForTheComputersTheyPretendToBe() {
        // an iPhone says "Mac OS X", and Android says "Linux"
        assertThat(UserAgents.describe("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1")).isEqualTo("Safari on iOS");
        assertThat(UserAgents.describe("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.0.0 Mobile/15E148 Safari/604.1")).isEqualTo("Chrome on iOS");
        assertThat(UserAgents.describe("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36")).isEqualTo("Chrome on Android");
        assertThat(UserAgents.describe("Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36 EdgA/130.0.0.0")).isEqualTo("Edge on Android");
    }

    @Test
    void saysWhatItCan_andNeverInventsTheRest() {
        assertThat(UserAgents.describe(null)).isEqualTo("an unrecognised browser");
        assertThat(UserAgents.describe("")).isEqualTo("an unrecognised browser");
        assertThat(UserAgents.describe("   ")).isEqualTo("an unrecognised browser");
        assertThat(UserAgents.describe("curl/8.5.0")).isEqualTo("an unrecognised browser");
        assertThat(UserAgents.describe("SomeApp/1.0 (Windows NT 10.0)")).isEqualTo("a browser on Windows");
        assertThat(UserAgents.describe("Chrome/130.0.0.0")).isEqualTo("Chrome");
    }

    @Test
    void whatItReturnsIsPlainTextOfALimitedKind_neverTheRawString() {
        String hostile = "<script>alert(1)</script> Chrome/130 \r\nBcc: attacker@example.com Windows";
        assertThat(UserAgents.describe(hostile)).isEqualTo("Chrome on Windows").doesNotContain("<").doesNotContain("\n").doesNotContain("attacker");
    }
}
