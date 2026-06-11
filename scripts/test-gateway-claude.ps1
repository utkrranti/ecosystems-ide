# Quick Claude/gateway diagnostic -- run from IDE repo root after gateway is up.
$ErrorActionPreference = 'Continue'
$repoRoot = Split-Path -Parent $PSScriptRoot
$ecosystemsRoot = Split-Path -Parent $repoRoot
$envFile = Join-Path $ecosystemsRoot 'ide_apis\.env.local'
$token = 'dev-local-token'
if (Test-Path $envFile) {
	foreach ($line in Get-Content $envFile) {
		if ($line -match '^\s*DEV_SESSION_TOKEN\s*=\s*(.+)\s*$') {
			$token = $matches[1].Trim().Trim('"').Trim("'")
		}
	}
}

Write-Host "Token from ide_apis/.env.local: $token" -ForegroundColor Cyan
Write-Host "Gateway health..." -ForegroundColor Cyan
try {
	$h = Invoke-RestMethod -Uri 'http://localhost:8787/v1/ai/health' -Headers @{ Authorization = "Bearer $token" } -TimeoutSec 5
	Write-Host "  OK openai=$($h.openai) anthropic=$($h.anthropic)" -ForegroundColor Green
} catch {
	Write-Host "  FAILED: $_" -ForegroundColor Red
	Write-Host "Start gateway: .\scripts\run-all.ps1" -ForegroundColor Yellow
	exit 1
}

$body = @{
	model = 'claude-opus-4-8'
	messages = @(@{ role = 'user'; content = 'apply dark theme - use list_directory on .' })
	max_tokens = 2048
	stream = $false
	tools = @(@{
		type = 'function'
		function = @{
			name = 'list_directory'
			description = 'List directory'
			parameters = @{ type = 'object'; properties = @{ path = @{ type = 'string' } }; required = @('path') }
		}
	})
	tool_choice = 'auto'
} | ConvertTo-Json -Depth 10

Write-Host "Agent test (claude-opus-4-8 + tools)..." -ForegroundColor Cyan
try {
	$r = Invoke-WebRequest -Uri 'http://localhost:8787/v1/ai/chat/completions' -Method POST `
		-Headers @{ Authorization = "Bearer $token"; 'Content-Type' = 'application/json' } `
		-Body $body -TimeoutSec 120 -UseBasicParsing
	Write-Host "  HTTP $($r.StatusCode)" -ForegroundColor Green
	$json = $r.Content | ConvertFrom-Json
	if ($json.error) {
		Write-Host "  ERROR: $($json.error.message)" -ForegroundColor Red
	} elseif ($json.choices[0].message.tool_calls) {
		Write-Host "  TOOL CALLS: $($json.choices[0].message.tool_calls[0].function.name)" -ForegroundColor Green
	} elseif ($json.choices[0].message.content) {
		Write-Host "  TEXT ONLY (no tools): $($json.choices[0].message.content.Substring(0, [Math]::Min(120, $json.choices[0].message.content.Length)))" -ForegroundColor Yellow
	} else {
		Write-Host "  EMPTY response body:" -ForegroundColor Red
		Write-Host $r.Content
	}
} catch {
	Write-Host "  FAILED: $_" -ForegroundColor Red
	if ($_.Exception.Response) {
		$reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
		Write-Host $reader.ReadToEnd()
	}
}

Write-Host ""
Write-Host "If gateway test passes but IDE fails: recompile IDE (gulp compile-client-dev) and restart IDE." -ForegroundColor DarkGray
