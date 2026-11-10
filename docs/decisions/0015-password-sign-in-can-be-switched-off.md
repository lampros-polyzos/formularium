# 0015. Password sign-in can be switched off, once a passkey has proved it works

Status: Accepted

Date: 2026-11-10

## Context
[ADR 0014](0014-passkeys-as-a-full-sign-in.md) added passkeys and said what they leave open: protection holds only for the sign-ins that use one, and a password (with its code) can still be phished. The way to close that is to let an account refuse its own password. It is also the easiest feature in the system to get wrong, in two ways:
- **Locking the owner out.** With the password refused, a passkey is the only way in. A passkey that was registered but never used might not work on the next device, and removing the last one would leave nothing.
- **Turning it against the owner.** Someone with a stolen session could switch the protection off, or switch the password off to shut the owner out.

Other shapes were considered. Passkey-only accounts for everyone is the end state, but needs account recovery designed first. Deleting the password hash when it is switched off is irreversible and makes recovery harder. Requiring a fresh passkey signature at the moment of switching off is the strongest proof, but needs a second browser flow built beside the sign-in one.

## Decision
- **Each account has a switch**, a date in `app_users.password_login_disabled_at` (empty means on, as it is for everyone today). The password hash is kept, so the change is reversible and the reset flow is unchanged. Google sign-in is a separate way in and is not affected.
- **Switching off needs a passkey that has signed in before** (`last_used_at`), and the account password. Switching back on needs the password. The password limits are shared with changing it. Asking for the state the account already has changes nothing, signs nobody out and sends no email.
- **Once off, the right password is refused** with a message that says why, but only after the password was checked, so a guesser learns nothing: a wrong password and an unknown address are answered exactly as before. The refusal comes before the email-confirmed and two-step steps, so no code is asked for and none can be relayed. It is not counted as a failed guess, and is recorded.
- **Switching off ends every other sign-in**, keeping the one in use (somebody who got in with the password earlier is out), and the account's address is told, both ways.
- **The last passkey known to work cannot be removed** while it is off. Removing one is refused if it would leave no passkey that has signed in.
- **A password reset by email switches it back on**, and signs everything out as it always did. The mailbox is the way back in for someone who has lost every device, as it is for any account.

## Consequences
- **Good:** an account that opts in can no longer be taken over through the sign-in form: a fake site can copy a password and a code, but not a passkey. It is reversible, nothing is deleted, and every lockout path found is closed: no passkey, an unproven one, removing the last one, a lost device (the email route).
- **Cost:** two more places to understand in the sign-in code, and one more column to read in every user query, so the migration has to be applied before the code.
- **Not covered:**
  - The switch is opt-in, and a password stays phishable until a member uses it.
  - The account is only as safe as its mailbox: whoever controls it can reset the password, which switches password sign-in back on. That is no weaker than any account today, but it means this protects against phishing the site, not against losing the email account.
  - "Has signed in before" proves a passkey worked at some earlier time, not now.
  - Google sign-in, if linked, stays a way in.
  - Someone who has lost every passkey and the mailbox can only be helped by an operator (the SQL is in [security.md](../security.md)).
