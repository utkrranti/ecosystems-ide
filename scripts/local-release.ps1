<#
.SYNOPSIS
    Two-phase local release tool: BUILD then DEPLOY installer files to the VPS.

.DESCRIPTION
    Phase 1 (Build) - runs on this Windows machine:
      - Compiles and packages Windows EXE + MSI installers via build-installers.ps1
      - Stages output under release-staging\setups\windows\
      - Prints instructions for macOS + Linux (need separate machines / GitHub Actions)

    Phase 2 (Deploy) - uploads to VPS after you confirm testing is done:
      - SCPs release-staging\setups\{windows,macos,linux}\ to /var/www/altus-setups/
      - Applies the altuside.com nginx conf (adds /setups/ static-file location)
      - Prints the download URLs

    release-staging\ is .gitignored -- binaries never go into source control.

.PARAMETER SkipBuild
    Skip Phase 1 (useful if you already built and just want to deploy).

.PARAMETER SkipDeploy
    Skip Phase 2 (build only - for local testing before uploading).

.PARAMETER AutoDeploy
    Skip the "tested it?" confirmation prompt and deploy immediately after build.

.PARAMETER Arch
    Windows CPU arch: x64 (default) or arm64.

.PARAMETER SshHost
    SSH alias for the VPS (default: mentix-vps, connects as root).

.EXAMPLE
    .\scripts\local-release.ps1                   # Build Windows, then prompt to deploy
    .\scripts\local-release.ps1 -SkipDeploy       # Build only (test first)
    .\scripts\local-release.ps1 -SkipBuild        # Deploy already-staged files
    .\scripts\local-release.ps1 -AutoDeploy       # Build + deploy without prompt
#>
[CmdletBinding()]
param(
    [switch]$SkipBuild,
    [switch]$SkipDeploy,
    [switch]$AutoDeploy,
    [ValidateSet('x64', 'arm64')]
    [string]$Arch = 'x64',
    [string]$SshHost = 'mentix-vps'
)

$ErrorActionPreference = 'Stop'
$RepoRoot   = Split-Path -Parent $PSScriptRoot
$Version    = (Get-Content (Join-Path $RepoRoot 'package.json') -Raw | ConvertFrom-Json).version
$Staging    = Join-Path $RepoRoot 'release-staging\setups'
$RemotePath = '/var/www/altus-setups'

function Write-Step($msg) { Write-Host "`n--- $msg ---" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "  $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "  $msg" -ForegroundColor Yellow }

# Phase 1: Build
if (-not $SkipBuild) {
    Write-Step "Building Altus IDE v$Version for Windows ($Arch)"

    & "$RepoRoot\scripts\build-installers.ps1" -Arch $Arch
    if ($LASTEXITCODE -ne 0) { throw "build-installers.ps1 failed" }

    $DistDir  = Join-Path $RepoRoot "dist\win32-$Arch"
    $WinStage = Join-Path $Staging 'windows'
    New-Item -ItemType Directory -Force $WinStage | Out-Null

    Get-ChildItem $DistDir -Include '*.exe','*.msi' -Recurse | ForEach-Object {
        Copy-Item $_.FullName $WinStage
        Write-Ok "Staged: $($_.Name)"
    }

    Write-Step "Windows build done"
    Write-Host "  Staged at: release-staging\setups\windows\"
    Write-Host ""
    Write-Warn "macOS installers - build on a Mac then copy here:"
    Write-Host "  ./scripts/build-installers-mac.sh arm64   # Apple Silicon"
    Write-Host "  ./scripts/build-installers-mac.sh x64     # Intel"
    Write-Host "  Then copy dist/darwin-*/AltusIDE-darwin-*-$Version.dmg"
    Write-Host "       into  release-staging/setups/macos/"
    Write-Host ""
    Write-Warn "Linux installers - build in WSL2 then copy here:"
    Write-Host "  wsl -- bash scripts/build-installers-linux.sh x64 --deb"
    Write-Host "  Then copy dist/linux-x64/AltusIDE-linux-x64-$Version.{tar.gz,deb}"
    Write-Host "       into  release-staging/setups/linux/"
}

if ($SkipDeploy) {
    Write-Host "`nBuild-only mode -- skipping deploy.`n"
    return
}

# Phase 2: Confirm + Deploy
$staged = @()
foreach ($platform in 'windows', 'macos', 'linux') {
    $d = Join-Path $Staging $platform
    if (Test-Path $d) {
        $files = Get-ChildItem $d -File
        if ($files.Count -gt 0) { $staged += [PSCustomObject]@{ Platform = $platform; Files = $files } }
    }
}

if ($staged.Count -eq 0) {
    Write-Warn "No staged files found under release-staging\setups\. Build first."
    return
}

Write-Step "Files staged for upload"
foreach ($s in $staged) {
    Write-Host "  $($s.Platform):"
    $s.Files | ForEach-Object { Write-Host "    $($_.Name)" }
}

if (-not $AutoDeploy) {
    Write-Host ""
    Write-Warn "TEST THE INSTALLER BEFORE CONTINUING."
    Write-Host "  Install it, launch Altus IDE, verify AI features work."
    Write-Host ""
    $answer = Read-Host "Tested and ready to deploy to VPS? [y/N]"
    if ($answer -notmatch '^[yY]$') {
        Write-Host "Deploy cancelled. Run again with -SkipBuild when ready."
        return
    }
}

Write-Step "Uploading to ${SshHost}:${RemotePath}"

# Create remote directories
$mkdirs = ($staged | ForEach-Object { "$RemotePath/$($_.Platform)" }) -join ' '
ssh $SshHost "mkdir -p $mkdirs"

# Upload each platform + create -latest symlinks so the website URLs always resolve
foreach ($s in $staged) {
    $localDir = Join-Path $Staging $s.Platform
    Write-Host "  Uploading $($s.Platform) ($($s.Files.Count) file(s))..."
    scp "$localDir\*" "${SshHost}:${RemotePath}/$($s.Platform)/"

    # Create -latest copies for each file (removes old latest first)
    $latestCmds = $s.Files | ForEach-Object {
        $versioned = $_.Name
        # Replace -<version>. with -latest. e.g. AltusIDEUserSetup-x64-1.96.2.exe -> AltusIDEUserSetup-x64-latest.exe
        $latest = $versioned -replace '-[\d]+\.[\d]+\.[\d]+\.', '-latest.'
        if ($latest -ne $versioned) {
            "cp -f '$RemotePath/$($s.Platform)/$versioned' '$RemotePath/$($s.Platform)/$latest'"
        }
    }
    if ($latestCmds) {
        ssh $SshHost ($latestCmds -join ' && ')
    }
}

# Patch nginx to serve /setups/ if not already configured
Write-Step "Configuring nginx /setups/ on VPS"
$patchCmd = @'
set -euo pipefail
CONF=$(ls /etc/nginx/sites-available/altuside.com* 2>/dev/null | head -1)
if [[ -z "$CONF" ]]; then
  echo "WARN: no nginx conf found for altuside.com -- add /setups/ location manually" >&2
  exit 0
fi
if grep -q "location /setups" "$CONF" 2>/dev/null; then
  echo "nginx: /setups/ already in $CONF"
  exit 0
fi
sed -i 's|location / {|location /setups/ {\n        alias /var/www/altus-setups/;\n        add_header Content-Disposition attachment;\n        add_header Cache-Control "public, max-age=3600";\n        sendfile on;\n    }\n\n    location / {|' "$CONF"
nginx -t
systemctl reload nginx
echo "nginx: /setups/ location added and reloaded ($CONF)"
'@
ssh $SshHost "bash -s" <<< $patchCmd

# Done
Write-Step "Deploy complete - v$Version"
Write-Ok "https://altuside.com/setups/windows/AltusIDESetup-x64-${Version}.exe"
Write-Ok "https://altuside.com/setups/windows/AltusIDEUserSetup-x64-${Version}.exe"
Write-Ok "https://altuside.com/setups/windows/AltusIDE-x64-${Version}.msi"
Write-Ok "https://altuside.com/setups/macos/AltusIDE-darwin-arm64-${Version}.dmg"
Write-Ok "https://altuside.com/setups/macos/AltusIDE-darwin-x64-${Version}.dmg"
Write-Ok "https://altuside.com/setups/linux/AltusIDE-linux-x64-${Version}.tar.gz"
Write-Ok "https://altuside.com/setups/linux/AltusIDE-linux-x64-${Version}.deb"
Write-Host ""
Write-Host "Next: update the website download page to point at the above URLs."
Write-Host "Then: gh workflow run publish-update.yml --ref main  (updates IDE auto-update feed)"
