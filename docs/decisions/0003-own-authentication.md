# 0003. Own authentication: short-lived access token plus rotating refresh cookie

Status: Accepted

## Context
With Supabase handling sign-in, the Spring backend had no notion of who was calling. Moving sign-in into the backend means choosing how sessions work, and getting the security details right.

## Decision
- **Access token:** a JWT (HS256) valid for 15 minutes, kept only in the browser's memory, sent as `Authorization: Bearer`. No stored session on the server.
- **Refresh token:** random 256 bits in an `HttpOnly`, `SameSite` cookie scoped to `/api/v1/auth`, stored in the database only as a SHA-256 hash. Each use swaps it for a new one; reuse of an old one (past a 10-second grace for two racing tabs) revokes the whole sign-in family.
- **Other:** Google sign-in by verifying Google's ID token on the server, Cloudflare Turnstile on the forms, a sign-in attempt limit, and generic answers that do not reveal which emails have accounts.

## Consequences
- **Good:** scripts on the page cannot read the long-lived credential, a stolen refresh token is detected, and the API stays stateless between refreshes.
- **Cost:** more security-sensitive code to own and test. The attempt limit is in memory, so it needs a shared store before running several instances. A short access token cannot be revoked early, which is why it is short.
- **Staying signed in:** the client renews the access token a minute before it expires, and again when the tab comes back or the network returns. It signs you out only when the server says the sign-in is over (401); a server that is down, busy or restarting (network error, 5xx, 429) never does: the session is kept and renewal is retried. See the [journal](../engineering-journal.md).
- Passwords are hashed with bcrypt; because bcrypt reads only 72 bytes, longer passwords are refused rather than silently cut.
