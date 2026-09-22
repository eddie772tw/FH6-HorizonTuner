param([switch]$DebugBuild)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location $projectRoot
try {
    $buildArgs = @('build', '--locked', '--manifest-path', 'backend-rust/Cargo.toml')
    if (-not $DebugBuild) { $buildArgs += '--release' }
    & cargo @buildArgs
    if ($LASTEXITCODE -ne 0) { throw 'Rust backend build failed.' }
    if (-not $DebugBuild) {
        $binary = Join-Path $projectRoot 'backend-rust/target/release/server-sidecar.exe'
        foreach ($directory in @('dist', 'frontend/src-tauri/bin')) {
            $destination = Join-Path $projectRoot $directory
            New-Item -ItemType Directory -Force -Path $destination | Out-Null
            Copy-Item -LiteralPath $binary -Destination (Join-Path $destination 'server-sidecar-x86_64-pc-windows-msvc.exe') -Force
        }
    }
} finally { Pop-Location }
