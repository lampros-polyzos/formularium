# 0017. An admin tool for moderators and account recovery

Status: Accepted

Date: 2026-11-10

## Context
Two jobs had to be done by hand in the database's SQL editor: giving someone moderator rights, and helping a member who is locked out (switch off two-step verification after a lost phone, remove a lost device's passkey, switch password sign-in back on). Hand-written SQL has no record of who did it, no check that the person asking is entitled, no email to the member, and one slip of a `where` clause changes everyone.

But a tool that can do those things is also the most valuable thing to attack: whoever controls an administrator's session can open other people's accounts. So the question is less "what should it do" than "what must it never allow".

## Decision
- **Scope: moderators and recovery only.** Look a member up and see the state of the account; grant or remove moderator rights; switch two-step verification off; remove all passkeys; switch password sign-in back on; sign every device out. No deleting accounts, no reading content, no changing an email address or a password, no impersonating a member.
- **Administrators are made by hand and only by hand.** A row in `app_admins`, added in the SQL editor. The tool has no way to create one, so a hijacked administrator cannot make more. The database is asked on **every** request (not a claim in the token), so removing the row ends the rights immediately, even for a token already issued.
- **An administrator must have a second factor of their own:** two-step verification, or a passkey that has signed in. Without it the tool refuses to open and says why. This is the account that can open other people's.
- **Every change asks for the administrator's own password again**, with the same limit on wrong guesses as changing a password, so an open session on an unattended screen is not enough. It also needs a **reason**, is capped at **30 changes an hour**, and is refused when it would change nothing (a stale page cannot do anything twice).
- **Everything is recorded, and the member is told.** Each change is written to `admin_actions` with both email addresses as they were (so the record still reads after either account is deleted), the action and the reason, kept two years; looking at a member is recorded too. The member is **emailed** at once. The email says that an administrator made a change and what it was, not who, and never the internal reason; it points to the contact address if it was not asked for. In the member's own sign-in history the action appears with no network address, so that a data export never reveals where an administrator was.
- **It cannot act on an administrator, on oneself, or on a guest account.** Recovery steps against an administrator would turn the tool into a way to disarm the people who guard it.
- **Removing passkeys also switches password sign-in back on**, because otherwise a member who had turned the password off would be left with nothing to sign in with.
- **The member view shows state and nothing secret:** what is switched on, how many passkeys, a few recent events (kinds and times, no addresses), the browsers seen, and the earlier changes by administrators. Never a hash, a secret or a code.
- **The tables are not part of a member's data export** (`app_admins`, `admin_actions`): they hold administrators' addresses and are the operators' own record; the member is told by email at the time.

## Consequences
- **Good:** the two jobs are quick, consistent and accountable, the member always finds out, and an attack needs an administrator's password **and** second factor, and still leaves an email in the member's inbox and a row in the log.
- **Cost:** two tables, an endpoint family, a page, and one more place where wording matters. Granting the first administrator is still manual, deliberately.
- **Honest limits:**
  - **An administrator is trusted.** One who is dishonest, or fully compromised, can weaken a member's account (switch off two-step verification, remove passkeys, switch the password back on) and so make it easier for someone else to take over, and the member only finds out if they read the email. The controls make that costly and visible, not impossible.
  - **Identity checks are a human step.** The page reminds the administrator to verify the person asking (reply to the address on the account), but nothing here can.
  - The record is in the same database as everything else: someone who can write to the database can alter it. A copy elsewhere, or a hash chain, would be the next step if there were several administrators.
  - There is no "undo" button: each action has its opposite where one makes sense (grant and remove, passkeys can be added again, two-step verification switched on again), and the log says what was done.
