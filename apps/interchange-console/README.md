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

## Proving the gate

```bash
npm run build && npm run start -- --port 3320
npm run verify:gate -- http://127.0.0.1:3320
```

Thirteen checks, and all but three of them are refusals. Anyone can build a gate
that says yes; the claim being made to members is that it says **no** — for the
right reason, every time, and leaves a record.

## What is here

| Route | What it is |
|---|---|
| `/` | The member gate. `?still=1` renders it settled, with no animation. |
| `/directory` | Members, their books, their contribution recency, the service catalogue. |
| `/consent` | Consent scopes in borrower wording, the ledger, and the event trail. |
| `/audit` | Every call the gate decided, granted or refused, with latency. |
| `POST /api/consent` | Issue a `consent_ref`. Refuses raw identifiers with 422. |
| `POST /api/consent/{ref}/revoke` | Borrower withdrawal. Idempotent, prospective. |
| `POST /api/authorise` | The gate. Every service calls this before answering. |

## What is deliberately NOT here yet

- **Authentication.** `runAuth()` on the gate grants access to anyone, and
  `/api/authorise` reads `caller_code` from the request body. A member who can
  name themselves in a body can impersonate any other member. Sprint 2 resolves
  the caller from their mTLS certificate and puts a `proxy.ts` in front of the
  console route group.
- **The real OPRF.** `lib/tokens.ts` is a keyed HMAC placeholder with a
  documented weakness: anyone holding the secret can enumerate the eight-digit
  national ID space offline. Sprint 2 replaces it.
- **Row-level security.** Scoping is app-level only. Sprint 2 adds the Postgres
  policy set, following the pattern already proven in `BirgenAI_LMS`.
- **Quota.** `REFUSED_QUOTA` exists in the schema and the free tier is seeded,
  but nothing counts calls against it yet.
