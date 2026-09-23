param(
    [switch]$ForceDownload
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$configPath = Join-Path $projectRoot 'config/adb-windows.json'
$stageRoot = Join-Path $projectRoot '.tools/adb/windows'
$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
$expectedFiles = @($config.files.psobject.Properties.Name)

function Get-Sha256([string]$path) {
    return (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToUpperInvariant()
}

function Test-StagedFiles {
    if (-not (Test-Path -LiteralPath $stageRoot -PathType Container)) { return $false }
    foreach ($name in $expectedFiles) {
        $path = Join-Path $stageRoot $name
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { return $false }
        $expected = ([string]$config.files.$name).ToUpperInvariant()
        if ((Get-Sha256 $path) -ne $expected) { return $false }
    }
    $unexpected = @(Get-ChildItem -LiteralPath $stageRoot -File | Where-Object { $_.Name -notin $expectedFiles })
    if ($unexpected.Count -gt 0) {
        throw "ADB staging directory contains unexpected files: $($unexpected.Name -join ', ')"
    }
    return $true
}

if (-not $ForceDownload -and (Test-StagedFiles)) {
    Write-Host "ADB Platform-Tools $($config.version) cache is valid: $stageRoot"
    exit 0
}

$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ('fh6-adb-' + [guid]::NewGuid().ToString('N'))
$archivePath = Join-Path $tempRoot 'platform-tools.zip'
$extractRoot = Join-Path $tempRoot 'extract'
New-Item -ItemType Directory -Path $tempRoot, $extractRoot -Force | Out-Null
try {
    Write-Host "Downloading verified Android Platform-Tools $($config.version)."
    Invoke-WebRequest -Uri ([string]$config.archiveUrl) -OutFile $archivePath
    $archiveHash = Get-Sha256 $archivePath
    if ($archiveHash -ne ([string]$config.archiveSha256).ToUpperInvariant()) {
        throw "Platform-Tools archive hash mismatch. Expected $($config.archiveSha256), got $archiveHash."
    }

    Expand-Archive -LiteralPath $archivePath -DestinationPath $extractRoot
    $sourceRoot = Join-Path $extractRoot 'platform-tools'
    if (-not (Test-Path -LiteralPath $sourceRoot -PathType Container)) {
        throw 'Platform-Tools archive has no platform-tools directory.'
    }
    foreach ($name in $expectedFiles) {
        $source = Join-Path $sourceRoot $name
        if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
            throw "Platform-Tools archive is missing $name."
        }
        $expected = ([string]$config.files.$name).ToUpperInvariant()
        $actual = Get-Sha256 $source
        if ($actual -ne $expected) {
            throw "$name hash mismatch. Expected $expected, got $actual."
        }
    }

    New-Item -ItemType Directory -Path $stageRoot -Force | Out-Null
    foreach ($name in $expectedFiles) {
        Copy-Item -LiteralPath (Join-Path $sourceRoot $name) -Destination (Join-Path $stageRoot $name) -Force
    }
    if (-not (Test-StagedFiles)) { throw 'ADB staging validation failed after extraction.' }
    Write-Host "ADB Platform-Tools staged at $stageRoot"
} finally {
    if (Test-Path -LiteralPath $tempRoot) {
        Remove-Item -LiteralPath $tempRoot -Recurse -Force
    }
}
