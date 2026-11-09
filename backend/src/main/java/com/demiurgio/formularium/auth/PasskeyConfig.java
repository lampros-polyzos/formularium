package com.demiurgio.formularium.auth;

import com.yubico.webauthn.RelyingParty;
import com.yubico.webauthn.data.RelyingPartyIdentity;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Who the site says it is when it asks for a passkey. A passkey is bound to the <b>relying party id</b>, a domain, and the browser only hands it to a page
 * of that domain: this is what makes passkeys phishing-resistant, and why a wrong value here silently breaks every sign-in.
 * <ul>
 *   <li>WEBAUTHN_RP_ID: the registrable domain of the website, without scheme or port. Production: {@code formularium.dev}. Development: {@code localhost}.</li>
 *   <li>WEBAUTHN_ORIGINS: the exact addresses of the website that may ask, separated by commas. Production: {@code https://formularium.dev}.</li>
 * </ul>
 * Changing the id later makes every registered passkey stop working, so choose it once.
 */
@Configuration
class PasskeyConfig {

    @Bean
    RelyingParty relyingParty(PasskeyCredentials credentials,
                              @Value("${auth.passkeys.rp-id:localhost}") String rpId,
                              @Value("${auth.passkeys.rp-name:Formularium}") String rpName,
                              @Value("${auth.passkeys.origins:http://localhost:5173}") String origins) {
        Set<String> allowed = Arrays.stream(origins.split(",")).map(String::trim).filter(o -> !o.isEmpty()).collect(Collectors.toSet());
        return RelyingParty.builder()
                .identity(RelyingPartyIdentity.builder().id(rpId.trim()).name(rpName).build())
                .credentialRepository(credentials)
                .origins(allowed)
                .allowOriginPort(false)         // exactly the addresses listed, nothing near them
                .allowOriginSubdomain(false)
                .build();
    }
}
