package com.demiurgio.formularium.auth;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import tools.jackson.databind.JsonNode;

import java.util.UUID;

/** The request bodies of the sign-in endpoints. */
public final class AuthRequests {
    private AuthRequests() { }

    public record Register(
            @NotBlank @Email @Size(max = 320) String email,
            // bcrypt only looks at the first 72 bytes, so longer passwords are refused instead of silently cut
            @NotBlank @Size(min = 10, max = 72, message = "must be between 10 and 72 characters") String password,
            @NotBlank @Size(min = 3, max = 30) @Pattern(regexp = "[A-Za-z0-9_.-]+", message = "may only contain letters, digits, dot, dash and underscore") String username,
            String captchaToken) { }

    public record Login(@NotBlank @Size(max = 320) String email, @NotBlank @Size(max = 72) String password, String captchaToken) { }

    /** A new display name. The same rules as at sign-up. */
    public record Profile(
            @NotBlank @Size(min = 3, max = 30) @Pattern(regexp = "[A-Za-z0-9_.-]+", message = "may only contain letters, digits, dot, dash and underscore") String username) { }

    /** The link from the email. */
    public record Token(@NotBlank @Size(max = 200) String token) { }

    /** Asks for an email (a new confirmation link, or a password reset link). */
    public record EmailOnly(@NotBlank @Email @Size(max = 320) String email, String captchaToken) { }

    public record ResetPassword(
            @NotBlank @Size(max = 200) String token,
            @NotBlank @Size(min = 10, max = 72, message = "must be between 10 and 72 characters") String password) { }

    /** "Try the demo": nothing but the bot check. */
    public record Guest(String captchaToken) { }

    public record Google(@NotBlank @Size(max = 4096) String idToken) { }

    /** The second step of signing in: the one-time token from the first step, and a code from the app (or a recovery code). */
    public record MfaLogin(@NotBlank @Size(max = 200) String mfaToken, @NotBlank @Size(max = 64) String code) { }

    /** Starting to set up two-step verification. The password is required for accounts that have one. */
    public record MfaSetup(@Size(max = 200) String password) { }

    /** The password that changing passkeys asks for (empty for an account that has none). */
    public record PasskeyPassword(@Size(max = 200) String password) { }

    /** What the browser made for a new passkey, with the id of the challenge it answers; {@code name} is how the member will recognise it. */
    public record PasskeyRegistration(@NotNull UUID challengeId, @NotNull JsonNode credential, @Size(max = 60) String name) { }

    /** What the browser signed for a passkey sign-in, with the id of the challenge it answers. */
    public record PasskeyLogin(@NotNull UUID challengeId, @NotNull JsonNode credential) { }

    /** A code from the app, or a recovery code. */
    public record MfaCode(@NotBlank @Size(max = 64) String code) { }
}
