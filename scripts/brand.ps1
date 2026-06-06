# Apply EcoSystems IDE branding to product.json (run after upstream sync)
$ErrorActionPreference = "Stop"
$productPath = Join-Path $PSScriptRoot "..\product.json"
$product = Get-Content $productPath -Raw | ConvertFrom-Json

$product.nameShort = "EcoSystems IDE"
$product.nameLong = "EcoSystems IDE"
$product.applicationName = "ecosystems-ide"
$product.dataFolderName = ".ecosystems-ide"
$product.win32MutexName = "ecosystemside"
$product.win32DirName = "EcoSystems IDE"
$product.win32NameVersion = "EcoSystems IDE"
$product.win32RegValueName = "EcoSystemsIDE"
$product.win32AppUserModelId = "EcoSystems.IDE"
$product.win32ShellNameShort = "EcoSystems &IDE"
$product.darwinBundleIdentifier = "com.ecosystems.ide"
$product.linuxIconName = "ecosystems-ide"
$product.urlProtocol = "ecosystems-ide"
$product.licenseUrl = "https://github.com/utkrranti/ecosystems-ide/blob/main/LICENSE.txt"
$product.reportIssueUrl = "https://github.com/utkrranti/ecosystems-ide/issues/new"

$json = $product | ConvertTo-Json -Depth 20
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($productPath, $json, $utf8NoBom)
Write-Host "Branding applied to product.json"
