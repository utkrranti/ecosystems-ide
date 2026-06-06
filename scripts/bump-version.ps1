<#
.SYNOPSIS
    Bumps the version in package.json and prints the new version.
.PARAMETER Type
    Which part to increment: major, minor, or patch (default: patch).
.EXAMPLE
    .\scripts\bump-version.ps1           # 1.0.0 -> 1.0.1
    .\scripts\bump-version.ps1 -Type minor  # 1.0.0 -> 1.1.0
    .\scripts\bump-version.ps1 -Type major  # 1.0.0 -> 2.0.0
#>
param(
    [ValidateSet('major', 'minor', 'patch')]
    [string]$Type = 'patch'
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
$PkgJson = Join-Path $RepoRoot 'package.json'

$pkg = Get-Content $PkgJson -Raw | ConvertFrom-Json
$ver = [version]$pkg.version

switch ($Type) {
    'major' { $next = [version]::new($ver.Major + 1, 0, 0) }
    'minor' { $next = [version]::new($ver.Major, $ver.Minor + 1, 0) }
    'patch' { $next = [version]::new($ver.Major, $ver.Minor, $ver.Build + 1) }
}

$raw = Get-Content $PkgJson -Raw
$updated = $raw -replace '"version"\s*:\s*"[^"]+"', "`"version`": `"$next`""
$updated | Set-Content $PkgJson -NoNewline -Encoding utf8

Write-Host "Version bumped: $($pkg.version) -> $next"
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Build and test: .\scripts\build-installers.ps1"
Write-Host "  2. Commit:         git add package.json && git commit -m `"chore: bump version to $next`""
Write-Host "  3. Push:           git push origin develop && git push origin develop:main"
Write-Host "  4. Publish:        gh workflow run publish-update.yml --ref main"
