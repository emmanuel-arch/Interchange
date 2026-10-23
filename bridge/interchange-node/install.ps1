# -----------------------------------------------------------------------------
# One-time setup of the Interchange on servicesuite-in, beside the LMS. Run
# elevated, ONE STEP AT A TIME, check.ps1 between steps. Each step is idempotent.
#
#   .\install.ps1 -App -EnvFrom C:\Temp\interchange-node-production.env
#   .\install.ps1 -Runner -RunnerToken <token from GitHub>
#   .\install.ps1 -Iis -Hosts interchange.servicesuitecloud.com
#   .\install.ps1 -Iis -RedirectHttps       (after win-acme has issued the certificate)
#
# What it never does: iisreset, restart or reconfigure an existing site or app
# pool, touch the LMS (C:\LmsNode, LmsWeb, LmsNode site), CallBox, the SQL relay
# or the PBX bridge. The Registry database lives in CallBox's Postgres (:2020),
# which this kit only ever CONNECTS to, as the app role, through the app.
# -----------------------------------------------------------------------------
param(
  [switch]$App,
  [string]$EnvFrom,
  [switch]$Runner,
  [string]$RunnerToken,
  [string]$RunnerZip,
  [switch]$Iis,
  [string[]]$Hosts,
  [switch]$RedirectHttps,
  [switch]$Force,
  [string]$Nssm,
  [double]$MinFreeGB = 5,
  [switch]$AnyNode
)
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "common.ps1")

if (-not (Test-Admin)) { No "Run this from an elevated PowerShell."; exit 2 }
Assert-Node -AnyNode:$AnyNode
if (-not ($App -or $Runner -or $Iis)) { No "Pick a step: -App, -Runner or -Iis."; exit 2 }
if ($App -or $Runner) { Assert-FreeSpace $Root $MinFreeGB "the Interchange (5 releases, a browser, logs)" }
New-Item -ItemType Directory -Force $Root, $LogsDir | Out-Null

# =============================================================================
if ($App) {
  Head "Step: the app service ($AppService on localhost:$AppPort)"
  $node = Get-NodeExe
  if (-not $node) { No "Node.js is not installed."; exit 1 }
  $nv = & $node --version
  if ("$nv" -notmatch '^v(2[2-9]|[3-9]\d)\.') { No "Node $nv is too old: the build targets Node 24."; exit 1 }
  Ok "Node $nv"

  $l = Get-Listener $AppPort
  if ($l -and -not (Get-Service $AppService -ErrorAction SilentlyContinue)) { No "Port $AppPort is already taken by $l."; exit 1 }

  $pg = Get-Listener $DbPort
  if (-not $pg) { No "Nothing listens on port ${DbPort}: the Registry database (CallBox's Postgres) is not up."; exit 1 }
  Ok "Postgres on :$DbPort ($pg)"

  New-Item -ItemType Directory -Force $Releases | Out-Null
  foreach ($f in "launch.cjs", "deploy.ps1", "common.ps1", "check.ps1") {
    Copy-Item (Join-Path $PSScriptRoot $f) (Join-Path $Root $f) -Force
  }
  Ok "Copied launch.cjs, deploy.ps1, check.ps1 and common.ps1 to $Root"

  # The PDF renderer needs a real browser on this machine. Edge or Chrome if one
  # is installed; otherwise Google's chrome-headless-shell, unpacked under $Root
  # and nowhere else (nothing is installed system-wide).
  $browser = Find-Browser
  if (-not $browser) {
    $meta = Invoke-RestMethod -Uri "https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json" -TimeoutSec 30
    $dl = $meta.channels.Stable.downloads.'chrome-headless-shell' | Where-Object { $_.platform -eq "win64" } | Select-Object -First 1
    if (-not $dl) { No "Could not find a chrome-headless-shell download. Install Edge or Chrome, then re-run -App."; exit 1 }
    $zip = Join-Path $env:TEMP "chrome-headless-shell-win64.zip"
    Invoke-WebRequest -Uri $dl.url -OutFile $zip -UseBasicParsing
    New-Item -ItemType Directory -Force $BrowserDir | Out-Null
    & tar.exe -xf $zip -C $BrowserDir
    if ($LASTEXITCODE -ne 0) { No "Could not unpack $zip"; exit 1 }
    Remove-Item $zip -Force -ErrorAction SilentlyContinue
    $browser = Find-Browser
    if (-not $browser) { No "chrome-headless-shell unpacked but not found under $BrowserDir"; exit 1 }
    Ok "chrome-headless-shell $($meta.channels.Stable.version) in $BrowserDir"
  } else {
    Ok "Browser for PDFs: $browser"
  }

  # interchange.env: never overwritten once written; missing node keys are added.
  $node_keys = [ordered]@{ PORT = "$AppPort"; INTERCHANGE_PDF_SERVERLESS = "off"; CHROMIUM_PATH = $browser }
  if (-not (Test-Path $EnvFile)) {
    if (-not $EnvFrom -or -not (Test-Path $EnvFrom)) { No "No $EnvFile yet: pass -EnvFrom <interchange-node-production.env>."; exit 2 }
    $src = Read-DotEnv $EnvFrom
    $lines = @("# Interchange node settings. Written by install.ps1 on $(Get-Date -Format s). Secrets: Administrators, SYSTEM and LocalService only.")
    foreach ($k in ($src.Keys | Sort-Object)) {
      if ($node_keys.Contains($k) -or $k -like "VERCEL*" -or $k -like "TURBO*") { continue }
      $lines += "$k=`"$($src[$k])`""
    }
    $lines += "# --- node ---"
    foreach ($k in $node_keys.Keys) { $lines += "$k=`"$($node_keys[$k])`"" }
    [IO.File]::WriteAllLines($EnvFile, $lines, (New-Object Text.UTF8Encoding($false)))
    Ok "Wrote $EnvFile ($($src.Count) keys + node keys)"
  } else {
    $cfg = Read-DotEnv $EnvFile
    $add = @()
    foreach ($k in $node_keys.Keys) { if (-not $cfg[$k]) { $add += "$k=`"$($node_keys[$k])`"" } }
    if ($add.Count) { [IO.File]::AppendAllLines($EnvFile, [string[]]$add, (New-Object Text.UTF8Encoding($false))) }
    Ok "$EnvFile kept$(if ($add.Count) { "; added $($add.Count) missing node key(s)" })"
  }
  $cfg = Read-DotEnv $EnvFile
  foreach ($k in "DATABASE_URL", "INTERCHANGE_SESSION_SECRET", "INTERCHANGE_OPRF_KEY", "INTERCHANGE_PUBLIC_ORIGIN", "INTERCHANGE_BUREAU_NODE_KEY") {
    if (-not $cfg[$k]) { Warn "$k is empty in $EnvFile" }
  }
  if ($cfg["DATABASE_URL"] -and $cfg["DATABASE_URL"] -notmatch "@(127\.0\.0\.1|localhost):$DbPort/") { Warn "DATABASE_URL does not point at 127.0.0.1:$DbPort - the node should use the Registry on this machine" }
  & icacls $EnvFile /inheritance:r /grant:r "*S-1-5-32-544:F" "*S-1-5-18:F" "NT AUTHORITY\LocalService:R" | Out-Null
  & icacls $LogsDir /grant "NT AUTHORITY\LocalService:(OI)(CI)M" | Out-Null
  & icacls $Releases /grant "NT AUTHORITY\LocalService:(OI)(CI)RX" | Out-Null
  if (Test-Path $BrowserDir) { & icacls $BrowserDir /grant "NT AUTHORITY\LocalService:(OI)(CI)RX" | Out-Null }
  Ok "Locked $EnvFile; LocalService may write logs\, read releases\ and the browser"

  if (-not (Get-Service $AppService -ErrorAction SilentlyContinue)) {
    $nssmExe = Get-NssmExe $Nssm
    if (-not $nssmExe) { No "NSSM not found: pass -Nssm <path to nssm.exe>."; exit 1 }
    $launch = Join-Path $Root "launch.cjs"
    & $nssmExe install $AppService $node "`"$launch`"" | Out-Null
    & $nssmExe set $AppService AppDirectory $Root | Out-Null
    & $nssmExe set $AppService DisplayName "Interchange web (Registry)" | Out-Null
    & $nssmExe set $AppService Description "Next.js standalone server for interchange.servicesuitecloud.com, behind IIS. C:\Interchange\README" | Out-Null
    & $nssmExe set $AppService Start SERVICE_AUTO_START | Out-Null
    & $nssmExe set $AppService AppEnvironmentExtra "TZ=UTC" "NODE_ENV=production" | Out-Null
    & $nssmExe set $AppService AppStdout (Join-Path $LogsDir "web-out.log") | Out-Null
    & $nssmExe set $AppService AppStderr (Join-Path $LogsDir "web-err.log") | Out-Null
    & $nssmExe set $AppService AppRotateFiles 1 | Out-Null
    & $nssmExe set $AppService AppRotateOnline 1 | Out-Null
    & $nssmExe set $AppService AppRotateBytes 10485760 | Out-Null
    & $nssmExe set $AppService AppExit Default Restart | Out-Null
    & $nssmExe set $AppService AppRestartDelay 3000 | Out-Null
    & $nssmExe set $AppService AppStopMethodConsole 15000 | Out-Null
    $svc = Get-CimInstance Win32_Service -Filter "Name='$AppService'"
    $r = Invoke-CimMethod -InputObject $svc -MethodName Change -Arguments @{ StartName = "NT AUTHORITY\LocalService"; StartPassword = "" }
    if ($r.ReturnValue -ne 0) { No "Could not set $AppService to LocalService (WMI $($r.ReturnValue))"; exit 1 }
    Ok "Service $AppService installed (LocalService, restarts on exit, logs in $LogsDir)"
  } else {
    Ok "Service $AppService already installed"
  }
  if (Test-Path $Current) { Start-Service $AppService; Ok "$AppService started" } else { Note "$AppService stays stopped until the first deploy puts a release in $Current" }
}

# =============================================================================
if ($Runner) {
  Head "Step: GitHub Actions runner (label $RunnerLabel) as local user $DeployUser"
  if (-not (Get-Service $AppService -ErrorAction SilentlyContinue)) { No "Run -App first."; exit 2 }
  $runnerDir = Join-Path $Root "runner"
  $pwBytes = New-Object byte[] 32
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($pwBytes)
  $pw = ([Convert]::ToBase64String($pwBytes)).TrimEnd("=").Replace("+", "-").Replace("/", "_") + "!a1"
  $secure = ConvertTo-SecureString $pw -AsPlainText -Force
  if (Get-LocalUser -Name $DeployUser -ErrorAction SilentlyContinue) {
    Set-LocalUser -Name $DeployUser -Password $secure
  } else {
    New-LocalUser -Name $DeployUser -Password $secure -PasswordNeverExpires -UserMayNotChangePassword -Description "Deploys the Interchange (C:\Interchange)" | Out-Null
  }
  Ok "Local user $DeployUser (not an administrator)"

  # Rights: write releases\ and the runner; create/delete the `current` junction and
  # deploying.lock in $Root (this folder only); start/stop InterchangeWeb. Nothing else.
  New-Item -ItemType Directory -Force $runnerDir | Out-Null
  & icacls $Releases /grant "${DeployUser}:(OI)(CI)M" | Out-Null
  & icacls $runnerDir /grant "${DeployUser}:(OI)(CI)M" | Out-Null
  & icacls $Root /grant "${DeployUser}:(M)" | Out-Null
  & icacls $Root /grant "${DeployUser}:(DC)" | Out-Null
  & icacls $LogsDir /grant "${DeployUser}:(OI)(CI)RX" | Out-Null
  $sid = (New-Object Security.Principal.NTAccount($DeployUser)).Translate([Security.Principal.SecurityIdentifier]).Value
  $sddl = ((& sc.exe sdshow $AppService) -join "").Trim()
  if ($sddl -notmatch [regex]::Escape($sid)) {
    $ace = "(A;;RPWPLOCRRC;;;$sid)"
    $cut = $sddl.IndexOf(")S:(")
    $dacl = if ($cut -ge 0) { $sddl.Substring(0, $cut + 1) } else { $sddl }
    $sacl = if ($cut -ge 0) { $sddl.Substring($cut + 1) } else { "" }
    if (-not $dacl.StartsWith("D:")) { No "Unexpected SDDL on ${AppService}: $sddl"; exit 1 }
    & sc.exe sdset $AppService ($dacl + $ace + $sacl) | Out-Null
    if ($LASTEXITCODE -ne 0) { No "sc sdset failed"; exit 1 }
  }
  Ok "$DeployUser may start/stop $AppService and write releases\"

  if (-not (Test-Path (Join-Path $runnerDir "config.cmd"))) {
    if (-not $RunnerZip) {
      $rel = Invoke-RestMethod -Uri "https://api.github.com/repos/actions/runner/releases/latest" -TimeoutSec 30
      $asset = $rel.assets | Where-Object { $_.name -match '^actions-runner-win-x64-[\d.]+\.zip$' } | Select-Object -First 1
      # Reuse a complete earlier download (99 MB over this link is minutes), and
      # write to .part first so a half-written file is never mistaken for one.
      $RunnerZip = Join-Path $env:TEMP $asset.name
      if ((Test-Path $RunnerZip) -and (Get-Item $RunnerZip).Length -eq $asset.size) {
        Ok "Reusing $($asset.name) already downloaded"
      } else {
        $part = "$RunnerZip.part"
        Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $part -UseBasicParsing
        Move-Item $part $RunnerZip -Force
        Ok "Downloaded $($asset.name)"
      }
    }
    & tar.exe -xf $RunnerZip -C $runnerDir
    if ($LASTEXITCODE -ne 0) { No "Could not unpack $RunnerZip"; exit 1 }
  }
  if (Get-Service "actions.runner.*" -ErrorAction SilentlyContinue | Where-Object { $_.Name -like "*$RunnerName*" }) {
    Ok "Runner service already registered"
  } else {
    if (-not $RunnerToken) { No "Pass -RunnerToken: GitHub -> emmanuel-arch/Interchange -> Settings -> Actions -> Runners -> New self-hosted runner (Windows). It lasts one hour."; exit 2 }
    # A registration that reached GitHub but failed to install its service (wrong
    # password: two -Runner runs at once each reset it) leaves .runner behind, and
    # config.cmd then refuses with "already configured". With no service there is
    # nothing to keep: clear it and register again with --replace.
    foreach ($f in ".runner", ".credentials", ".credentials_rsaparams") {
      $p = Join-Path $runnerDir $f
      if (Test-Path $p) { Remove-Item $p -Force; Note "cleared a half-finished registration ($f)" }
    }
    Push-Location $runnerDir
    try {
      $code = Invoke-Native (Join-Path $runnerDir "config.cmd") @("--unattended", "--url", $Repo, "--token", $RunnerToken, "--name", $RunnerName, "--labels", $RunnerLabel, "--work", "_work", "--replace", "--runasservice", "--windowslogonaccount", ".\$DeployUser", "--windowslogonpassword", $pw)
    } finally { Pop-Location }
    if ($code -ne 0) { No "Runner registration failed"; exit 1 }
    Ok "Runner registered as $RunnerName [self-hosted, windows, $RunnerLabel], running as $DeployUser"
  }
  Note "Then on GitHub: Settings -> Secrets and variables -> Actions -> Variables: INTERCHANGE_NODE_DEPLOY = on"
}

# =============================================================================
if ($Iis) {
  Head "Step: IIS front ($IisSite site -> http://localhost:$AppPort)"
  Import-Module WebAdministration
  $mods = @(Get-WebGlobalModule | ForEach-Object { $_.Name })
  $haveRewrite = $mods -contains "RewriteModule"
  $haveArr = @($mods | Where-Object { $_ -like "ApplicationRequestRouting*" }).Count -gt 0
  if (-not ($haveRewrite -and $haveArr)) { No "IIS URL Rewrite: $haveRewrite, ARR: $haveArr. The LMS kit installs both (install.ps1 -InstallArr there)."; exit 1 }
  Ok "URL Rewrite and ARR are installed"

  # ARR's proxy section is server-wide and the LMS already set it. Same values
  # here, so this is a check, not a change; anything different stops the step.
  $apphost = "MACHINE/WEBROOT/APPHOST"
  $want = [ordered]@{ enabled = $true; preserveHostHeader = $true; reverseRewriteHostInResponseHeaders = $false; includePortInXForwardedFor = $false; responseBufferLimit = 0; timeout = "00:05:00" }
  $now = Get-WebConfiguration -PSPath $apphost -Filter "system.webServer/proxy"
  $diff = @()
  foreach ($k in $want.Keys) { if ("$($now.$k)" -ne "$($want[$k])") { $diff += "$k=$($now.$k) -> $($want[$k])" } }
  if ($diff.Count -and $now.enabled -and -not $Force) { No "ARR proxy is enabled with other settings: $($diff -join '; '). Re-run with -Force only after checking the LMS site."; exit 1 }
  foreach ($k in $want.Keys) { Set-WebConfigurationProperty -PSPath $apphost -Filter "system.webServer/proxy" -Name $k -Value $want[$k] }
  Ok "ARR proxy settings match the LMS's"

  $siteDir = Join-Path $Root "site"
  New-Item -ItemType Directory -Force $siteDir | Out-Null
  $redirect = ""
  if ($RedirectHttps) {
    $redirect = @"
        <rule name="to-https" stopProcessing="true">
          <match url="(.*)" />
          <conditions><add input="{HTTPS}" pattern="off" /></conditions>
          <action type="Redirect" url="https://{HTTP_HOST}{UNENCODED_URL}" appendQueryString="false" redirectType="Permanent" />
        </rule>
"@
  }
  $webConfig = @"
<?xml version="1.0" encoding="utf-8"?>
<!-- Written by bridge/interchange-node/install.ps1. useOriginalURLEncoding="false" on <rules> (never on a <rule>): {UNENCODED_URL} is already encoded.
      Everything goes to the Interchange on localhost:$AppPort (Node listens on ::1; see launch.cjs). -->
<configuration>
  <system.webServer>
    <rewrite>
      <rules useOriginalURLEncoding="false">
        <rule name="acme-challenge" stopProcessing="true">
          <match url="^\.well-known/acme-challenge/" />
          <action type="None" />
        </rule>
$redirect        <rule name="interchange" stopProcessing="true">
          <match url="(.*)" />
          <serverVariables>
            <set name="HTTP_X_FORWARDED_PROTO" value="{MapProto:{HTTPS}}" />
          </serverVariables>
          <action type="Rewrite" url="http://localhost:$AppPort{UNENCODED_URL}" appendQueryString="false" />
        </rule>
      </rules>
      <rewriteMaps>
        <rewriteMap name="MapProto">
          <add key="on" value="https" />
          <add key="off" value="http" />
        </rewriteMap>
      </rewriteMaps>
    </rewrite>
    <urlCompression doStaticCompression="false" doDynamicCompression="false" />
    <httpErrors existingResponse="PassThrough" />
    <security>
      <requestFiltering allowDoubleEscaping="true">
        <requestLimits maxAllowedContentLength="52428800" maxUrl="8192" maxQueryString="8192" />
      </requestFiltering>
    </security>
  </system.webServer>
</configuration>
"@
  [IO.File]::WriteAllText((Join-Path $siteDir "web.config"), $webConfig, (New-Object Text.UTF8Encoding($false)))
  New-Item -ItemType Directory -Force (Join-Path $siteDir ".well-known\acme-challenge") | Out-Null

  if (-not (Test-Path "IIS:\AppPools\$IisSite")) {
    New-WebAppPool -Name $IisSite | Out-Null
    Set-ItemProperty "IIS:\AppPools\$IisSite" -Name managedRuntimeVersion -Value ""
    Ok "App pool $IisSite (No Managed Code, its own)"
  }
  if (-not (Get-Website -Name $IisSite -ErrorAction SilentlyContinue)) {
    if (-not $Hosts) { $Hosts = $PublicHosts }
    New-Website -Name $IisSite -PhysicalPath $siteDir -ApplicationPool $IisSite -Port 80 -HostHeader $Hosts[0] | Out-Null
    Ok "Site $IisSite created"
  }
  if (-not $Hosts) { $Hosts = $PublicHosts }
  $allowed = @(Get-WebConfiguration -PSPath $apphost -Location $IisSite -Filter "system.webServer/rewrite/allowedServerVariables/add" | ForEach-Object { $_.name })
  if ($allowed -notcontains "HTTP_X_FORWARDED_PROTO") {
    Add-WebConfigurationProperty -PSPath $apphost -Location $IisSite -Filter "system.webServer/rewrite/allowedServerVariables" -Name "." -Value @{ name = "HTTP_X_FORWARDED_PROTO" }
  }
  foreach ($h in $Hosts) {
    $taken = Get-WebBinding | Where-Object { $_.bindingInformation -match ":$([regex]::Escape($h))$" }
    $mine = $taken | Where-Object { $_.ItemXPath -match "@name='$IisSite'" }
    if ($taken -and -not $mine) { No "$h is already bound by another site: $($taken[0].ItemXPath)"; continue }
    if (-not (Get-WebBinding -Name $IisSite -Protocol http -HostHeader $h -Port 80)) { New-WebBinding -Name $IisSite -Protocol http -Port 80 -HostHeader $h }
    Ok "http://$h -> $IisSite"
  }
  # The Interchange signs people in itself: anonymous only, or IIS stamps a Basic
  # challenge on every 401 and browsers open their own sign-in box (the LMS met
  # this on 15 Oct 2026). A <location> entry for this site only.
  foreach ($k in "anonymousAuthentication", "basicAuthentication", "windowsAuthentication", "digestAuthentication") {
    $filter = "system.webServer/security/authentication/$k"
    try { $null = Get-WebConfigurationProperty -PSPath $apphost -Location $IisSite -Filter $filter -Name enabled } catch { continue }
    Set-WebConfigurationProperty -PSPath $apphost -Location $IisSite -Filter $filter -Name enabled -Value ($k -eq "anonymousAuthentication")
  }
  Ok "IIS authentication on ${IisSite}: anonymous only"
  Start-Website -Name $IisSite -ErrorAction SilentlyContinue
  $id = (Get-Website -Name $IisSite).id
  Ok "Site $IisSite (id $id) is $((Get-Website -Name $IisSite).State)"

  if ($RedirectHttps) {
    # The LMS on this machine calls the Interchange by name. With the certificate
    # issued, point the name at this machine so that call never leaves the box.
    $hostsFile = "$env:SystemRoot\System32\drivers\etc\hosts"
    $text = [IO.File]::ReadAllText($hostsFile)
    foreach ($h in $PublicHosts) {
      if ($text -notmatch "(?m)^\s*127\.0\.0\.1\s+$([regex]::Escape($h))\s*$") {
        [IO.File]::AppendAllText($hostsFile, "`r`n127.0.0.1 $h", (New-Object Text.ASCIIEncoding))
        Ok "hosts: 127.0.0.1 $h"
      } else { Ok "hosts already maps $h to 127.0.0.1" }
    }
  } else {
    Note "Certificates: once $($Hosts -join ', ') resolves to $NodeEgress, run win-acme (wacs.exe) and pick site $IisSite (id $id),"
    Note "or: wacs.exe --source iis --siteid $id --installation iis --accepttos --emailaddress <you>"
    Note "Then: .\install.ps1 -Iis -RedirectHttps"
  }
}
