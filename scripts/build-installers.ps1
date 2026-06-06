# Build Altus IDE Windows installers (.exe via Inno Setup, .msi via WiX).
# Usage (from IDE repo root):
#   .\scripts\build-installers.ps1
#   .\scripts\build-installers.ps1 -Arch x64 -SkipPackage   # reuse existing VSCode-win32-x64
#   .\scripts\build-installers.ps1 -ExeOnly
#   .\scripts\build-installers.ps1 -MsiOnly

param(
	[ValidateSet('x64', 'arm64')]
	[string]$Arch = 'x64',
	[switch]$SkipPackage,
	[switch]$ExeOnly,
	[switch]$MsiOnly
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$ecosystemsRoot = Split-Path -Parent $repoRoot
$gulp = Join-Path $repoRoot 'node_modules\gulp\bin\gulp.js'
$packageJson = Get-Content (Join-Path $repoRoot 'package.json') -Raw | ConvertFrom-Json
$version = $packageJson.version
$appDir = Join-Path $ecosystemsRoot "VSCode-win32-$Arch"
$distDir = Join-Path $repoRoot "dist\win32-$Arch"
$buildOut = Join-Path $repoRoot ".build\win32-$Arch"

function Invoke-Gulp {
	param([Parameter(Mandatory = $true)][string]$Task)
	if (-not (Test-Path $gulp)) {
		throw "Gulp not found. Run 'yarn' or 'npm install' in the IDE repo first."
	}
	Write-Host "gulp $Task" -ForegroundColor Cyan
	Push-Location $repoRoot
	try {
		node --max-old-space-size=8192 $gulp $Task
		if ($LASTEXITCODE -ne 0) { throw "gulp $Task failed (exit $LASTEXITCODE)" }
	} finally {
		Pop-Location
	}
}

function Rename-SetupExe {
	param(
		[string]$SetupSubDir,
		[string]$TargetName
	)
	$dir = Join-Path $buildOut $SetupSubDir
	$src = Join-Path $dir 'AltusIDESetup.exe'
	if (-not (Test-Path $src)) {
		$src = Join-Path $dir 'AltusIDEUserSetup.exe'
	}
	if (-not (Test-Path $src)) {
		$src = Join-Path $dir 'VSCodeSetup.exe'
	}
	if (-not (Test-Path $src)) {
		throw "Setup exe not found in $dir"
	}
	$dst = Join-Path $distDir $TargetName
	Copy-Item -LiteralPath $src -Destination $dst -Force
	Write-Host "EXE: $dst" -ForegroundColor Green
}

Write-Host "Altus IDE installer build - v$version ($Arch)" -ForegroundColor Cyan
New-Item -ItemType Directory -Path $distDir -Force | Out-Null

& (Join-Path $repoRoot 'scripts\brand.ps1')

if (-not $MsiOnly) {
	if (-not $SkipPackage) {
		Write-Host 'Packaging application (this can take 15-40 minutes)...' -ForegroundColor Yellow
		Invoke-Gulp "vscode-win32-$Arch-min"
		Invoke-Gulp "vscode-win32-$Arch-inno-updater"
	} elseif (-not (Test-Path $appDir)) {
		throw "Packaged app missing at $appDir. Run without -SkipPackage first."
	}

	Write-Host 'Building Inno Setup installers...' -ForegroundColor Cyan
	Invoke-Gulp "vscode-win32-$Arch-system-setup"
	Invoke-Gulp "vscode-win32-$Arch-user-setup"

	Rename-SetupExe -SetupSubDir 'system-setup' -TargetName "AltusIDESetup-$Arch-$version.exe"
	Rename-SetupExe -SetupSubDir 'user-setup' -TargetName "AltusIDEUserSetup-$Arch-$version.exe"
}

if (-not $ExeOnly) {
	if (-not (Test-Path $appDir)) {
		throw "Packaged app missing at $appDir. Build EXE installers first (omit -MsiOnly)."
	}
	Write-Host 'Building MSI installer (requires WiX Toolset v3)...' -ForegroundColor Cyan
	& (Join-Path $repoRoot 'build\win32\build-msi.ps1') `
		-SourceDir $appDir `
		-OutputDir $distDir `
		-Version $version `
		-Arch $Arch
}

Write-Host ''
Write-Host "Installers written to: $distDir" -ForegroundColor Green
Get-ChildItem $distDir -File | ForEach-Object { Write-Host "  $($_.Name)  ($([math]::Round($_.Length / 1MB, 1)) MB)" }
