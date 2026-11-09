package com.demiurgio.formularium.auth;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import static org.assertj.core.api.Assertions.assertThat;

/** Which address the sign-in limits count. A visitor must never be able to choose it. */
class ClientAddressTest {

    private static MockHttpServletRequest request(String connection, String... headers) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRemoteAddr(connection);
        for (int i = 0; i < headers.length; i += 2) request.addHeader(headers[i], headers[i + 1]);
        return request;
    }

    @Test
    void withoutAConfiguredHeader_theConnectionAddressIsUsed_andEveryForwardingHeaderIsIgnored() {
        ClientAddress address = new ClientAddress("");
        assertThat(address.of(request("10.0.0.7"))).isEqualTo("10.0.0.7");
        assertThat(address.of(request("10.0.0.7", "X-Forwarded-For", "9.9.9.9", "CF-Connecting-IP", "8.8.8.8", "True-Client-IP", "7.7.7.7"))).isEqualTo("10.0.0.7");
        assertThat(new ClientAddress(null).of(request("10.0.0.7", "CF-Connecting-IP", "8.8.8.8"))).isEqualTo("10.0.0.7");
    }

    @Test
    void withAConfiguredHeader_thatHeadersAddressIsUsed() {
        ClientAddress address = new ClientAddress("CF-Connecting-IP");
        assertThat(address.of(request("10.0.0.7", "CF-Connecting-IP", "203.0.113.50"))).isEqualTo("203.0.113.50");
        assertThat(address.of(request("10.0.0.7", "cf-connecting-ip", " 203.0.113.50 "))).isEqualTo("203.0.113.50");   // header names are case-insensitive; spaces do not count
        assertThat(address.of(request("10.0.0.7", "CF-Connecting-IP", "2001:db8::1"))).isEqualTo("2001:db8::1");
    }

    @Test
    void xForwardedFor_isNeverTheSource_whatEverTheVisitorWritesInIt() {
        ClientAddress address = new ClientAddress("CF-Connecting-IP");
        assertThat(address.of(request("10.0.0.7", "CF-Connecting-IP", "203.0.113.50", "X-Forwarded-For", "9.9.9.9, 203.0.113.50"))).isEqualTo("203.0.113.50");
        assertThat(address.of(request("10.0.0.7", "X-Forwarded-For", "9.9.9.9"))).isEqualTo("10.0.0.7");   // the configured header is missing: the connection, not the forgery
    }

    @Test
    void anythingThatIsNotASingleAddress_isIgnoredNotStored() {
        ClientAddress address = new ClientAddress("CF-Connecting-IP");
        for (String junk : new String[]{"203.0.113.50, 9.9.9.9", "not an address", "<script>alert(1)</script>", "", "1", "a".repeat(100), "203.0.113.50\r\nX-Evil: 1"}) {
            assertThat(address.of(request("10.0.0.7", "CF-Connecting-IP", junk))).as(junk).isEqualTo("10.0.0.7");
        }
    }
}
