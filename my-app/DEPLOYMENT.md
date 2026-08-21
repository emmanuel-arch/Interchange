# Deploying GoldStrike → trading.birgenai.com

This app is part of the **BirgenAI suite** and shares the suite's Supabase Postgres
database and single sign-on session. The public landing page is a **screen lock**;
entering the **4-digit access code** signs you in as the configured owner account
(`OWNER_EMAIL`) from the shared `users` table and drops you into the cockpit.

If you're already signed into another suite app (e.g. birgenai.com) in the same
browser, the lock is skipped automatically (SSO).

## How auth works here

- No `next-auth` dependency. We mint/read the **exact Auth.js v5 session cookie** the
  rest of the suite uses (`lib/suite-session.ts`), so sessions are interoperable:
  - cookie name: `__Secure-birgenai-suite.session-token` (prod) / `birgenai-suite.session-token` (dev)
  - encryption: JWE `dir` / `A256CBC-HS512`, key = HKDF(secret, salt=cookie name)
  - secret: `NEXTAUTH_SECRET` — **must be byte-identical to the hub + movies**
- `middleware.ts` bounces unauthenticated visitors to `/` (the lock).
- `POST /api/auth/access-code { code }` validates the 4-digit code, looks up the owner
  in `users` (Supabase service role), mints the session, and sets the cookie.
- `POST /api/auth/logout` clears it (suite-wide when the domain cookie is set).

## Environment variables (set these in Vercel → Project → Settings → Environment Variables)

| Variable | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://wqsfuiqaaajrpwgviehl.supabase.co` | Same project as the suite |
| `SUPABASE_SERVICE_ROLE_KEY` | *(suite service-role key)* | Server-only; reads `users` |
| `NEXTAUTH_SECRET` | *(suite secret)* | **Identical** to hub/movies or SSO breaks |
| `AUTH_COOKIE_DOMAIN` | `.birgenai.com` | Shares the session across `*.birgenai.com` |
| `OWNER_EMAIL` | e.g. `kipletinge123@gmail.com` | Account the 4-digit code logs in as |
| `TRADING_ACCESS_CODE` | *(your 4 digits)* | Server-only; never shipped to the browser |

`.env.local` holds the same values for local development (it is gitignored).
`AUTH_COOKIE_DOMAIN` is left **empty** locally (host-only cookie on `localhost`).

## Steps

1. **Push the repo** (this `my-app` directory should be the Vercel project root). If the
   git repo root is the `GoldStrike Platform` folder, set the Vercel project's **Root
   Directory** to `my-app`.
2. **Create the Vercel project**, framework preset **Next.js** (build `next build`,
   install `npm install`).
3. **Add the env vars** above (Production + Preview).
4. **Add the domain** `trading.birgenai.com` (Vercel → Domains) and point the DNS
   `CNAME trading → cname.vercel-dns.com` at your DNS provider.
5. **Deploy.** Visit `https://trading.birgenai.com` → you should see the lock; the
   4-digit code logs you in. Confirm the `__Secure-birgenai-suite.session-token` cookie
   is issued on domain `.birgenai.com`.

## Security note

A 4-digit code is only 10,000 combinations. The API has a best-effort in-memory rate
limiter (`lib/owner.ts`), but that is per-instance and not durable on serverless.
Before opening the platform beyond yourself, harden this (a shared rate-limit store
such as Upstash, a longer code, or a second factor).
