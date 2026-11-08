package com.demiurgio.formularium.auth;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/** With no encryption key configured the feature is off, instead of storing authenticator secrets unprotected. Signing in is not affected. */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = "auth.mfa-encryption-key=")
class MfaUnavailableTest {
    @Autowired private MockMvc mvc;
    @Autowired private JdbcTemplate jdbc;

    private MvcResult register(String email) throws Exception {
        return mvc.perform(post("/api/v1/auth/register").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"" + email + "\",\"password\":\"correct horse battery\",\"username\":\"u" + UUID.randomUUID().toString().substring(0, 8) + "\"}")).andReturn();
    }

    @Test
    void saysItIsUnavailable_andSettingUpIsRefused_butSigningInStillWorks() throws Exception {
        String email = "nokey-" + UUID.randomUUID().toString().substring(0, 6) + "@example.com";
        MvcResult registered = register(email);
        assertThat(registered.getResponse().getStatus()).isEqualTo(201);
        String token = JsonPath.read(registered.getResponse().getContentAsString(), "$.accessToken");

        MvcResult status = mvc.perform(get("/api/v1/auth/mfa").header("Authorization", "Bearer " + token)).andReturn();
        assertThat((Boolean) JsonPath.read(status.getResponse().getContentAsString(), "$.available")).isFalse();

        MvcResult setup = mvc.perform(post("/api/v1/auth/mfa/setup").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
                .content("{\"password\":\"correct horse battery\"}")).andReturn();
        assertThat(setup.getResponse().getStatus()).isEqualTo(503);
        assertThat((String) JsonPath.read(setup.getResponse().getContentAsString(), "$.error.code")).isEqualTo("mfa_unavailable");
        assertThat(jdbc.queryForObject("select count(*) from user_mfa where user_id = (select id from app_users where email = ?)", Long.class, email)).isZero();   // nothing was stored for this account

        MvcResult login = mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"" + email + "\",\"password\":\"correct horse battery\"}")).andReturn();
        assertThat(login.getResponse().getContentAsString()).contains("accessToken");
    }

    @Test
    void aKeyThatIsNotBase64Of32Bytes_stopsTheServerFromStartingInsteadOfFailingLater() {
        assertThatThrownBy(() -> new AuthProperties("0123456789012345678901234567890123456789", null, null, null, null, null, false, null, false, null, null, null, null, "c2hvcnQ="))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("32 bytes");
        assertThat(new AuthProperties("0123456789012345678901234567890123456789", null, null, null, null, null, false, null, false, null, null, null, null, "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=")
                .mfaEncryptionKey()).isNotBlank();
    }
}
