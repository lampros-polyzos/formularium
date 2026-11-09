package com.demiurgio.formularium.auth;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** The email goes out as an HTTPS call, so it works where SMTP ports are blocked. A local stub stands in for Brevo. */
class BrevoMailApiTest {
    private HttpServer server;
    private final AtomicReference<String> apiKey = new AtomicReference<>();
    private final AtomicReference<String> body = new AtomicReference<>();
    private final AtomicInteger status = new AtomicInteger(201);

    @BeforeEach
    void startStub() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/v3/smtp/email", exchange -> {
            apiKey.set(exchange.getRequestHeaders().getFirst("api-key"));
            body.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            byte[] answer = "{\"messageId\":\"x\"}".getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(status.get(), answer.length);
            exchange.getResponseBody().write(answer);
            exchange.close();
        });
        server.start();
    }

    @AfterEach
    void stopStub() { server.stop(0); }

    private BrevoMailApi api(String key) { return new BrevoMailApi(key, "http://127.0.0.1:" + server.getAddress().getPort() + "/v3/smtp/email"); }

    @Test
    void isOffWithoutAKey_soTheSenderFallsBackToSmtpOrTheLog() {
        assertThat(api("").enabled()).isFalse();
        assertThat(api("   ").enabled()).isFalse();
        assertThat(api(null).enabled()).isFalse();
        assertThat(api("a-key").enabled()).isTrue();
    }

    @Test
    void sendsSenderRecipientSubjectAndTextWithTheKeyInTheHeader() {
        api(" secret-key ").send("Formularium <no-reply@formularium.dev>", "ann@example.com", "Confirm your email", "Open this link: https://formularium.dev/x?t=1");

        assertThat(apiKey.get()).isEqualTo("secret-key");
        assertThat(body.get())
                .contains("\"name\":\"Formularium\"").contains("\"email\":\"no-reply@formularium.dev\"")
                .contains("\"email\":\"ann@example.com\"")
                .contains("\"subject\":\"Confirm your email\"")
                .contains("\"textContent\":\"Open this link: https://formularium.dev/x?t=1\"");
    }

    @Test
    void acceptsAPlainSenderAddressToo() {
        api("k").send("no-reply@formularium.dev", "ann@example.com", "s", "b");
        assertThat(body.get()).contains("\"email\":\"no-reply@formularium.dev\"").doesNotContain("\"name\"");
    }

    @Test
    void failsLoudlyWhenBrevoRefuses_sotheSenderCanLogIt() {
        status.set(401);
        assertThatThrownBy(() -> api("wrong").send("Formularium <no-reply@formularium.dev>", "ann@example.com", "s", "b")).isInstanceOf(RuntimeException.class);
    }

    @Test
    void failsWhenNothingIsListening() {
        BrevoMailApi dead = new BrevoMailApi("k", "http://127.0.0.1:1/v3/smtp/email");
        assertThatThrownBy(() -> dead.send("a@b.c", "ann@example.com", "s", "b")).isInstanceOf(RuntimeException.class);
    }
}
