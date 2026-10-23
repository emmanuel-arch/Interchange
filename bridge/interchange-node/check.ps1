# -----------------------------------------------------------------------------
# Is the Interchange node healthy? Read-only. Run between install steps and any
# time something looks wrong. Prints key NAMES from the env file, never values.
#
#   .\check.ps1            # elevated or not; a few lines need elevation to read
# -----------------------------------------------------------------------------
param([switch]$AnyNode)
$ErrorActionPreference = "Continue"
. (Join-Path $PSScriptRoot "common.ps1")

Head "Interchange node check"
if (-not $AnyNode) { $why = Get-NodeMismatch; if ($why) { Warn "Not $NodeName ($why)" } else { Ok "This is $NodeName ($NodeEgress)" } }
Ok ("{0} GB free on C:" -f (Get-FreeGB $Root))

$pg = Get-Listener $DbPort
if ($pg) { Ok "Registry database: Postgres listening on :$DbPort ($pg)" } else { No "Nothing listens on :$DbPort (CallBox's Postgres, which holds the Registry)" }

$b = Find-Browser
if ($b) { Ok "Browser for PDFs: $b" } else { Warn "No browser for PDFs (install.ps1 -App provides one)" }

if (Test-Path $EnvFile) {
  $cfg = Read-DotEnv $EnvFile
  Ok "$EnvFile has $($cfg.Count) keys"
  foreach ($k in "DATABASE_URL", "INTERCHANGE_SESSION_SECRET", "INTERCHANGE_OPRF_KEY", "INTERCHANGE_PUBLIC_ORIGIN", "CONSENT_WORDING_VERSION",
                 "INTERCHANGE_BUREAU_MEMBER", "INTERCHANGE_BUREAU_NODE_URL", "INTERCHANGE_BUREAU_NODE_KEY", "INTERCHANGE_BUREAU_CALLER", "CHROMIUM_PATH") {
    if ($cfg[$k]) { Note "set:   $k" } else { Warn "empty: $k" }
  }
} else { No "No $EnvFile (install.ps1 -App)" }

$svc = Get-Service $AppService -ErrorAction SilentlyContinue
if ($svc) { if ($svc.Status -eq "Running") { Ok "$AppService is Running" } else { Warn "$AppService is $($svc.Status)" } } else { No "No $AppService service (install.ps1 -App)" }
$l = Get-Listener $AppPort
if ($l) { Ok "localhost:$AppPort is $l" } else { Warn "Nothing listens on :$AppPort" }
if (Test-Path $Current) { Ok "current -> $(Split-Path ([string]@((Get-Item $Current -Force).Target)[0]) -Leaf)" } else { Warn "No release yet (the first deploy makes $Current)" }

try {
  $h = Invoke-RestMethod -Uri "http://localhost:$AppPort/api/health" -TimeoutSec 10
  if ($h.ok) { Ok "health: ok, db $($h.dbMs) ms, release $($h.release)" } else { No "health: db=$($h.db) release=$($h.release)" }
} catch { Warn "health: $($_.Exception.Message)" }

try {
  Import-Module WebAdministration -ErrorAction Stop
  $site = Get-Website -Name $IisSite -ErrorAction SilentlyContinue
  if ($site) {
    Ok "IIS site $IisSite (id $($site.id)) is $($site.State)"
    foreach ($bnd in @(Get-WebBinding -Name $IisSite)) { Note "binding $($bnd.protocol) $($bnd.bindingInformation)" }
  } else { Warn "No IIS site $IisSite (install.ps1 -Iis)" }
} catch { Note "IIS: run elevated to read sites" }

foreach ($h in $PublicHosts) {
  $cert = Get-ChildItem Cert:\LocalMachine\WebHosting, Cert:\LocalMachine\My -ErrorAction SilentlyContinue |
    Where-Object { $_.DnsNameList.Unicode -contains $h -and $_.NotAfter -gt (Get-Date) } | Sort-Object NotAfter -Descending | Select-Object -First 1
  if ($cert) { Ok "certificate for $h until $($cert.NotAfter.ToString('yyyy-MM-dd'))" } else { Warn "no valid certificate for $h yet (win-acme)" }
  try {
    $ip = [Net.Dns]::GetHostAddresses($h) | Select-Object -First 1
    Note "$h resolves here to $ip"
  } catch { Warn "$h does not resolve" }
}
$rs = Get-Service "actions.runner.*" -ErrorAction SilentlyContinue | Where-Object { $_.Name -like "*$RunnerName*" }
if ($rs) { Ok "runner $RunnerName is $($rs.Status)" } else { Warn "runner $RunnerName not registered (install.ps1 -Runner)" }
