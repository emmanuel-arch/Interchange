# The Interchange on servicesuite-in (213.148.17.228)

The Registry runs beside the LMS on one machine. It is built by GitHub
(`.github/workflows/interchange-node.yml`) and deployed by a self-hosted runner. IIS
fronts it, and it reads its database on the same box. Modelled on the LMS's kit
(connected-suite `bridge/lms-node`), with nothing shared: its own folder, port, service,
site, user and runner.

| | |
|---|---|
| Folder | `C:\Interchange` (releases, `current` junction, logs, browser, `interchange.env`) |
| App | service `InterchangeWeb` (NSSM, LocalService), Node on `localhost:3200` |
| Front | IIS site `InterchangeNode`, `interchange.servicesuitecloud.com` -> localhost:3200 (URL Rewrite + ARR, already installed for the LMS) |
| Database | CallBox's Postgres 17 on `127.0.0.1:2020`, database `interchange`, app role `interchange_app` (no BYPASSRLS), owner `interchange_owner` |
| PDFs | Edge/Chrome if installed, else Google's chrome-headless-shell under `C:\Interchange\browser` |
| Deploys | runner `interchange-servicesuite-in` [self-hosted, windows, interchange-node] as local user `ixdeploy` |

## State on 23 Oct 2026

The Registry database on `:2020` was stood up fresh. The original Supabase project was lost.
- 26 tables. Built by `apps/interchange-console/scripts/registry-bootstrap.ts --apply --grant interchange_app`.
- 17 members. Micromart 3005/3002 and Axe AXE-3003/3004 are ACTIVE, with public keys derived from
  the LMS's `INTERCHANGE_NODE_KEYS`. Axe's admission is in the governance log.
- 10 services, including report 8 live.
- Operators: Birgen Krosovic (super admin), Geoffrey Njane (Micromart 3002) and Bennedict Omondi
  (Axe 3003). The codes were handed to the founder.
- Positions are NOT yet published (see step 8).

## Cut-over, in order (elevated PowerShell on the node)

Copy this folder and `interchange-node-production.env` to the node, e.g. `C:\Temp\interchange-node\`.

1. `.\install.ps1 -App -EnvFrom C:\Temp\interchange-node-production.env`
   This writes `C:\Interchange\interchange.env` (locked) and provides a browser for PDFs.
   It also installs `InterchangeWeb`, which stays stopped until the first deploy. Delete the
   copied env file afterwards.
2. `.\install.ps1 -Runner -RunnerToken <token>`
   Get the token from GitHub -> emmanuel-arch/Interchange -> Settings -> Actions -> Runners ->
   New self-hosted runner. It is valid for one hour.
3. On GitHub, set the repository variable `INTERCHANGE_NODE_DEPLOY` = `on` and run the workflow
   (or push). The first deploy puts a release in `current` and starts the service.
   `.\check.ps1` should then show health: ok.
4. `.\install.ps1 -Iis -Hosts interchange.servicesuitecloud.com`
5. DNS at cloudoon: `interchange` -> **A 213.148.17.228**, TTL 300. This replaces the Vercel
   CNAME. Test before the change has spread:
   `curl --resolve interchange.servicesuitecloud.com:80:213.148.17.228 http://interchange.servicesuitecloud.com/api/health`
6. win-acme for site `InterchangeNode`:
   `wacs.exe --source iis --siteid <id> --installation iis --accepttos --emailaddress <you>`
7. `.\install.ps1 -Iis -RedirectHttps`
   This redirects to https and maps the name to 127.0.0.1 in the hosts file, so the LMS on this
   box reaches the Registry without leaving it.
8. Publish positions from the LMS side:
   `npm run interchange:publish -- --all` in connected-suite, with
   `INTERCHANGE_URL=https://interchange.servicesuitecloud.com`.

**Rollback:** set the DNS back to the Vercel CNAME. Vercel still serves the site, but its database
is gone, so this restores the pages, not the Registry.

**After:** remove `interchange.servicesuitecloud.com` from the Vercel project (team cludq), or
disconnect its Git, so pushes stop building there.

## Traps carried over from the LMS

- `HOSTNAME=localhost`, never 127.0.0.1 (see `launch.cjs`).
- Turbopack's hashed aliases are links. `pack.ps1` turns them into copies, because `ixdeploy`
  may not create links.
- PS 5.1 `Remove-Item` fails past 260 characters, so `deploy.ps1` uses `rd \\?\`.
- Keep every `.ps1` ASCII. PS 5.1 reads a file without a BOM in the ANSI code page.
- IIS's Basic challenge on 401s is switched off for this site only (anonymous auth).
