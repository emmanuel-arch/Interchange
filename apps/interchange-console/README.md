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
npm run seed:holdings   # overlapping borrower population (the stand-in book)
npm run filters:build   # publish each member's Bloom filter
npm run seed:ledger     # bitemporal ledger + decision snapshots
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
npm run verify:exposure -- http://127.0.0.1:3330    # 15 checks
npm run verify:learning                            # 17 checks
npm run train                                      # champion + challenger
npm run verify:scoring                             # 21 checks
npm run verify:onboarding -- http://127.0.0.1:3330  # 18 checks
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
| `/exposure` | Run a live ecosystem exposure query. Dev-fenced. |
| `/reports` | The report catalogue, what each costs, and a live preview. |
| `POST /api/v1/report` | **The member-facing report endpoint.** JSON, HTML or PDF. |
| `/learning` | Loop coverage, selection bias, feature drift, the registry. |
| `/score` | Model registry, promotion, reason codes, the AI tool manifest. |
| `/governance` | Applications, shadow period, decision record, operating entity. |
| `/consent` | Consent scopes in borrower wording, the ledger, the event trail. |
| `/audit` | Every call the gate decided, with latency. |
| `/log` | The hash-chained message log, re-verified on load. |
| `POST /api/oprf/evaluate` | Token service. Signed; rate-limited per member. |
| `POST /api/exchange` | Signed, consented, logged member-to-member call. |
| `POST /api/node/exposure` | The MEMBER side: answers about its own book, aggregates only. |
| `GET /api/filters` | Published Bloom filters. Nodes screen locally against these. |
| `POST /api/consent` | Issue a `consent_ref`. Refuses raw identifiers. |
| `POST /api/onboard` | A lender applies to join. Grants nothing. |
| `POST /api/onboard/{id}/key` | Register a public key by signing with it. |
| `POST /api/consent/{ref}/revoke` | Borrower withdrawal. Idempotent, prospective. |
| `POST /api/session` | Console session, by signed request. |
| `GET /api/log/verify` | Public chain verification — evidence, not assertion. |

## The report kit

`lib/reports/` is the document system every Interchange artefact is built from.
It is deliberately layered so a new report type costs a function rather than a
stylesheet:

| File | What it owns |
|---|---|
| `theme.ts` | Colour, type, page geometry, money and date formatting. Every palette was run through the data-viz validator against this paper surface before it was written down — the numbers are recorded in the file. |
| `charts.ts` | Hand-rolled inline SVG: score dial, trend line, composition bar, bar list, PPI ladder, activity strip, sparkline. No charting library, because a PDF is rendered by a headless browser with a virtual clock and anything that lays itself out after first paint renders as a blank box. |
| `shell.ts` | The block renderer, the stylesheet and the report masthead. Documents are described as blocks; only this file writes HTML. |
| `briefing.ts` | The same system with a masthead for documents that have no borrower. |
| `bureau.ts` | Metropol's thirteen entitled report types folded into one canonical file. Carries the fixes for four production faults found on a live pull. |
| `documents.ts` | Editorial judgement: which sections each report type is made of. |
| `catalogue.ts` | What the Interchange sells, and the commercial model. |
| `source.ts` | Where bureau data comes from — the contract holder's node, or a captured replay. |
| `render.ts` | HTML → PDF through whatever headless Chromium the host has, plus the font verification that catches a silent fallback to Times. |

```bash
npm run report:build -- --raw <dir-of-bureau-json> --out <file.pdf>
npm run verify:reports -- http://127.0.0.1:3341   # 17 checks, four of them attacks
npm run brief                                      # the launch brief
```

**The font trap is real and silent.** WOFF2 `@font-face` does not decode in the
headless build here: the page renders, no error appears, and the PDF quietly
falls back to Times New Roman. The kit embeds WOFF v1 and every render is
verified by reading the PDF's own `/BaseFont` names back out. Never judge a
generated document by how the HTML looked in a browser.

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

## The MemberHolding stand-in

`MemberHolding` is the one part of Sprint 3 that is **not** faithful to the
target architecture. In the deployed design that table does not exist: a
member's node answers exposure by reading its own Serviceconnect book, scoped to
its EntityID, and nothing about their borrowers is ever centralised.

It exists so the real fan-out path — local Bloom screening, parallel signed
requests, per-member timeouts, partial results, aggregates-only responses — can
be exercised before nodes are deployed at members. Everything around it is real.
Replacing it is the first task when a member node ships.

## Plane B: what is real and what is not

Redpanda, Iceberg, R2 and Dagster are **not running here** — no container runtime
is available on this machine. What is built is everything that does not depend on
them, which happens to be the part that cannot be recovered later:

- **Bitemporal ledger.** `LedgerEvent` carries both `at` (when it happened) and
  `recordedAt` (when we learned it). The feature store filters on `recordedAt`,
  which is what stops late-arriving data leaking into earlier vectors. Half the
  arrears in the fixture are deliberately reported late so the leakage test has
  something real to catch.
- **Decision snapshots.** The feature vector is frozen at decision time, never
  recomputed. A vector rebuilt later is a different vector.
- **Reject inference.** Applicants one member declined, who borrowed from
  another, carry observed labels — not imputed ones.
- **Feature registry.** One definition per feature, used by training and serving.
- **PSI drift monitoring.**

The orchestration is deliberately plain functions rather than Dagster assets, so
wrapping them later is mechanical. The label policy is the hard part, and it is
here.

## On the reported AUC

The champion scores barely better than chance on the seeded data, and the
console says so in amber rather than hiding it. Two things are worth separating:

- **The trainer works.** On a planted separable dataset it reaches AUC 1.000 and
  puts its weight on the signal rather than the noise, and its reason-code
  contributions sum *exactly* to the logit. That is checked in
  `verify:scoring`, first, deliberately — because a broken trainer and a weak
  dataset produce the same number, and reporting an AUC without separating them
  proves nothing.
- **The fixture is weak on purpose.** Outcomes are generated with heavy noise
  around a latent risk factor, and the strongest real predictors — the 38 M-Pesa
  cashflow features — are not wired yet.

Chasing a flattering number on synthetic data would be exactly the self-deception
the point-in-time and out-of-time work exists to prevent.

## Model choices worth knowing

The **logistic scorecard is the champion**, not the tree ensemble. Its
contributions are exact rather than approximated, its monotonicity can be
inspected by reading a coefficient, and on a few hundred rows trees memorise.

**Monotonic constraints are enforced by projection**, not hoped for. Without
them the ecosystem features — active lenders, active loans and outstanding
balance move together above 0.9 correlation — flipped coefficient signs freely:
an unconstrained fit put a negative weight on worst-days-past-due while
defaulters demonstrably had *higher* DPD. That model would have told a borrower
their arrears history helped them.
