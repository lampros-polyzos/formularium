package com.demiurgio.formularium.auth;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

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

    public record Google(@NotBlank @Size(max = 4096) String idToken) { }
}
