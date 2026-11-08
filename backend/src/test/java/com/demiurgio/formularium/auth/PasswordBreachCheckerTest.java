package com.demiurgio.formularium.auth;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

import static org.assertj.core.api.Assertions.assertThat;

/** Against a stand-in for the range service, so nothing here goes to the internet. */
class PasswordBreachCheckerTest {
    // SHA-1 of "password" is 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8: the service is asked for 5BAA6, and the rest stays here
    private static final String SUFFIX = "1E4C9B93F3F0682250B6CF8331B7EE68FD8";

    private HttpServer server;
    private final List<String> asked = new CopyOnWriteArrayList<>();
    private volatile int status = 200;
    private volatile String body = "";

    @BeforeEach
    void start() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/range/", exchange -> {
            asked.add(exchange.getRequestURI().getPath() + " | Add-Padding=" + exchange.getRequestHeaders().getFirst("Add-Padding"));
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(status, bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        });
        server.start();
    }

    @AfterEach
    void stop() { server.stop(0); }

    private PasswordBreachChecker checker(boolean enabled) {
        return new PasswordBreachChecker(enabled, "http://127.0.0.1:" + server.getAddress().getPort() + "/range/");
    }

    @Test
    void sendsOnlyTheFirstFiveCharactersOfTheHash_andAsksForPadding() {
        body = "0018A45C4D1DEF81644B54AB7F969B88D65:3\r\n" + SUFFIX + ":10434004\r\n";
        checker(true).isBreached("password");
        assertThat(asked).containsExactly("/range/5BAA6 | Add-Padding=true");
        assertThat(String.join("", asked)).doesNotContain("password").doesNotContain(SUFFIX);
    }

    @Test
    void recognisesAPasswordThatIsInTheList() {
        body = "0018A45C4D1DEF81644B54AB7F969B88D65:3\r\n" + SUFFIX + ":10434004\r\n011053FD0102E94D6AE2F8B83D76FAF94F6:1\r\n";
        assertThat(checker(true).isBreached("password")).isTrue();
    }

    @Test
    void acceptsAPasswordThatIsNotInTheList_andIgnoresTheDecoyLinesWithACountOfZero() {
        body = "0018A45C4D1DEF81644B54AB7F969B88D65:3\r\n" + SUFFIX + ":0\r\n";   // a decoy: same suffix, but the service says it was seen 0 times
        assertThat(checker(true).isBreached("password")).isFalse();
    }

    @Test
    void letsThePasswordThroughWhenTheServiceFails_soSigningUpDoesNotDependOnIt() {
        status = 503;
        body = SUFFIX + ":10434004";
        assertThat(checker(true).isBreached("password")).isFalse();

        server.stop(0);   // and when it cannot be reached at all
        assertThat(checker(true).isBreached("password")).isFalse();
    }

    @Test
    void doesNothingWhenSwitchedOff() {
        body = SUFFIX + ":10434004";
        assertThat(checker(false).isBreached("password")).isFalse();
        assertThat(new ArrayList<>(asked)).isEmpty();
    }
}
