# 0013. "Try the demo" makes a temporary guest account for each visitor

Status: Accepted

Date: 2026-11-10

## Context
The app is meant to be looked at by people who will not spend time signing up: recruiters, reviewers, curious visitors. Sign-up needs an email address, a confirmation link and a password, which is exactly the friction a quick look cannot afford. The usual answers each have a flaw here:
- **A shared demo account with the password on the page.** Everyone shares one set of formulas, so the next visitor lands in the previous one's mess. Anyone can change its password, enable two-step verification on it, delete it, or fill its community posts with spam. It needs a reset job, and the password is public by design.
- **A read-only demo.** Safe, but the best parts of the app (balancing, saving, batches) would not work, so it shows much less than the real thing.
- **Skipping accounts altogether** (state only in the browser). The studio, stash, batches and PDFs all live in the database behind a signed-in user, so this would mean a second, different app.

## Decision
- **Each press of "Try the demo" creates a new, private, temporary account** and signs it in: `POST /api/v1/auth/guest`. It is an ordinary `app_users` row with `guest_expires_at` set, the usual starting formulas, no password, and an address under `guest.invalid`, which can never receive mail. Nothing is shared, so there is no password to leak and no mess to inherit.
- **It is deleted after 24 hours** (`GUEST_TTL_HOURS`) by an hourly job, and every foreign key to `app_users` cascades, so everything it made goes with it. Until then it renews like any session, but its refresh token cannot outlive it, and an expired guest cannot renew even if the job has not run yet.
- **Limits, because the button is open to everyone:** the same Cloudflare Turnstile check as sign-up (which only loads after the press), 10 demos per address per hour, at most 200 guests at once, and a switch to turn it off (`GUEST_ENABLED=false`).
- **What a guest may not do:** write to the community (posts, comments, ratings, reports, mutes) or set up two-step verification. The access token carries a `guest` claim, and the security rules answer such requests with `403 guest_account`, with a message that says it needs a free account. Looking at the community and using every tool still works.
- **Where it leads:** a banner on every page says the work is temporary, and "Create a free account" signs the guest out and opens the sign-up form. The guest's work is not carried over into the new account.
- **The migration comes first**, as in [ADR 0012](0012-migrations-are-sql-files-applied-by-hand.md): every user query now reads the new column.

## Consequences
- **Good:** a recruiter is in the studio, with real data to play with, one click after landing. Visitors cannot see or spoil each other's data. The feature reuses the account system, so every existing protection (ownership checks, token rotation, the audit trail, the data export) applies to guests unchanged.
- **Cost:** guests are real rows, so the database grows by up to 200 accounts' worth of starter data at a time (the ceiling is what bounds it). A guest has no quota on what it saves during its day. Someone who solves the bot check many times from many addresses could fill the 200 places and show others "busy"; the ceiling protects the database at the cost of that, and the limits and the switch are the tools. An office behind one address shares the per-address limit.
- **Not done:** turning a guest into a real account and keeping its work (the work is lost on purpose, for simplicity), and seeding a guest with a stash and a batch as well as formulas.
