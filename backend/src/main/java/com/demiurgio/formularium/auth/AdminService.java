package com.demiurgio.formularium.auth;

import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * What an administrator can do to another member's account: look it up, give or take away moderator rights, and the recovery steps that used to need hand-written SQL.
 * <ul>
 *   <li>Who is an administrator is a row in {@code app_admins}, asked on every request and added only by hand in SQL, never through this tool.</li>
 *   <li>An administrator needs two-step verification or a passkey on their own account: this is the account that can open other people's.</li>
 *   <li>Every change asks for the administrator's own password again, needs a reason, is capped per hour, is written to the audit log, and is emailed to the member.</li>
 *   <li>Nothing here can touch another administrator, or the administrator's own account, and nothing shows a secret.</li>
 * </ul>
 */
@Service
class AdminService {
    static final String VIEW = "view_member";
    static final Set<String> CHANGES = Set.of("grant_moderator", "revoke_moderator", "reset_two_step", "remove_passkeys", "restore_password_sign_in", "sign_out_everywhere");
    static final int MAX_CHANGES_PER_HOUR = 30;
    static final int MIN_SEARCH = 3;
    private static final Duration AUDIT_KEPT = Duration.ofDays(730);

    record Status(boolean admin, boolean secondFactor) { }

    record Detail(AdminRepository.Member member, List<AdminRepository.Event> events, List<DeviceView> devices, List<AdminRepository.Action> history) { }

    record DeviceView(String description, Instant firstSeenAt, Instant lastSeenAt) { }

    private final AdminRepository repository;
    private final UserRepository users;
    private final MfaRepository mfa;
    private final PasskeyRepository passkeys;
    private final RefreshTokenRepository refreshTokens;
    private final PasswordEncoder passwords;
    private final LoginAttemptLimiter limiter;
    private final AuthEvents events;
    private final EmailSender mail;
    private final AuthProperties properties;
    private final TransactionTemplate transaction;
    private final Clock clock;

    AdminService(AdminRepository repository, UserRepository users, MfaRepository mfa, PasskeyRepository passkeys, RefreshTokenRepository refreshTokens, PasswordEncoder passwords,
                 LoginAttemptLimiter limiter, AuthEvents events, EmailSender mail, AuthProperties properties, TransactionTemplate transaction, Clock clock) {
        this.repository = repository;
        this.users = users;
        this.mfa = mfa;
        this.passkeys = passkeys;
        this.refreshTokens = refreshTokens;
        this.passwords = passwords;
        this.limiter = limiter;
        this.events = events;
        this.mail = mail;
        this.properties = properties;
        this.transaction = transaction;
        this.clock = clock;
    }

    /** For the page: is this an administrator, and is their own account secured well enough to act as one. Never an error, so the page can simply hide the link. */
    Status status(UUID adminId) {
        boolean admin = repository.isAdmin(adminId);
        return new Status(admin, admin && hasSecondFactor(adminId));
    }

    List<AdminRepository.Member> search(UUID adminId, String query) {
        requireAdmin(adminId);
        String q = query == null ? "" : query.strip().toLowerCase();
        if (q.length() < MIN_SEARCH) throw new ApiException(HttpStatus.BAD_REQUEST, "query_too_short", "Type at least " + MIN_SEARCH + " characters of the email address or username.");
        return repository.search("%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%");
    }

    /** Opening a member's page is itself recorded: looking at someone's account is something to be able to account for. */
    Detail view(UUID adminId, UUID memberId) {
        UserAccount admin = requireAdmin(adminId);
        AdminRepository.Member member = repository.find(memberId).orElseThrow(AdminService::notFound);
        repository.record(adminId, admin.email(), memberId, member.email(), VIEW, "lookup", clock.instant());
        return detail(member);
    }

    Detail act(UUID adminId, UUID memberId, AuthRequests.AdminAction request, String ip, String userAgent) {
        UserAccount admin = requireAdmin(adminId);
        String action = request.action();
        if (!CHANGES.contains(action)) throw new ApiException(HttpStatus.BAD_REQUEST, "unknown_action", "That is not something this tool does.");
        String reason = request.reason().strip();
        if (reason.length() < 3) throw new ApiException(HttpStatus.BAD_REQUEST, "reason_required", "Say why, in a few words. It is kept in the audit log.");
        if (admin.passwordHash() == null) throw new ApiException(HttpStatus.FORBIDDEN, "admin_needs_password", "Your own account needs a password: it is asked for each time.");
        Instant now = clock.instant();
        if (repository.changesSince(adminId, now.minus(Duration.ofHours(1))) >= MAX_CHANGES_PER_HOUR) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "too_many_actions", "That is a lot of changes in an hour. Wait a while.");
        }
        limiter.checkPasswordChange(adminId, ip);
        String password = request.password();
        if (password == null || password.isEmpty() || password.getBytes(StandardCharsets.UTF_8).length > 72 || !passwords.matches(password, admin.passwordHash())) {
            events.record(AuthEvents.PASSWORD_CHANGE_FAILED, null, ip, adminId, userAgent, now);
            throw new ApiException(HttpStatus.UNAUTHORIZED, "invalid_credentials", "Your password is not right.");
        }
        UserAccount target = users.findById(memberId).orElseThrow(AdminService::notFound);
        if (target.guest()) throw new ApiException(HttpStatus.CONFLICT, "guest_account", "That is a temporary demo account.");
        if (target.admin() || target.id().equals(adminId)) throw new ApiException(HttpStatus.CONFLICT, "admin_account", "This tool does not act on administrator accounts.");

        String notice = transaction.execute(status -> {
            String text = apply(action, target);
            repository.record(adminId, admin.email(), memberId, target.email(), action, reason, now);
            events.record(AuthEvents.ADMIN_ACTION, null, null, memberId, null, now);   // no address: the member's own export must not show where the administrator was
            return text;
        });
        tell(target, notice);
        return detail(repository.find(memberId).orElseThrow(AdminService::notFound));
    }

    /** Does the change and returns what the member is told. Throws 409 when there is nothing to do, so a click on a stale page changes nothing and says so. */
    private String apply(String action, UserAccount target) {
        UUID id = target.id();
        switch (action) {
            case "grant_moderator" -> {
                if (!repository.grantModerator(id)) throw nothingToDo("This member is already a moderator.");
                return "You were made a moderator of the Formularium community.";
            }
            case "revoke_moderator" -> {
                if (!repository.revokeModerator(id)) throw nothingToDo("This member is not a moderator.");
                return "Your moderator rights in the Formularium community were removed.";
            }
            case "reset_two_step" -> {
                if (mfa.findFactor(id).isEmpty()) throw nothingToDo("Two-step verification is not switched on for this member.");
                mfa.deleteFactor(id);
                return "Two-step verification was switched off on your account, and its recovery codes were removed. You can switch it on again in your settings.";
            }
            case "remove_passkeys" -> {
                if (repository.deletePasskeys(id) == 0) throw nothingToDo("This member has no passkeys.");
                if (target.passwordLoginDisabledAt() != null) users.setPasswordLoginDisabled(id, null);   // otherwise nothing would be left to sign in with
                return "All the passkeys on your account were removed, and signing in with your password works again. You can add a passkey again in your settings.";
            }
            case "restore_password_sign_in" -> {
                if (target.passwordLoginDisabledAt() == null) throw nothingToDo("Password sign-in is already on.");
                users.setPasswordLoginDisabled(id, null);
                return "Signing in with your password was switched back on.";
            }
            default -> {   // sign_out_everywhere
                refreshTokens.revokeAllForUser(id);
                return "Every device signed in to your account was signed out.";
            }
        }
    }

    private void tell(UserAccount target, String notice) {
        mail.send(target.email(), "A change was made to your Formularium account",
                "Hello " + target.username() + ",\n\nAt your request, or to protect your account, an administrator of Formularium made a change to it:\n\n" + notice
                        + "\n\nIf you did not ask for this, write to contact@formularium.dev right away, and choose a new password with \"Forgot your password?\" on the sign-in form: "
                        + properties.appUrl());
    }

    private Detail detail(AdminRepository.Member member) {
        List<DeviceView> devices = repository.devices(member.id()).stream().map(d -> new DeviceView(UserAgents.describe(d.userAgent()), d.firstSeenAt(), d.lastSeenAt())).toList();
        return new Detail(member, repository.recentEvents(member.id()), devices, repository.actionsOn(member.id()));
    }

    /** Daily: the audit log is kept two years. */
    int purgeAudit() { return repository.deleteOlderThan(clock.instant().minus(AUDIT_KEPT)); }

    private UserAccount requireAdmin(UUID adminId) {
        if (!repository.isAdmin(adminId)) throw new ApiException(HttpStatus.FORBIDDEN, "forbidden", "Only administrators can do this.");
        if (!hasSecondFactor(adminId)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "admin_needs_second_factor", "Switch on two-step verification or add a passkey on your own account first: this account can open other people's.");
        }
        return users.findById(adminId).orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "no_session", "Sign in again."));
    }

    private boolean hasSecondFactor(UUID adminId) {
        return mfa.findFactor(adminId).filter(MfaRepository.Factor::enabled).isPresent() || passkeys.countUsed(adminId) > 0;
    }

    private static ApiException notFound() { return new ApiException(HttpStatus.NOT_FOUND, "not_found", "There is no such member."); }

    private static ApiException nothingToDo(String message) { return new ApiException(HttpStatus.CONFLICT, "nothing_to_do", message); }
}
