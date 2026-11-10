package com.demiurgio.formularium.auth;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;

/**
 * Sends the plain-text emails of the account flows. Three ways, in this order: Brevo's HTTPS API (BREVO_API_KEY; the one that works on hosts that block
 * SMTP), an SMTP server (MAIL_HOST), or, with neither, the log, links included, so the flow can be tried in development.
 */
@Component
public class EmailSender {
    private static final Logger log = LoggerFactory.getLogger(EmailSender.class);

    private final BrevoMailApi brevo;
    private final ObjectProvider<JavaMailSender> smtp;
    private final AuthProperties properties;
    private final boolean smtpConfigured;

    /**
     * @param smtpHost spring.mail.host. Spring makes a mail sender even when this is EMPTY (the setting exists, so its condition holds), and such a sender fails
     *                 on every email with "no password specified", so an empty host has to mean "no SMTP" here, or the log fallback below is never reached.
     */
    EmailSender(BrevoMailApi brevo, ObjectProvider<JavaMailSender> smtp, AuthProperties properties, @Value("${spring.mail.host:}") String smtpHost) {
        this.brevo = brevo;
        this.smtp = smtp;
        this.properties = properties;
        this.smtpConfigured = smtpHost != null && !smtpHost.isBlank();
    }

    public void send(String to, String subject, String body) {
        try {
            if (brevo.enabled()) {
                brevo.send(properties.mailFrom(), to, subject, body);
                return;
            }
            JavaMailSender sender = smtpConfigured ? smtp.getIfAvailable() : null;
            if (sender == null) {
                log.info("Email (no mail service configured, so it is only logged)\nTo: {}\nSubject: {}\n\n{}", to, subject, body);
                return;
            }
            SimpleMailMessage message = new SimpleMailMessage();
            message.setFrom(properties.mailFrom());
            message.setTo(to);
            message.setSubject(subject);
            message.setText(body);
            sender.send(message);
        } catch (RuntimeException e) {
            // The caller answers the same whether or not the email went out (it must not reveal which addresses have accounts), so the failure is logged here
            log.error("Could not send an email to {}", to, e);
        }
    }
}
