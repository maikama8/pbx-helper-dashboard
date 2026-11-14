# Changelog

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and Span follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-11-14

First public release.

### Added

- Demo floor with a seeded day, a live tick, and WebSocket snapshots. `SIM_TICK_MS=0` freezes the floor.
- Live connectors for Asterisk AMI, ARI hangup, MagnusBilling, FreePBX GraphQL, and a read-only MySQL user on `asteriskcdrdb`.
- Board for live calls, trunks, extensions, customer credit, CDR filters, and CSV export.
- Text-only SIP trunk and dialplan snippets, a security checklist, and codec and NAT notes.
- Admin and read-only sessions, Docker Compose, and an optional Asterisk lab container bound to localhost.

### Security

- The viewer role cannot hang up or refill.
- Generated snippets reject a name or password that would open a second config section.
- `SOURCE=live` with `NODE_ENV=production` refuses the demo session secret.
- The static file server is `@fastify/static` 10.1.11.
