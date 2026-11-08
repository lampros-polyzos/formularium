# 0011. Two-step verification with an authenticator app

Status: Accepted

Date: 2026-11-08

Closes the largest gap named in [0010](0010-keep-own-authentication-and-harden-it.md): with a password as the only barrier, a leaked or guessed password was enough to take an account.

## Context
Members can protect their account with a second factor. It had to cost nothing to run, work without a phone number, and fit the existing sign-in (own tokens, refresh cookie, Google sign-in).

## Alternatives considered
| Option | Why not (now) |
|---|---|
| SMS codes | Costs per message, needs phone numbers (more personal data), and is weak against SIM swapping |
| Codes by email | The inbox is already the way to reset a password, so it adds no independent factor |
| Passkeys / WebAuthn | The strongest and phishing-resistant, and the next step ([roadmap](../roadmap.md)). More work: registration, browser support and a recovery story of their own |
| Push approval from an app | Needs a mobile app and a push service |
| **Authenticator app (TOTP, RFC 6238)** | **Free, offline, no personal data, supported by every authenticator app. Chosen.** |

## Decision
- **Codes.** Standard 6-digit, 30-second TOTP, one step either side accepted for clock drift. Implemented directly on `javax.crypto` (about 100 lines) and checked against the RFC's published test vectors.
- **A code works once.** The step of the last accepted code is stored, and updated with a conditional `UPDATE`, so a code seen over a shoulder, or two requests racing, cannot be reused.
- **The secret is encrypted at rest** with AES-256-GCM, bound to the member's id (a copied ciphertext does not decrypt for another account). The key is its own setting, `AUTH_MFA_ENCRYPTION_KEY`, deliberately not derived from the token secret: rotating the token secret is routine and must not break everyone's authenticator. With no key configured the feature is off, never stored unprotected.
- **Signing in is two requests.** A right password (or Google sign-in) does not start a session: it returns a one-time challenge (random, stored hashed, 5 minutes, 5 wrong tries) and no cookie. A right code exchanges it for the session. This covers every way of signing in, Google included, so enabling it means every sign-in needs it. The challenge is not a JWT, so it can never be mistaken for an access token.
- **Guessing is limited**: 5 tries per challenge, 10 wrong codes per account and 30 per address in 15 minutes, all recorded in the audit trail.
- **Setting up needs the password** (when the account has one), so a stolen access token cannot bind the account to someone else's phone and lock the owner out. **Turning off, or getting new recovery codes, needs a code.**
- **10 recovery codes**, single use, stored only as hashes and shown once. A recovery code works anywhere a code does.
- **A password reset does not turn it off.** Having the inbox must not be a way around the second step.

## Consequences
- **Good:** a leaked or guessed password is no longer enough; no running cost; no new personal data; the design is covered by 28 backend and 27 frontend tests, including the replay, throttling, expiry and "stolen token" cases.
- **Cost:** someone who loses both the phone and the recovery codes cannot get in by themselves. There is no self-service path on purpose (it would be the weak point). The operator can switch it off after checking who is asking: the steps are in [docs/security.md](../security.md).
- **Cost:** `AUTH_MFA_ENCRYPTION_KEY` must be kept and backed up. If it is lost, every member's authenticator stops working. Rotating it is not supported yet.
- **Not covered:** phishing. A fake site can relay a code in real time; only passkeys fix that.
