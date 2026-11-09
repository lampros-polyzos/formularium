package com.demiurgio.formularium.auth;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;

/** Through the real endpoints, set up as in production (the header Render's edge sets is named): what ends up in the audit trail and the throttle counters. */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = "auth.client-ip-header=CF-Connecting-IP")
class ClientAddressApiTest {

    @Autowired private MockMvc mvc;
    @Autowired private JdbcTemplate jdbc;
    @MockitoBean private EmailSender mail;

    @BeforeEach
    void clean() { jdbc.update("delete from auth_events"); }

    private void askForAResetLink(String connection, String... headers) throws Exception {
        var request = post("/api/v1/auth/forgot-password").contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"nobody@example.com\"}")
                .with(r -> { r.setRemoteAddr(connection); return r; });
        for (int i = 0; i < headers.length; i += 2) request.header(headers[i], headers[i + 1]);
        mvc.perform(request);
    }

    private List<String> recordedAddresses() {
        return jdbc.queryForList("select ip from auth_events where type = 'email_requested' order by at", String.class);
    }

    @Test
    void theAddressInTheAuditTrailIsTheOneTheProxyReported() throws Exception {
        askForAResetLink("10.0.0.7", "CF-Connecting-IP", "203.0.113.50");
        assertThat(recordedAddresses()).containsExactly("203.0.113.50");
    }

    @Test
    void aForgedXForwardedFor_changesNothing() throws Exception {
        askForAResetLink("10.0.0.7", "CF-Connecting-IP", "203.0.113.50", "X-Forwarded-For", "9.9.9.9");
        askForAResetLink("10.0.0.7", "X-Forwarded-For", "9.9.9.9");   // and without the proxy's header at all: the connection, never the forgery
        assertThat(recordedAddresses()).containsExactly("203.0.113.50", "10.0.0.7");
    }

    @Test
    void changingXForwardedForCannotEscapeTheLimitOnEmailRequests() throws Exception {
        // 10 emails per address per hour. One real address, a new forged one each time: still one address.
        for (int i = 0; i < 12; i++) askForAResetLink("10.0.0.7", "CF-Connecting-IP", "203.0.113.50", "X-Forwarded-For", "9.9.9." + i);
        var blocked = mvc.perform(post("/api/v1/auth/forgot-password").contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"nobody@example.com\"}")
                .header("CF-Connecting-IP", "203.0.113.50").header("X-Forwarded-For", "1.2.3.4").with(r -> { r.setRemoteAddr("10.0.0.7"); return r; })).andReturn();
        assertThat(blocked.getResponse().getStatus()).isEqualTo(429);
    }

    @Test
    void theApiAnswersWithStrictTransportSecurity_evenThoughTheHostEndsHttpsBeforeIt() throws Exception {
        mvc.perform(get("/api/v1/public/health")).andExpect(header().string("Strict-Transport-Security", "max-age=31536000 ; includeSubDomains"));
    }
}
