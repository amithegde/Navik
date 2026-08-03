<#
.SYNOPSIS
    Installs dependencies and builds the Navik Electron app.

.PARAMETER Clean
    Remove node_modules and the previous build output before installing/building.

.EXAMPLE
    .\build.ps1
    .\build.ps1 -Clean
#>
param(
    [switch]$Clean
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$appDir = Join-Path $root "app"

function Invoke-Step {
    param([string]$Description, [string]$Command, [string[]]$Arguments)

    Write-Host "==> $Description" -ForegroundColor Cyan
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
        Write-Host "FAILED: $Description (exit $LASTEXITCODE)" -ForegroundColor Red
        exit $LASTEXITCODE
    }
}

Push-Location $appDir
try {
    if ($Clean) {
        Write-Host "==> Cleaning node_modules and out" -ForegroundColor Cyan
        Remove-Item -Recurse -Force (Join-Path $appDir "node_modules") -ErrorAction SilentlyContinue
        Remove-Item -Recurse -Force (Join-Path $appDir "out") -ErrorAction SilentlyContinue
    }

    Invoke-Step "Installing dependencies" "npm" @("install")
    Invoke-Step "Type-checking and building" "npm" @("run", "build")
}
finally {
    Pop-Location
}

Write-Host "==> Build succeeded." -ForegroundColor Green
Write-Host "    $(Join-Path $appDir 'out')"
