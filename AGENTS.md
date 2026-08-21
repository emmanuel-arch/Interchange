<!-- BEGIN:nextjs-agent-rules -->

# Next.js: ALWAYS read docs before coding

Before any Next.js work, find and read the relevant doc in `node_modules/next/dist/docs/`. Your training data is outdated — the docs are the source of truth.

<!-- END:nextjs-agent-rules -->

# The Interchange

A federated data exchange for Kenyan lenders. Members query each other in real time
through a consent-gated broker; nothing is pooled, and identity is destroyed at the
edge before anything crosses a boundary.

**Read `docs/The-Interchange-Blueprint-v2.pdf` first.** It is the build contract.

## Non-negotiables

1. **No `consent_ref`, no answer.** Every call that touches borrower data validates a
   consent reference against the Registry. Enforce this in the tool/handler, never in a
   prompt or a comment.
2. **Identity never crosses a boundary.** Real identifiers (national ID, MSISDN) are
   converted to `subject_token` via the OPRF *inside the member's node*. Nothing
   downstream — logs, Kafka, storage, AI tools — ever sees a raw identifier.
3. **Point-in-time correctness.** Any feature used for scoring must be reconstructible
   as it stood at decision time. Never compute a feature from data that post-dates the
   decision.
4. **Reciprocity is enforced in code.** A member that stops contributing stops being
   able to query. That lives in the policy engine, not in a contract.

## Layout

```
apps/interchange-console   Next 16 · member console (vault shell, directory, consent)
packages/ui                shared vault cinematic, ported from the trading console
packages/consent           consent SDK — web component + REST client for members
packages/envelope          X-Road-compatible message envelope + signing
packages/features          the ~120 feature definitions, shared by training & serving
data/dagster               labelling, reject inference, feature materialisation
data/dbt                   bronze → silver → gold on Iceberg
_reference/                archived GoldStrike trading code — READ ONLY, do not extend
```

## Version notes (Next 16)

- `params`, `searchParams`, `cookies()`, `headers()`, `draftMode()` are **async**.
- `middleware.ts` is now **`proxy.ts`**, exporting a function named `proxy`. Node runtime
  only — the edge runtime is not supported there.
- Turbopack is the default bundler.
- Run `npx next typegen` for the `PageProps<'/route'>` / `LayoutProps` helpers.
