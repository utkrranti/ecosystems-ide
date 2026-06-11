# Apply Altus IDE branding to product.json (run after upstream sync)
$ErrorActionPreference = "Stop"
$productPath = Join-Path $PSScriptRoot "..\product.json"
$product = Get-Content $productPath -Raw | ConvertFrom-Json

$product.nameShort = "Altus IDE"
$product.nameLong = "Altus IDE"
$product.applicationName = "altus-ide"
$product.dataFolderName = ".altus-ide"
$product.win32MutexName = "altuside"
$product.win32DirName = "Altus IDE"
$product.win32NameVersion = "Altus IDE"
$product.win32RegValueName = "AltusIDE"
$product.win32AppUserModelId = "Altus.IDE"
$product.win32ShellNameShort = "Altus &IDE"
$product.darwinBundleIdentifier = "com.altus.ide"
$product.linuxIconName = "altus-ide"
$product.urlProtocol = "altus-ide"
$product.licenseUrl = "https://github.com/utkrranti/ecosystems-ide/blob/main/LICENSE.txt"
$product.reportIssueUrl = "https://github.com/utkrranti/ecosystems-ide/issues/new"

$json = $product | ConvertTo-Json -Depth 20
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($productPath, $json, $utf8NoBom)
Write-Host "Branding applied to product.json (Altus IDE / Altus AI)"
