<#
.SYNOPSIS
    Builds and launches Navik in dev mode (hot reload), or relaunches the last build as-is.

.PARAMETER NoBuild
    Skip the dev build and launch the last `.\build.ps1` output directly.

.EXAMPLE
    .\run.ps1
    .\run.ps1 -NoBuild
#>
param(
    [switch]$NoBuild
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$appDir = Join-Path $root "app"

Push-Location $appDir
try {
    if ($NoBuild) {
        Write-Host "==> Launching last build (no rebuild)" -ForegroundColor Cyan
        & npm run start
    }
    else {
        Write-Host "==> Starting dev server" -ForegroundColor Cyan
        & npm run dev
    }
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}
