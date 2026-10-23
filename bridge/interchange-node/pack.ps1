# -----------------------------------------------------------------------------
# Turn a finished `next build` (BUILD_STANDALONE=1) into the zip deploy.ps1 takes.
# Used by .github/workflows/interchange-node.yml and by hand. Run from
# apps/interchange-console.
#
#   ..\..\bridge\interchange-node\pack.ps1 -Out interchange-<sha>.zip
#
# Refuses to pack when the build traced the source tree itself, or misses an
# external package the server loads at runtime (pg, pdfjs-dist, puppeteer-core,
# the Prisma client): either would only show on the node.
# -----------------------------------------------------------------------------
param([Parameter(Mandatory = $true)][string]$Out)
$ErrorActionPreference = "Stop"

$s = ".next/standalone"
if (-not (Test-Path "$s/server.js")) { throw "No $s/server.js: build with BUILD_STANDALONE=1 first (and from apps/interchange-console)." }

foreach ($d in "app", "scripts", "prisma/seed.ts", "_reference", "private") {
  if (Test-Path "$s/$d") { throw "standalone contains '$d': the build traced the source tree. Find the dynamic path (the build warns) and fix it." }
}
foreach ($pkg in "next", "pg", "puppeteer-core", "@prisma/client") {
  if (-not (Test-Path "$s/node_modules/$pkg/package.json")) { throw "standalone lacks node_modules/${pkg}: the server would fail at runtime." }
}
# pdfjs-dist is traced by outputFileTracingIncludes as legacy/build/** only (no
# package.json), which is exactly the file lib/statement/extract-pdf.ts imports.
foreach ($f in "pdfjs-dist/legacy/build/pdf.mjs", "pdfjs-dist/legacy/build/pdf.worker.mjs") {
  if (-not (Test-Path "$s/node_modules/$f")) { throw "standalone lacks node_modules/${f}: statement reading would fail at runtime." }
}

Copy-Item .next/static "$s/.next/static" -Recurse -Force
# Merge public INTO $s/public (the LMS found that copying the folder itself nests
# it as public/public when the build already traced part of it).
if (Test-Path public) {
  New-Item -ItemType Directory -Force "$s/public" | Out-Null
  Copy-Item "public/*" "$s/public" -Recurse -Force
  if (Test-Path "$s/public/public") { throw "public was nested as public/public: static files would 404." }
  foreach ($f in "brand/mark-192.png", "lenders/axe/logo.png", "lenders/micromart/logo.png") {
    if ((Test-Path "public/$f") -and -not (Test-Path "$s/public/$f")) { throw "standalone lacks public/${f}." }
  }
}
# Next copies .env files into standalone; secrets live only in C:\Interchange\interchange.env.
Get-ChildItem $s -Force -Filter ".env*" | Remove-Item -Force

# Turbopack's hashed aliases for external packages (.next/node_modules/pg-<hash>,
# puppeteer-core-<hash>, ...) are LINKS. tar stores them as links and the node's
# deploy user may not create links, so make each one a real copy of the traced
# package this build already ships.
$aliasDir = Join-Path $s ".next/node_modules"
$links = @()
foreach ($e in Get-ChildItem $aliasDir -Force -ErrorAction SilentlyContinue) {
  if ($e.Attributes -band [IO.FileAttributes]::ReparsePoint) { $links += $e; continue }
  if ($e.PSIsContainer -and $e.Name.StartsWith("@")) {
    foreach ($c in Get-ChildItem $e.FullName -Force) { if ($c.Attributes -band [IO.FileAttributes]::ReparsePoint) { $links += $c } }
  }
}
foreach ($l in $links) {
  $pkg = $l.Name -replace '-[0-9a-f]{16}$', ''
  $rel = if ($l.Parent.Name.StartsWith("@")) { "$($l.Parent.Name)/$pkg" } else { $pkg }
  $src = Join-Path $s "node_modules/$rel"
  if (-not (Test-Path "$src/package.json")) { $src = [string](@($l.Target)[0]) }
  if (-not (Test-Path "$src/package.json")) { throw "alias $($l.Name): no package at $src" }
  $dst = $l.FullName
  [IO.Directory]::Delete($dst)
  & robocopy.exe $src $dst /E /NFL /NDL /NJH /NJS /NP /R:0 /W:0 | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "copying $rel into $($l.Name) failed (robocopy $LASTEXITCODE)" }
  "alias {0} -> copy of node_modules/{1}" -f $l.Name, $rel
}
$left = @(Get-ChildItem $s -Recurse -Force -Attributes ReparsePoint -ErrorAction SilentlyContinue)
if ($left.Count) { throw "links left in the package: $($left[0].FullName)" }

if (Test-Path $Out) { Remove-Item $Out -Force }
& tar.exe -a -c -f $Out -C $s .
if ($LASTEXITCODE -ne 0) { throw "tar failed" }
"{0}: {1:N0} MB" -f $Out, ((Get-Item $Out).Length / 1MB)
