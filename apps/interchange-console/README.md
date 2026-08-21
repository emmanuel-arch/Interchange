# Interchange console

The member-facing surface of the Interchange, and the Registry behind it.
Next 16 · Tailwind 4 · Prisma 7 · Postgres.

Read `../../AGENTS.md` first — the four non-negotiables there are enforced in
this codebase, not aspirational.

## Running it

```bash
npm install
npm run db:dev          # local Postgres (PGlite) — prints a connection URL
# put that URL in .env as DATABASE_URL and DIRECT_URL
npm run db:push         # create the Registry schema
npm run db:seed         # the real founding cohort, not fixtures
npm run dev             # http://localhost:3000
```

`npm run db:dev` gives a real Postgres rather than SQLite, so the dialect
matches production and the RLS work planned for Sprint 2 can be developed
locally instead of only against Supabase.

Then generate development key material:

```bash
npm run keys:dev        # ecosystem OPRF key + a keypair per member
```

It prints an `INTERCHANGE_OPRF_KEY` line for `.env` and writes member private
keys to `.member-keys.json` (gitignored). **Development only** — in production a
member generates their own key inside their own node and sends only the public
half, which is the entire point of signing rather than sharing a secret.

## Proving it

```bash
npm run build && npm run start -- --port 3330
npm run verify:exchange -- http://127.0.0.1:3330   # 19 checks
npm run verify:tamper                              # 6 checks
```

`verify:exchange` acts as a member node: it holds a private key, blinds
identifiers locally, and never lets a raw identifier cross the wire. Most of its
checks are attacks — impersonation with a forged key, altering a body after
signing, replaying another borrower's consent, querying from the shadow period.

`verify:tamper` edits the message log **directly in the database**, bypassing
every application check, and confirms the chain notices. It also covers the
sophisticated case: recomputing the edited row's hash so the row is internally
consistent, which moves the break downstream instead of hiding it.

## What is here

| Route | What it is |
|---|---|
| `/` | The member gate. `?still=1` renders it settled, with no animation. |
| `/directory` | Members, their books, contribution recency, the service catalogue. |
| `/consent` | Consent scopes in borrower wording, the ledger, the event trail. |
| `/audit` | Every call the gate decided, with latency. |
| `/log` | The hash-chained message log, re-verified on load. |
| `POST /api/oprf/evaluate` | Token service. Signed; rate-limited per member. |
| `POST /api/exchange` | Signed, consented, logged member-to-member call. |
| `POST /api/consent` | Issue a `consent_ref`. Refuses raw identifiers. |
| `POST /api/consent/{ref}/revoke` | Borrower withdrawal. Idempotent, prospective. |
| `POST /api/session` | Console session, by signed request. |
| `GET /api/log/verify` | Public chain verification — evidence, not assertion. |

## What is deliberately NOT here yet

- **RFC 3161 timestamping.** The chain proves internal consistency but not *when*
  it was written, so a holder of this database could rebuild it from genesis.
  The `/log` page says so in amber rather than implying more than is true.
- **Fan-out.** `/api/exchange` proves the envelope, identity, policy and log are
  sound enough to carry an exposure query. The query itself is Sprint 3.
- **A human operator login.** Sessions are established by Ed25519 signature,
  which a browser cannot produce. `GET /api/session/dev` covers local browsing
  and is fenced behind both `NODE_ENV !== "production"` and an explicit env flag.
  The vault gate's `runAuth()` is still a stub and does not call `/api/session`.
- **Row-level security.** Scoping is app-level only. The pattern to copy is in
  `BirgenAI_LMS` (`prisma/rls.sql` + `src/lib/prisma.ts`).
- **Key custody.** The ecosystem OPRF key sits in `.env`. It belongs in a KMS or
  HSM, and because rotating it re-tokenises every borrower, it is effectively
  unrotatable once real data exists. Decide custody before launch.
