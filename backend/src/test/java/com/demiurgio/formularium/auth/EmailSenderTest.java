package com.demiurgio.formularium.auth;

import jakarta.mail.internet.MimeMessage;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Which way an email goes out: Brevo's API, an SMTP server, or only the log. An empty mail host must mean "no SMTP", whatever Spring builds around it. */
class EmailSenderTest {

    private static final AuthProperties PROPERTIES = new AuthProperties("0123456789012345678901234567890123456789", null, null, null, null, null, false, null, false, null,
            "Formularium <no-reply@formularium.dev>", null, null, null);

    private final JavaMailSender smtp = mock(JavaMailSender.class);

    @SuppressWarnings("unchecked")
    private ObjectProvider<JavaMailSender> provider() {
        ObjectProvider<JavaMailSender> provider = mock(ObjectProvider.class);
        when(provider.getIfAvailable()).thenReturn(smtp);   // Spring DOES build a sender, even for an empty host
        return provider;
    }

    private EmailSender sender(String brevoKey, String smtpHost) {
        return new EmailSender(new BrevoMailApi(brevoKey, "http://127.0.0.1:1/never-called"), provider(), PROPERTIES, smtpHost);
    }

    @Test
    void withNoMailServiceConfigured_theEmailIsOnlyLogged_andNothingIsAttempted() {
        for (String blank : new String[]{"", "   ", null}) {
            sender("", blank).send("ann@example.com", "Subject", "Body with a link");
        }
        verify(smtp, never()).send(any(SimpleMailMessage.class));
        verify(smtp, never()).send(any(MimeMessage.class));
    }

    @Test
    void withAnSmtpHost_theEmailGoesThroughSmtp() {
        sender("", "smtp.example.com").send("ann@example.com", "Subject", "Body");

        org.mockito.ArgumentCaptor<SimpleMailMessage> sent = org.mockito.ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(smtp).send(sent.capture());
        assertThat(sent.getValue().getTo()).containsExactly("ann@example.com");
        assertThat(sent.getValue().getSubject()).isEqualTo("Subject");
        assertThat(sent.getValue().getFrom()).isEqualTo("Formularium <no-reply@formularium.dev>");
    }

    @Test
    void aFailingSmtpServerNeverBreaksTheRequest() {
        doThrow(new org.springframework.mail.MailSendException("down")).when(smtp).send(any(SimpleMailMessage.class));
        assertThatCode(() -> sender("", "smtp.example.com").send("ann@example.com", "Subject", "Body")).doesNotThrowAnyException();
    }

    @Test
    void theBrevoApiComesFirst_andSmtpIsNotTriedBesideIt() {
        // the API address refuses connections, which is logged and swallowed; the point is that SMTP is not used as well
        assertThatCode(() -> sender("a-key", "smtp.example.com").send("ann@example.com", "Subject", "Body")).doesNotThrowAnyException();
        verify(smtp, never()).send(any(SimpleMailMessage.class));
    }
}
