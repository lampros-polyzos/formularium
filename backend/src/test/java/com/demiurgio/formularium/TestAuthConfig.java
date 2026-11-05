package com.demiurgio.formularium;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.MockMvcBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import java.time.Instant;
import java.util.UUID;

/**
 * For tests about what an endpoint does rather than who may call it: every request is made with a valid access token, as if signed in.
 * Use with {@code @Import(TestAuthConfig.class)}.
 */
@TestConfiguration
public class TestAuthConfig {

    @Bean
    MockMvcBuilderCustomizer signedInByDefault(JwtEncoder encoder) {
        Instant now = Instant.now();
        JwtClaimsSet claims = JwtClaimsSet.builder().issuer("formularium-test").subject(UUID.randomUUID().toString()).issuedAt(now).expiresAt(now.plusSeconds(3600)).build();
        String token = encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims)).getTokenValue();
        return builder -> builder.defaultRequest(MockMvcRequestBuilders.get("/").header("Authorization", "Bearer " + token));
    }
}
