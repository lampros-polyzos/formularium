# 0016. Alerts for a sign-in from a browser the account has not been seen on

Status: Accepted

Date: 2026-11-10

## Context
Every protection so far makes a break-in harder. None of them tell the owner that one has happened, and a stolen password or passkey that works is silent. The usual remedy is an email: "someone signed in from a browser we have not seen". Doing it well depends on one question: what is "a browser we have not seen"?
- **By address.** Addresses change constantly (phones, travel, home networks), so most alerts would be false, and people learn to ignore them.
- **By browser fingerprint.** Unreliable and invasive: collecting enough detail to tell browsers apart is exactly the tracking this app avoids elsewhere.
- **By a cookie the browser keeps after a sign-in.** Reliable for the case that matters (the same browser, again), costs nothing for people who never see an alert, and identifies a browser, not a person.

## Decision
- **A device cookie**, `device_id`: 256 random bits, HttpOnly, scoped to the auth endpoints, same attributes as the sign-in cookie, kept 400 days (the longest a browser allows). The server stores only a SHA-256 hash of it, with the browser's identification string and the first and last dates, **per account**. One browser used for two accounts is two rows, and a cookie that is known for one account proves nothing for another.
- **A sign-in from a browser the account does not know sends an email** with when, which browser ("Chrome on Windows", a rough reading of the identification string), the network address, how the person signed in, and what to do if it was not them. Every way of signing in counts (password, the authenticator code, a passkey, Google), at the moment the session starts: the password step of two-step verification starts no session and reports nothing. A renewal of a session, a failed attempt and the demo account are not sign-ins.
- **The first browser an account is ever seen on is learnt silently.** There is nothing to compare with, and it means accounts that exist today do not get an alert at their next sign-in.
- **At most five alert emails per account per day.** Every new browser is still recorded in the audit trail, so an attacker cannot be used to flood a mailbox, and the owner is still told.
- **It can never make a sign-in fail.** A problem noting the browser or sending the email is logged, and the person is signed in as usual.
- Browsers not seen for 400 days are deleted daily, and everything goes with the account.

## Consequences
- **Good:** a stolen password or passkey that is used from somewhere new produces an email the owner can act on, with no cost to anyone who is not attacked: no prompts, no extra steps, no new data about the person beyond a hashed random identifier and what the browser already says about itself.
- **Cost:** a second cookie (the privacy text lists it), a small table, and an email that has to be worded carefully, since it tells someone their account may be in danger.
- **Honest limits:**
  - A browser whose cookies were cleared, a private window and a new device all count as new, so the owner will sometimes be told about themselves. The email says so and asks for no action in that case.
  - An attacker who also obtained the cookie would not be reported, which needs more than a password or a passkey.
  - The email goes to the account's address, so it helps only while that mailbox is still the owner's.
  - Browsers are not listed anywhere yet, so there is no way to see or remove one: a list with a sign-out button is the obvious next step.
  - The address in the email is the one the server saw, behind the proxy header the host sets ([security.md](../security.md)).
