package com.demiurgio.formularium.auth;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/** PASSKEYS_ENABLED=false switches passkeys off: no challenge is made and nobody can sign in with one. */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = "auth.passkeys.enabled=false")
class PasskeysDisabledTest {
    @Autowired private MockMvc mvc;

    @Test
    void whenSwitchedOff_signingInWithAPasskeyIsUnavailable() throws Exception {
        MvcResult options = mvc.perform(post("/api/v1/auth/login/passkey/options")).andReturn();
        assertThat(options.getResponse().getStatus()).isEqualTo(503);
        assertThat((String) JsonPath.read(options.getResponse().getContentAsString(), "$.error.code")).isEqualTo("passkeys_unavailable");

        MvcResult login = mvc.perform(post("/api/v1/auth/login/passkey").contentType(MediaType.APPLICATION_JSON)
                .content("{\"challengeId\":\"" + java.util.UUID.randomUUID() + "\",\"credential\":{}}")).andReturn();
        assertThat(login.getResponse().getStatus()).isEqualTo(503);
    }
}
