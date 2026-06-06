# PowerShell script to run the Electron IDE (and optionally the Rust CLI).
# Usage:
#   .\scripts\run-all.ps1              # IDE only (default, recommended)
#   .\scripts\run-all.ps1 -WithCli     # Also start the standalone Rust CLI
#
# NOTE: The Rust CLI in /cli is the standalone `code` tunnel/serve binary.
# It is NOT required to run the dev IDE. Building it on Windows requires
# OpenSSL (russh -> openssl-sys). If you need it, install OpenSSL (e.g. via
# vcpkg) or set $env:OPENSSL_DIR before launching with -WithCli.

param(
	[switch]$WithCli
)

$repoRoot = Split-Path -Parent $PSScriptRoot

if ($WithCli) {
	Write-Host "Starting Rust CLI in a new window..."
	Start-Process powershell -ArgumentList '-NoExit', '-Command', "cd '$repoRoot\cli'; cargo run --manifest-path Cargo.toml"
	Start-Sleep -Seconds 2
}

Write-Host "Starting Electron IDE..."
Push-Location $repoRoot
try {
	& "$repoRoot\scripts\code.bat"
} finally {
	Pop-Location
}
