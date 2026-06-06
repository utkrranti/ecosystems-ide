# Build Altus IDE MSI from a packaged VSCode-win32-* folder using WiX Toolset v3.
param(
	[Parameter(Mandatory = $true)][string]$SourceDir,
	[Parameter(Mandatory = $true)][string]$OutputDir,
	[Parameter(Mandatory = $true)][string]$Version,
	[string]$Arch = 'x64'
)

$ErrorActionPreference = 'Stop'

function Get-WixBinDir {
	if ($env:WIX) {
		$bin = Join-Path $env:WIX 'bin'
		if (Test-Path (Join-Path $bin 'candle.exe')) { return $bin }
	}
	$candidates = @(
		"${env:ProgramFiles(x86)}\WiX Toolset v3.14\bin",
		"${env:ProgramFiles(x86)}\WiX Toolset v3.11\bin",
		"${env:ProgramFiles}\WiX Toolset v3.14\bin",
		"${env:ProgramFiles}\WiX Toolset v3.11\bin"
	)
	foreach ($dir in $candidates) {
		if (Test-Path (Join-Path $dir 'candle.exe')) { return $dir }
	}
	return $null
}

$wixBin = Get-WixBinDir
if (-not $wixBin) {
	Write-Error @"
WiX Toolset v3.11+ not found.
Install it, then re-run:
  winget install --id WiXToolset.WiXToolset -e
Or download from https://wixtoolset.org/
"@
}

$heat = Join-Path $wixBin 'heat.exe'
$candle = Join-Path $wixBin 'candle.exe'
$light = Join-Path $wixBin 'light.exe'

if (-not (Test-Path $SourceDir)) {
	Write-Error "Packaged app not found: $SourceDir"
}

$repoRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$workDir = Join-Path $OutputDir 'msi-work'
$harvestWxs = Join-Path $workDir 'harvested-files.wxs'
$productWxs = Join-Path $PSScriptRoot 'altus-ide-product.wxs'

New-Item -ItemType Directory -Path $workDir -Force | Out-Null
New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

# WiX requires 4-part version (e.g. 1.96.2.0).
$parts = $Version -split '\.'
while ($parts.Count -lt 4) { $parts += '0' }
$productVersion = ($parts[0..3] -join '.')

Write-Host "Harvesting files from $SourceDir ..." -ForegroundColor Cyan
& $heat dir $SourceDir `
	-cg HarvestedFiles `
	-dr INSTALLFOLDER `
	-var var.SourceDir `
	-gg -scom -sreg -sfrag -srd `
	-out $harvestWxs
if ($LASTEXITCODE -ne 0) { throw "heat.exe failed ($LASTEXITCODE)" }

Write-Host 'Compiling WiX sources...' -ForegroundColor Cyan
$wixobjs = @()
foreach ($wxs in @($productWxs, $harvestWxs)) {
	$obj = Join-Path $workDir (([IO.Path]::GetFileNameWithoutExtension($wxs)) + '.wixobj')
	& $candle -nologo -arch x64 -dProductVersion=$productVersion -dSourceDir=$SourceDir -out $obj $wxs
	if ($LASTEXITCODE -ne 0) { throw "candle.exe failed on $wxs ($LASTEXITCODE)" }
	$wixobjs += $obj
}

$msiName = "AltusIDE-$Arch-$Version.msi"
$msiPath = Join-Path $OutputDir $msiName
Write-Host "Linking $msiName ..." -ForegroundColor Cyan
& $light -nologo -ext WixUIExtension -sice:ICE61 -sice:ICE91 -out $msiPath @wixobjs
if ($LASTEXITCODE -ne 0) { throw "light.exe failed ($LASTEXITCODE)" }

Write-Host "MSI created: $msiPath" -ForegroundColor Green
