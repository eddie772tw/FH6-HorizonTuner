param(
    [switch]$DebugBuild,
    [switch]$UseVerifiedFrontendDist
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location $projectRoot
try {
    $companionEntry = Join-Path $projectRoot 'frontend/dist/companion/index.html'
    $frontendAssets = Join-Path $projectRoot 'frontend/dist/assets'
    if ($UseVerifiedFrontendDist) {
        if (-not (Test-Path -LiteralPath $companionEntry -PathType Leaf)) {
            throw "Verified frontend distribution is missing the companion entrypoint: $companionEntry"
        }
        if (-not (Test-Path -LiteralPath $frontendAssets -PathType Container)) {
            throw "Verified frontend distribution is missing its assets directory: $frontendAssets"
        }
    } else {
        Write-Host 'Building frontend distribution before compiling the Rust sidecar.'
        & pnpm --prefix frontend run build
        if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed; refusing to compile a sidecar with stale assets.' }
    }

    if (-not (Test-Path -LiteralPath $companionEntry -PathType Leaf)) {
        throw "Frontend distribution is missing the companion entrypoint: $companionEntry"
    }

    if ($env:OS -eq 'Windows_NT' -and $env:FH6_REQUIRE_ADB -ne '0') {
        & pwsh -NoProfile -File (Join-Path $projectRoot 'scripts/prepare_adb.ps1')
        if ($LASTEXITCODE -ne 0) { throw 'ADB staging failed; refusing to compile the Windows sidecar.' }
    }

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
        Copy-Item -LiteralPath (Join-Path $projectRoot 'backend-rust/target/release/fh6-agent.exe') -Destination (Join-Path $projectRoot 'dist/fh6-agent.exe') -Force
    }
} finally { Pop-Location }
