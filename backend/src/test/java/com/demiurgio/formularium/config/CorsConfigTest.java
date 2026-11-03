package com.demiurgio.formularium.config;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = "cors.allowed-origin=https://app.example.com, http://localhost:5173")
@AutoConfigureMockMvc
class CorsConfigTest {

    @Autowired private MockMvc mvc;

    private org.springframework.test.web.servlet.ResultActions preflight(String origin, String path) throws Exception {
        return mvc.perform(options(path)
                .header("Origin", origin)
                .header("Access-Control-Request-Method", "POST")
                .header("Access-Control-Request-Headers", "content-type"));
    }

    @Test
    void allowsEveryConfiguredOriginOnEveryApiEndpoint() throws Exception {
        for (String path : new String[]{"/api/v1/validate", "/api/v1/export/pif", "/api/v1/export/sourcing", "/api/v1/export/batch-record"}) {
            preflight("https://app.example.com", path)
                    .andExpect(status().isOk())
                    .andExpect(header().string("Access-Control-Allow-Origin", "https://app.example.com"));
            preflight("http://localhost:5173", path)
                    .andExpect(status().isOk())
                    .andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:5173"));
        }
    }

    @Test
    void rejectsOtherOrigins() throws Exception {
        preflight("https://evil.example.org", "/api/v1/validate").andExpect(status().isForbidden());
    }
}
