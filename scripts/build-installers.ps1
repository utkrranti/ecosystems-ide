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

	Write-Host 'Building Inno Setup installers (user-setup + system-setup in parallel)...' -ForegroundColor Cyan
	$logDir = Join-Path $repoRoot '.build\logs'
	New-Item -ItemType Directory -Path $logDir -Force | Out-Null

	$setupTasks = @('system-setup', 'user-setup')
	$setupProcs = $setupTasks | ForEach-Object {
		$t = "vscode-win32-$Arch-$_"
		$logOut = Join-Path $logDir "$t.log"
		$logErr = Join-Path $logDir "$t.err"
		Write-Host "  [parallel] gulp $t" -ForegroundColor DarkCyan
		$p = Start-Process -FilePath node -ArgumentList "--max-old-space-size=8192", $gulp, $t `
			-WorkingDirectory $repoRoot -PassThru -NoNewWindow `
			-RedirectStandardOutput $logOut -RedirectStandardError $logErr
		[PSCustomObject]@{ Name = $_; Task = $t; Process = $p; LogOut = $logOut; LogErr = $logErr }
	}

	$setupProcs | ForEach-Object { $_.Process.WaitForExit() }

	$setupFailed = @()
	foreach ($s in $setupProcs) {
		if ($s.Process.ExitCode -ne 0) {
			Write-Host "  FAILED: gulp $($s.Task) (exit $($s.Process.ExitCode))" -ForegroundColor Red
			if (Test-Path $s.LogErr) { Get-Content $s.LogErr | Select-Object -Last 30 | Write-Host }
			elseif (Test-Path $s.LogOut) { Get-Content $s.LogOut | Select-Object -Last 30 | Write-Host }
			$setupFailed += $s.Task
		} else {
			Write-Host "  OK: gulp $($s.Task)" -ForegroundColor Green
		}
	}
	if ($setupFailed.Count -gt 0) { throw "Setup builds failed: $($setupFailed -join ', ')" }

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
