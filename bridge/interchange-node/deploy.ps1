# -----------------------------------------------------------------------------
# Put one release of the Interchange live on the node. Called by the GitHub
# runner (.github/workflows/interchange-node.yml) with the package the build job
# made; can be run by hand with any package.
#
#   .\deploy.ps1 -Package C:\path\interchange-<sha>.zip -Release <sha>
#   .\deploy.ps1 -Rollback                         # back to the previous release
#
# 1. unpack into C:\Interchange\releases\<yyyyMMdd-HHmmss>-<sha7>
# 2. refuse a package that carries any .env file or lacks server.js
# 3. stop InterchangeWeb, point C:\Interchange\current at the new folder, start it
# 4. /api/health must answer 200 with release == the new folder within 120 s,
#    else current goes back to the previous release and this exits 1
# 5. keep the newest 5 releases (never the live one or the one before it)
# -----------------------------------------------------------------------------
param(
  [string]$Package,
  [string]$Release,
  [switch]$Rollback,
  [int]$Keep = 5,
  [int]$HealthSeconds = 120
)
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "common.ps1")

Head "Interchange deploy"
# Runs as ixdeploy, which may not query Tailscale: "this is the node" = its service and env file exist.
if (-not (Get-Service $AppService -ErrorAction SilentlyContinue) -or -not (Test-Path $EnvFile)) { No "No $AppService service or $EnvFile here: not an Interchange node."; exit 2 }
New-Item -ItemType Directory -Force $Releases, $LogsDir | Out-Null

function Get-LiveTarget {
  if (-not (Test-Path $Current)) { return $null }
  $t = (Get-Item $Current -Force).Target
  if ($t -is [array]) { $t = $t[0] }
  if ($t) { return [string]$t }
  return $null
}

# A junction swap: remove the link (never its target), make a new one.
function Set-Current([string]$target) {
  if (Test-Path $Current) {
    $item = Get-Item $Current -Force
    if (-not ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw "$Current is a real folder, not a junction: refusing to touch it" }
    [IO.Directory]::Delete($Current)
  }
  & cmd.exe /c mklink /J "$Current" "$target" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "mklink failed for $target" }
}

function Wait-Healthy([string]$name) {
  $deadline = (Get-Date).AddSeconds($HealthSeconds)
  $last = ""
  while ((Get-Date) -lt $deadline) {
    try {
      $r = Invoke-RestMethod -Uri "http://localhost:$AppPort/api/health" -TimeoutSec 10
      if ($r.ok -and $r.release -eq $name) { return $true }
      $last = "ok=$($r.ok) db=$($r.db) release=$($r.release)"
    } catch { $last = $_.Exception.Message }
    Start-Sleep -Seconds 2
  }
  Warn "health never went green: $last"
  return $false
}

function Restart-App {
  Stop-Service -Name $AppService -ErrorAction SilentlyContinue
  (Get-Service -Name $AppService).WaitForStatus("Stopped", [TimeSpan]::FromSeconds(30))
  Start-Service -Name $AppService
}

# PS 5.1's Remove-Item fails past 260 characters; rd with \\?\ does not. Only ever
# a direct child of $Releases named like a release.
function Remove-Tree([string]$path) {
  $full = [IO.Path]::GetFullPath($path)
  $parent = [IO.Path]::GetFullPath($Releases).TrimEnd("\")
  $leaf = Split-Path $full -Leaf
  if (-not $leaf -or (Split-Path $full -Parent) -ne $parent -or $leaf -notmatch '^\d{8}-\d{6}-[A-Za-z0-9]+$') { throw "Remove-Tree refuses '$path': not a release folder under $parent" }
  if (Test-Path -LiteralPath $full) { & cmd.exe /c rd /s /q "\\?\$full" | Out-Null }
  if (Test-Path -LiteralPath $full) { throw "could not remove $full" }
}

$lock = Join-Path $Root "deploying.lock"
Set-Content -Path $lock -Value (Get-Date -Format o)
try {
  $before = Get-LiveTarget

  if ($Rollback) {
    $all = @(Get-ChildItem $Releases -Directory | Sort-Object Name -Descending | ForEach-Object { $_.FullName })
    $prev = $all | Where-Object { $_ -ne $before } | Select-Object -First 1
    if (-not $prev) { No "No other release to roll back to."; exit 1 }
    Set-Current $prev
    Restart-App
    if (Wait-Healthy (Split-Path $prev -Leaf)) { Ok "Rolled back to $(Split-Path $prev -Leaf)"; exit 0 }
    No "Rolled back, but health is red. Look at $LogsDir\web-*.log"; exit 1
  }

  if (-not $Package -or -not (Test-Path $Package)) { No "No package at '$Package'"; exit 2 }
  if (-not $Release) { $Release = "manual" }
  $clean = ($Release -replace '[^A-Za-z0-9]', '')
  $name = "{0}-{1}" -f (Get-Date -Format "yyyyMMdd-HHmmss"), $clean.Substring(0, [Math]::Min(7, $clean.Length))
  $dir = Join-Path $Releases $name

  Assert-FreeSpace $Releases 3 "unpacking a release with room to spare"
  Head "Unpacking $name"
  New-Item -ItemType Directory -Force $dir | Out-Null
  & tar.exe -xf $Package -C $dir
  if ($LASTEXITCODE -ne 0) { throw "tar failed on $Package" }
  if (-not (Test-Path (Join-Path $dir "server.js"))) { Remove-Tree $dir; No "Package has no server.js"; exit 1 }
  $envFiles = @(Get-ChildItem $dir -Recurse -Force -File -Filter ".env*" -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch '\\node_modules\\' })
  if ($envFiles.Count) { Remove-Tree $dir; No "Package carries env files ($($envFiles[0].Name)): refusing. Secrets live only in $EnvFile."; exit 1 }
  Ok ("{0:N0} files, {1:N0} MB" -f (Get-ChildItem $dir -Recurse -File).Count, ((Get-ChildItem $dir -Recurse -File | Measure-Object Length -Sum).Sum / 1MB))

  Head "Switching"
  Set-Current $dir
  Restart-App
  if (Wait-Healthy $name) {
    Ok "Live: $name (was $(if ($before) { Split-Path $before -Leaf } else { 'nothing' }))"
  } else {
    if ($before) {
      Warn "Rolling back to $(Split-Path $before -Leaf)"
      Set-Current $before
      Restart-App
      if (Wait-Healthy (Split-Path $before -Leaf)) { Ok "Previous release is serving again" } else { No "Previous release is red too: look at $LogsDir" }
    }
    No "Deploy of $name failed health; it stays on disk for inspection."
    exit 1
  }

  $live = Get-LiveTarget
  $all = @(Get-ChildItem $Releases -Directory | Sort-Object Name -Descending)
  foreach ($r in ($all | Select-Object -Skip $Keep)) {
    if ($r.FullName -ne $live -and $r.FullName -ne $before) { Remove-Tree $r.FullName; Note "pruned $($r.Name)" }
  }
} finally {
  Remove-Item $lock -ErrorAction SilentlyContinue
}
