# 0014. Passkeys as a full, phishing-resistant sign-in

Status: Accepted

Date: 2026-11-10

## Context
[ADR 0011](0011-two-step-verification-with-an-authenticator-app.md) added a second step, and said plainly what it cannot do: a fake website can relay a password and a six-digit code to the real one in real time. Only a credential that is **bound to the website's own domain** fixes that, and that is what a passkey (WebAuthn) is: the browser keeps a private key for `formularium.dev`, offers it only to pages of that domain, and signs a challenge that names the site. A copy relayed through a look-alike fails the check.

How to add it was a real choice:
- **As a second step after the password.** Keeps the password phishable and makes people do two things. A passkey already needs the device plus a fingerprint, face or PIN, so it is two factors on its own.
- **As a full sign-in, next to the password.** One touch, nothing typed, and phishing-resistant for everyone who uses it.
- **Passkey-only accounts.** The end state, but it needs account recovery designed first, and most members have a password today.

Writing the verification by hand was also considered, as with the authenticator codes, and rejected. TOTP is a few lines of arithmetic and can be checked against published test vectors; WebAuthn means parsing CBOR and COSE keys, authenticator data and flags, validating origins, domain hashes and signatures, and handling counters and backup flags. That is where hand-written security code goes wrong, so the verification uses Yubico's `java-webauthn-server`, the reference implementation, and the browser side uses `@simplewebauthn/browser`, a small helper that converts between the JSON the server sends and the binary the browser API wants.

## Decision
- **A passkey is a full sign-in.** Signing in is "usernameless": the browser lists the passkeys it holds for the site, the person confirms with their fingerprint, face or screen lock (user verification is **required**), and the passkey says who it belongs to. No password and no authenticator code are asked, because the passkey is both. The password stays as another way in.
- **Adding or removing one needs the account password** (when the account has one), as setting up two-step verification does, so someone who has only borrowed an open session cannot bind their own device. A guest ("Try the demo") cannot add any. At most ten per member, and each add and remove goes in the audit trail.
- **The relying party id is the website's domain**, `formularium.dev`, and the only accepted origin is `https://formularium.dev` (`WEBAUTHN_RP_ID`, `WEBAUTHN_ORIGINS`). The API at `api.formularium.dev` is not the relying party: the page is. These are chosen once.
- **Challenges are kept in the database**, five minutes, deleted as they are read, so each works once and any instance of the backend can finish what another started. Asking for one and failing are both limited per address.
- **A signature counter that goes backwards refuses the sign-in** (a copied key). Passkeys that sync between devices report a counter of zero, which is accepted.
- **No attestation.** We do not ask which make of device made a passkey, and keep none of that.
- The passkey's public key, credential id, name, dates and backup flags are stored; the private key never leaves the device, so a leaked database cannot sign anyone in.

## Consequences
- **Good:** a sign-in that a phishing site cannot relay, in one touch. A member with two-step verification does not type a code when they use a passkey. The checks that matter are tested with a software authenticator (25 tests: a different site, a tampered or foreign signature, replay, an expired challenge, a missing fingerprint, a backwards counter, ownership, limits), and once end to end in a real browser engine with a virtual authenticator against a throwaway database.
- **Cost:** a new dependency, which brings its own Jackson 2 and CBOR library beside Spring's Jackson 3 (one of them is an alpha release, pulled in transitively). The relying party id is a one-way door: moving the site to another domain makes every passkey stop working.
- **Still not covered:** passwords remain valid, so a password (and its code) can still be phished; protection holds only for the sign-ins that use a passkey, until the member switches password sign-in off ([ADR 0015](0015-password-sign-in-can-be-switched-off.md)), which is opt-in. A passkey that syncs through a cloud account or password manager is only as safe as that account, and it skips two-step verification altogether. Only Chromium has been run against a virtual authenticator; Safari and Firefox are untested by me. Passkey autofill on the sign-in form (conditional UI) is not built. Recovery rests on the password, or Google sign-in.
