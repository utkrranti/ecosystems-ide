# Altus IDE - one command to run local dev (Go API gateway + IDE).
# Usage:
#   .\scripts\run-all.ps1              # Stop stale dev processes, start gateway, launch IDE
#   .\scripts\run-all.ps1 -WithCli     # Also start the standalone Rust CLI
#   .\scripts\run-all.ps1 -SkipGateway # IDE only (gateway must already be running)
#   .\scripts\run-all.ps1 -SkipStop    # Do not stop existing IDE/gulp/gateway processes

param(
	[switch]$WithCli,
	[switch]$SkipGateway,
	[switch]$SkipStop
)

$ErrorActionPreference = 'Continue'
$repoRoot = Split-Path -Parent $PSScriptRoot
$ecosystemsRoot = Split-Path -Parent $repoRoot
$gatewayRoot = Join-Path $ecosystemsRoot 'ide_apis'
$gatewayBinary = Join-Path $gatewayRoot 'bin\gateway.exe'
$gatewayPort = 8787
# After a full stop we always restart the gateway (avoids "already running" on a dead port).
$script:GatewayFreshStart = -not $SkipStop

function Get-DevSessionToken {
	$envFile = Join-Path $gatewayRoot '.env.local'
	if (Test-Path $envFile) {
		foreach ($line in Get-Content $envFile) {
			if ($line -match '^\s*DEV_SESSION_TOKEN\s*=\s*(.+)\s*$') {
				return $matches[1].Trim().Trim('"').Trim("'")
			}
		}
	}
	return 'dev-local-token'
}

function Stop-ListenerOnPort {
	param([int]$Port)
	try {
		$connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
		foreach ($c in $connections) {
			$pid = $c.OwningProcess
			if ($pid -and $pid -ne 0) {
				Write-Host "  Stopping process on port ${Port} (PID $pid)" -ForegroundColor DarkGray
				Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
			}
		}
	} catch {
		# Get-NetTCPConnection may be unavailable; ignore.
	}
}

function Stop-DevProcesses {
	Write-Host 'Stopping previous Altus IDE dev processes...' -ForegroundColor Cyan

	# Dev Electron build launched from this repo
	Get-Process -ErrorAction SilentlyContinue | Where-Object {
		$_.Path -and ($_.Path -like '*EcoSystems\IDE\.build\electron*' -or $_.Path -like '*Altus*\.build\electron*' -or $_.Path -match '\\IDE\\\.build\\electron')
	} | ForEach-Object {
		Write-Host "  Stopping $($_.ProcessName) (PID $($_.Id))"
		Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
	}

	# Go API gateway (ide_apis)
	Get-Process -ErrorAction SilentlyContinue -Name 'gateway' | Where-Object {
		$_.Path -and $_.Path -like '*ide_apis*'
	} | ForEach-Object {
		Write-Host "  Stopping gateway (PID $($_.Id))"
		Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
	}

	# gulp watch / legacy node gateway / deemon tied to this repo
	Get-CimInstance Win32_Process -Filter "name='node.exe'" -ErrorAction SilentlyContinue | Where-Object {
		$_.CommandLine -and (
			$_.CommandLine -match [regex]::Escape($repoRoot) -and
			($_.CommandLine -match 'gulp|watch-client|deemon|services\\gateway|services/gateway')
		)
	} | ForEach-Object {
		Write-Host "  Stopping node (PID $($_.ProcessId))"
		Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
	}

	Stop-ListenerOnPort -Port $gatewayPort
	Start-Sleep -Seconds 1
}

function Test-GatewayHealthy {
	param([string]$Token)
	try {
		$uri = "http://localhost:$gatewayPort/v1/ai/health"
		$headers = @{ Authorization = "Bearer $Token" }
		$response = Invoke-WebRequest -Uri $uri -Headers $headers -TimeoutSec 3 -UseBasicParsing
		if ($response.StatusCode -ne 200) {
			return $false
		}
		return $response.Content -match '"ok"\s*:\s*true'
	} catch {
		return $false
	}
}

function Ensure-GatewayBuilt {
	if (Test-Path $gatewayBinary) {
		return $true
	}
	if (-not (Get-Command go -ErrorAction SilentlyContinue)) {
		Write-Warning 'Go is not installed. Install Go 1.22+ from https://go.dev/dl/ and retry.'
		return $false
	}
	Write-Host 'Building Go API gateway (first run)...' -ForegroundColor Cyan
	Push-Location $gatewayRoot
	try {
		New-Item -ItemType Directory -Path (Split-Path $gatewayBinary) -Force | Out-Null
		go build -trimpath -ldflags="-s -w" -o $gatewayBinary ./cmd/gateway
		if ($LASTEXITCODE -ne 0) {
			Write-Warning 'Go build failed. Fix ide_apis and retry.'
			return $false
		}
	} finally {
		Pop-Location
	}
	return (Test-Path $gatewayBinary)
}

function Start-GatewayServer {
	if (-not (Test-Path $gatewayRoot)) {
		Write-Warning "API gateway folder not found: $gatewayRoot"
		return $false
	}

	if (-not (Ensure-GatewayBuilt)) {
		return $false
	}

	$token = Get-DevSessionToken

	if (-not $script:GatewayFreshStart -and (Test-GatewayHealthy -Token $token)) {
		Write-Host "AI gateway already running on http://localhost:$gatewayPort" -ForegroundColor Green
		return $true
	}

	if ($script:GatewayFreshStart) {
		Write-Host 'Restarting AI gateway (fresh start after stop)...' -ForegroundColor Cyan
		Stop-ListenerOnPort -Port $gatewayPort
		Start-Sleep -Milliseconds 500
	} elseif (Test-GatewayHealthy -Token $token) {
		return $true
	}

	Write-Host "Starting Go API gateway on http://localhost:$gatewayPort ..." -ForegroundColor Cyan
	$gatewayCmd = @"
Set-Location -LiteralPath '$gatewayRoot'
Write-Host 'Altus AI Gateway (Go) - keep this window open' -ForegroundColor Cyan
& '$gatewayBinary'
"@
	Start-Process powershell -ArgumentList '-NoExit', '-Command', $gatewayCmd -WindowStyle Minimized

	$deadline = (Get-Date).AddSeconds(45)
	while ((Get-Date) -lt $deadline) {
		if (Test-GatewayHealthy -Token $token) {
			Write-Host 'AI gateway is ready.' -ForegroundColor Green
			return $true
		}
		Start-Sleep -Milliseconds 500
	}

	Write-Warning @"
Gateway did not respond to /v1/ai/health within 45s.
  - Check ide_apis/.env.local (OPENAI_API_KEY, DEV_SESSION_TOKEN)
  - Ensure port $gatewayPort is free
  - IDE setting: altusAI.gateway.baseUrl = http://localhost:$gatewayPort/v1
"@
	return $false
}

function Sync-WorkbenchHtml {
	# compile only emits JS; CSP lives in HTML under src/. Sync into out/ before launch.
	$srcDir = Join-Path $repoRoot 'src\vs\code\electron-sandbox\workbench'
	$outDir = Join-Path $repoRoot 'out\vs\code\electron-sandbox\workbench'
	if (-not (Test-Path $srcDir)) {
		return
	}
	if (-not (Test-Path $outDir)) {
		New-Item -ItemType Directory -Path $outDir -Force | Out-Null
	}
	foreach ($name in @('workbench-dev.html', 'workbench.html')) {
		$src = Join-Path $srcDir $name
		$dst = Join-Path $outDir $name
		if (Test-Path $src) {
			Copy-Item -LiteralPath $src -Destination $dst -Force
		}
	}
}

function Ensure-IdeCompiled {
	$mainJs = Join-Path $repoRoot 'out\main.js'
	if (Test-Path $mainJs) {
		return
	}
	Write-Host 'out\main.js missing -- compiling (incremental, no clean-out)...' -ForegroundColor Yellow
	Push-Location $repoRoot
	try {
		# compile-client-dev skips rimraf('out') -- full compile-client often hits EPERM on locked __snapshots__ on Windows.
		node ./node_modules/gulp/bin/gulp.js compile-client-dev
		if ($LASTEXITCODE -ne 0) {
			Write-Warning @"
Incremental compile failed (exit $LASTEXITCODE).
  - Close Altus IDE and any node/gulp processes, then run .\scripts\run-all.ps1 again.
  - If it still fails, delete the out folder manually and retry.
"@
			Write-Error "Compile failed (exit $LASTEXITCODE)."
			exit $LASTEXITCODE
		}
	} finally {
		Pop-Location
	}
	if (-not (Test-Path $mainJs)) {
		Write-Error "Compile finished but out\main.js is still missing."
		exit 1
	}
	Write-Host 'Compile OK.' -ForegroundColor Green
}

# --- main ---

if (-not $SkipStop) {
	Stop-DevProcesses
}

Ensure-IdeCompiled

Sync-WorkbenchHtml

$gatewayOk = $true
if (-not $SkipGateway) {
	$gatewayOk = Start-GatewayServer
	if (-not $gatewayOk) {
		Write-Host ''
		Write-Host 'Gateway is not ready -- IDE will open but Altus AI chat will fail until the gateway is running.' -ForegroundColor Yellow
		Write-Host "Fix the gateway, then run: .\scripts\run-all.ps1" -ForegroundColor Yellow
		Write-Host ''
	}
}

if ($WithCli) {
	Write-Host 'Starting Rust CLI in a new window...' -ForegroundColor Cyan
	Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location -LiteralPath '$repoRoot\cli'; cargo run --manifest-path Cargo.toml"
	Start-Sleep -Seconds 2
}

Write-Host 'Starting Altus IDE (compile runs via preLaunch if needed)...' -ForegroundColor Cyan
Push-Location $repoRoot
try {
	& "$repoRoot\scripts\code.bat"
} finally {
	Pop-Location
}
