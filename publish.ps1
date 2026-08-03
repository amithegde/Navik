<#
.SYNOPSIS
    Builds and packages Navik into a distributable navik.exe (NSIS installer + portable exe).

.PARAMETER Platform
    win (default), mac, or linux. Only win has actually been built/verified so far.

.EXAMPLE
    .\publish.ps1
    .\publish.ps1 -Platform mac
#>
param(
    [ValidateSet("win", "mac", "linux")]
    [string]$Platform = "win"
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$appDir = Join-Path $root "app"

function Invoke-Step {
    param([string]$Description, [string]$Command, [string[]]$Arguments)

    Write-Host "==> $Description" -ForegroundColor Cyan
    & $Command @Arguments
    return $LASTEXITCODE -eq 0
}

Push-Location $appDir
try {
    if (-not (Invoke-Step "Installing dependencies" "npm" @("install"))) {
        Write-Host "FAILED: npm install" -ForegroundColor Red
        exit 1
    }

    $npmScript = "dist:$Platform"

    # electron-builder's NSIS step occasionally fails with "Can't open output file" — a transient
    # file lock (commonly antivirus real-time scanning the freshly-written exe). One retry clears
    # it; seen and confirmed during development, not a hypothetical.
    $succeeded = Invoke-Step "Building and packaging ($Platform)" "npm" @("run", $npmScript)
    if (-not $succeeded) {
        Write-Host "==> Packaging failed, retrying once (often a transient file lock)..." -ForegroundColor Yellow
        Start-Sleep -Seconds 2
        $succeeded = Invoke-Step "Building and packaging ($Platform, retry)" "npm" @("run", $npmScript)
    }

    if (-not $succeeded) {
        Write-Host "FAILED: packaging did not succeed after retry" -ForegroundColor Red
        exit 1
    }
}
finally {
    Pop-Location
}

Write-Host "==> Packaging succeeded." -ForegroundColor Green
$distDir = Join-Path $appDir "dist"
$artifacts = Get-ChildItem -Path $distDir -Filter "*.exe" -ErrorAction SilentlyContinue
if ($artifacts) {
    $artifacts | ForEach-Object { Write-Host "    $($_.FullName)" }
}
else {
    Write-Host "    $distDir"
}
