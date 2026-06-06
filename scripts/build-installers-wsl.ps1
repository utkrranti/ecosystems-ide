# Build Linux installers from Windows via WSL2 (portable .tar.gz + optional .deb).
# Usage:
#   .\scripts\build-installers-wsl.ps1
#   .\scripts\build-installers-wsl.ps1 -Arch arm64 -Deb

param(
	[ValidateSet('x64', 'arm64')]
	[string]$Arch = 'x64',
	[switch]$Deb
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$wslRepo = (wsl wslpath -a $repoRoot).Trim()

$debFlag = if ($Deb) { '--deb' } else { '' }

Write-Host 'Building Linux installers inside WSL2...' -ForegroundColor Cyan
Write-Host "Repo (WSL): $wslRepo" -ForegroundColor DarkGray

$bashCmd = @"
set -e
cd '$wslRepo'
chmod +x scripts/build-installers-linux.sh
./scripts/build-installers-linux.sh $Arch $debFlag
"@

wsl -e bash -lc $bashCmd

Write-Host ''
Write-Host "Linux artifacts: $repoRoot\dist\linux-$Arch" -ForegroundColor Green
