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

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/** GUEST_ENABLED=false switches "Try the demo" off, and nothing is created. */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = "auth.guest.enabled=false")
class GuestDisabledTest {
    @Autowired private MockMvc mvc;
    @Autowired private JdbcTemplate jdbc;

    @Test
    void whenSwitchedOff_noGuestIsCreated() throws Exception {
        long before = jdbc.queryForObject("select count(*) from app_users where guest_expires_at is not null", Long.class);
        MvcResult result = mvc.perform(post("/api/v1/auth/guest").contentType(MediaType.APPLICATION_JSON).content("{}")).andReturn();
        assertThat(result.getResponse().getStatus()).isEqualTo(503);
        assertThat((String) JsonPath.read(result.getResponse().getContentAsString(), "$.error.code")).isEqualTo("demo_unavailable");
        assertThat(jdbc.queryForObject("select count(*) from app_users where guest_expires_at is not null", Long.class)).isEqualTo(before);
    }
}
