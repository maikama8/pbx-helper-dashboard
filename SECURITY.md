# Security

## Reporting a vulnerability

Report a vulnerability through [GitHub private vulnerability reporting](https://github.com/maikama8/pbx-helper-dashboard/security/advisories/new). Please do not open a public issue for an unpublished security problem, and do not include a live secret, a customer record, or a packet capture from a network you do not administer.

Include the version or commit, whether `SOURCE` was `demo` or `live`, and enough detail to reproduce the issue against a local checkout.

## Scope

Span is a dashboard you run against a PBX and a billing system you administer.

In scope:

- Forging or replaying the session cookie
- A viewer account hanging up a channel or adding credit
- A generated SIP or dialplan snippet that can be turned into a second config section
- Secrets written to logs, to the repository, or into a response body

Out of scope:

- The demo passwords shipped in `.env.example`, if you leave them on a host that other people can reach
- Asterisk, FreePBX, MagnusBilling, or MySQL vulnerabilities
- A missing firewall in front of AMI. The checklist in the app calls that out; it does not scan your host

## What the process already does

- The session cookie is HMAC-SHA256, HttpOnly, and SameSite=Lax. Set `COOKIE_SECURE=1` behind HTTPS.
- `SOURCE=live` with `NODE_ENV=production` refuses the demo session secret.
- Login failures are limited to eight per address in ten minutes.
- AMI advice is `write=call` only. Hangup prefers ARI when it is configured. See [docs/asterisk-ami.md](docs/asterisk-ami.md).
- The Magnus API secret is an HMAC key and is not sent on the wire. See [docs/magnusbilling.md](docs/magnusbilling.md).
- The CDR user should be `SELECT` on `asteriskcdrdb.cdr` and `asteriskcdrdb.cel` only. See [docs/freepbx.md](docs/freepbx.md).

## Supported versions

| Version | Supported |
| --- | --- |
| 1.0.x | Yes |
