package com.demiurgio.formularium.auth;

/** Checks the bot-check answer the sign-up and sign-in forms send. */
public interface CaptchaVerifier {
    /** @return true when the check passed, or when no check is configured */
    boolean verify(String token, String clientIp);
}
