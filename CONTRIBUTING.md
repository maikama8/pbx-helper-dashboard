# Contributing

Thanks for looking at Span. Issues and pull requests are welcome, especially from people who run the board against a real MagnusBilling or FreePBX host.

## Setup

Node.js 22 is required.

```bash
git clone https://github.com/maikama8/pbx-helper-dashboard.git
cd pbx-helper-dashboard
npm install
cp .env.example .env
npm run dev
```

The demo source needs no PBX. Sign in as `admin` / `span-demo-admin`.

## Checks

Run these before opening a pull request. CI runs the same four.

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

`npm test` does not dial a PBX or a billing server. Connector tests use fake HTTP and a scripted AMI socket.

## Pull requests

- Keep a change focused. A bug fix does not need a drive-by rename of the board.
- Add or update a test when the change affects rating, a connector, auth, or an API response.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`.
- Do not commit `.env`, coverage output, or `node_modules`. Secrets stay in the environment.

## Demo numbers

The opening day is part of the contract the README describes: 22 attempts, ASR 63.6%, ACD 128.1 seconds. If you change a seeded CDR or a rate, update the README figures and the tests together.

## Security reports

Please use the process in [SECURITY.md](SECURITY.md) for a vulnerability. A public issue is fine for a hardening suggestion that is not an unpublished hole.
