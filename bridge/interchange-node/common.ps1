# -----------------------------------------------------------------------------
# Shared by every interchange-node script (dot-sourced). Keep this file ASCII:
# Windows PowerShell 5.1 reads a .ps1 without a BOM in the ANSI code page.
#
# The Interchange on servicesuite-in, beside the LMS and modelled on its kit
# (connected-suite bridge/lms-node). Nothing here is shared with the LMS: its own
# folder, port, service, IIS site, deploy user and runner.
# -----------------------------------------------------------------------------

[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

function Ok($s)   { Write-Host "  [ OK ] $s" -ForegroundColor Green }
function No($s)   { Write-Host "  [FAIL] $s" -ForegroundColor Red }
function Warn($s) { Write-Host "  [WARN] $s" -ForegroundColor Yellow }
function Note($s) { Write-Host "         $s" -ForegroundColor DarkGray }
function Head($s) { Write-Host ""; Write-Host $s -ForegroundColor White }

# The one server this kit is for. Everything refuses to run anywhere else unless
# -AnyNode is passed (rehearsals on a dev PC).
$NodeName   = "servicesuite-in"
$NodeEgress = "213.148.17.228"

$Root       = "C:\Interchange"
$Releases   = Join-Path $Root "releases"
$Current    = Join-Path $Root "current"
$LogsDir    = Join-Path $Root "logs"
$BrowserDir = Join-Path $Root "browser"
$EnvFile    = Join-Path $Root "interchange.env"

$AppPort    = 3200            # loopback only; the LMS is 3100, IIS is the only thing in front
$AppService = "InterchangeWeb"
$IisSite    = "InterchangeNode"
$PublicHosts = @("interchange.servicesuitecloud.com")

# The Registry database: CallBox's Postgres 17 on this machine, database
# `interchange`, roles interchange_owner / interchange_app (created 18 Sep 2026).
$DbPort     = 2020
$DbName     = "interchange"

# The GitHub runner that deploys this repo. A runner belongs to ONE repository on
# a personal account, so the LMS's runner (lms-servicesuite-in) cannot serve this.
$RunnerName  = "interchange-servicesuite-in"
$RunnerLabel = "interchange-node"
$DeployUser  = "ixdeploy"
$Repo        = "https://github.com/emmanuel-arch/Interchange"

function Test-Admin {
  return ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-TailscaleExe {
  $cmd = Get-Command tailscale -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  if (Test-Path "C:\Program Files\Tailscale\tailscale.exe") { return "C:\Program Files\Tailscale\tailscale.exe" }
  return $null
}

function Get-PublicIp {
  try { return ("" + (Invoke-RestMethod -Uri "https://api.ipify.org" -TimeoutSec 10)).Trim() } catch { return $null }
}

# Is this servicesuite-in? Tailnet name AND public egress. $null when it is.
function Get-NodeMismatch {
  $ts = Get-TailscaleExe
  if (-not $ts) { return "Tailscale is not installed here" }
  $self = $null
  try { $self = ((& $ts status --json 2>$null | Out-String) | ConvertFrom-Json).Self } catch { }
  $name = ""
  if ($self) { $name = ("" + $self.HostName).ToLower() }
  if ($name -ne $NodeName) { return "this is tailnet node '$name', not $NodeName" }
  $ip = Get-PublicIp
  if ($ip -ne $NodeEgress) { return "public egress is '$ip', not $NodeEgress" }
  return $null
}

function Assert-Node([switch]$AnyNode) {
  if ($AnyNode) { Warn "-AnyNode: identity checks skipped (rehearsal only)"; return }
  $why = Get-NodeMismatch
  if ($why) { No "Wrong machine: $why. This kit only runs on $NodeName ($NodeEgress)."; exit 2 }
  Ok "This is $NodeName ($NodeEgress)"
}

function Get-FreeGB([string]$path) {
  $p = $path
  while ($p -and -not (Test-Path $p)) { $p = Split-Path $p -Parent }
  if (-not $p) { return 0 }
  $drive = Get-PSDrive -Name ([IO.Path]::GetPathRoot((Resolve-Path $p).Path).Substring(0, 1))
  return [Math]::Round($drive.Free / 1GB, 1)
}

# CallBox's Postgres and SQL Server die when C: fills. Refuse below the floor.
function Assert-FreeSpace([string]$path, [double]$minGB, [string]$what) {
  $free = Get-FreeGB $path
  if ($free -lt $minGB) { No "Only $free GB free where $path lives; $what needs $minGB GB. Free space first."; exit 1 }
  Ok "$free GB free where $path lives"
}

function Get-Listener([int]$port) {
  $l = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $l) { return $null }
  $p = Get-Process -Id $l.OwningProcess -ErrorAction SilentlyContinue
  return "$($p.ProcessName) (pid $($l.OwningProcess))"
}

# nssm.exe: the path given, then PATH, then $Root, then the one an existing NSSM
# service runs (LmsWeb, the SQL relay and the PBX bridge use it on this server).
function Get-NssmExe([string]$given) {
  if ($given) { if (Test-Path $given) { return $given } else { return $null } }
  $cmd = Get-Command nssm -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  if (Test-Path (Join-Path $Root "nssm.exe")) { return (Join-Path $Root "nssm.exe") }
  foreach ($s in @(Get-CimInstance Win32_Service -ErrorAction SilentlyContinue)) {
    if ("$($s.PathName)" -match '^\s*"?([^"]*\\nssm\.exe)"?') { if (Test-Path $Matches[1]) { return $Matches[1] } }
  }
  return $null
}

function Get-NodeExe {
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  if (Test-Path "C:\Program Files\nodejs\node.exe") { return "C:\Program Files\nodejs\node.exe" }
  return $null
}

function Read-DotEnv([string]$file) {
  $cfg = @{}
  if (-not (Test-Path $file)) { return $cfg }
  foreach ($line in [IO.File]::ReadAllLines($file)) {
    if ($line.TrimStart().StartsWith("#")) { continue }
    if ($line -match '^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$') {
      $v = $Matches[2]
      if ($v.Length -ge 2 -and (($v.StartsWith('"') -and $v.EndsWith('"')) -or ($v.StartsWith("'") -and $v.EndsWith("'")))) { $v = $v.Substring(1, $v.Length - 2) }
      $cfg[$Matches[1]] = $v
    }
  }
  return $cfg
}

# A browser for the PDF renderer (lib/reports/render.ts): the first that exists.
function Find-Browser {
  foreach ($p in @(
    (Join-Path $BrowserDir "chrome-headless-shell-win64\chrome-headless-shell.exe"),
    "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    "C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    "C:\Program Files\Google\Chrome\Application\chrome.exe")) {
    if (Test-Path $p) { return $p }
  }
  return $null
}

# Run a native exe, return its exit code; stderr is shown, never terminating (PS 5.1 trap).
function Invoke-Native([string]$exe, [string[]]$argv) {
  $old = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  & $exe @argv 2>&1 | ForEach-Object { Note "$_" }
  $code = $LASTEXITCODE
  $ErrorActionPreference = $old
  return $code
}
