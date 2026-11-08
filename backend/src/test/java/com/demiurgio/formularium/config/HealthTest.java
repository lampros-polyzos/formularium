package com.demiurgio.formularium.config;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class HealthTest {
    @Autowired private MockMvc mvc;

    @Test
    void answersWithoutSigningIn_forThePlatformsHealthCheck() throws Exception {
        mvc.perform(get("/api/v1/public/health")).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("ok"));
    }

    @Test
    void isTheOnlyThingOpenAtThatPath_everythingElseStillNeedsSignIn() throws Exception {
        mvc.perform(post("/api/v1/public/health")).andExpect(status().isUnauthorized());   // only GET is public
        mvc.perform(get("/api/v1/formulas")).andExpect(status().isUnauthorized());
    }
}
