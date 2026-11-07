# 0007. Email confirmation required, links stored as hashes

Status: Accepted

Date: 2026-11-06

## Context
Sign-up without confirming the address lets anyone register with someone else's email, and password reset needs a trustworthy address to send to.

## Decision
- A new email account cannot sign in until its address is confirmed by a one-time link (24 hours). Google accounts count as confirmed.
- "Forgot password" sends a one-time link (1 hour) that sets a new password, confirms the address and signs the account out everywhere.
- Links are random 256-bit tokens stored only as SHA-256 hashes, usable once, and a newer link cancels older ones. Asking for a link is limited to once a minute per account and needs the bot check.
- The endpoints answer the same whether or not the email has an account.
- Mail goes through any SMTP server; without one configured, emails are only logged (development). `AUTH_REQUIRE_VERIFIED_EMAIL=false` turns the requirement off for local work.

## Consequences
- **Good:** no accounts on other people's addresses; a leaked database copy cannot be used to take over an account through unused links.
- **Cost:** sign-up needs a working mail setup and adds a step for new members; deliverability (SPF/DKIM, a dedicated sending domain) is the operator's job. Sign-up itself still says "already in use" for an existing email, a deliberate trade for a clearer message.
