@echo off
setlocal enabledelayedexpansion

REM Check for Administrator Privileges
net session >nul 2>&1
if "!errorlevel!" neq "0" (
    echo [INFO] Requesting Administrator privileges for build operations...
    powershell -Command "Start-Process '%~f0' -Verb RunAs" >nul 2>&1
    if "!errorlevel!" equ "0" (
        exit /b 0
    )
    echo [WARNING] Running without Administrator privileges.
)

echo ====================================================================
echo      FH6 HorizonTuner - Standalone Release Bundler
echo ====================================================================
echo.

set "ROOT_DIR=%~dp0"
cd /D "!ROOT_DIR!"

REM 1. Scan for unregistered directories dynamically via Node.js Single Source of Truth
echo [INFO] Scanning for unregistered resource directories...
echo --------------------------------------------------------------------
call node frontend/scripts/verify-resources.js
if errorlevel 1 (
    echo.
    echo [ERROR] Resource verification failed! Please register unhandled directories in tauri.conf.json or .pkgdirignore.
    if not "%GITHUB_ACTIONS%" == "true" pause
    exit /b 1
)
echo.

REM 2. Run Rust and Frontend Format & Clippy Check
echo [INFO] Verifying code formatting and clippy linting...
echo --------------------------------------------------------------------
cargo fmt --manifest-path "!ROOT_DIR!frontend\src-tauri\Cargo.toml" -- --check
if errorlevel 1 (
    echo [WARNING] Cargo formatting check reported issues. Auto-formatting...
    cargo fmt --manifest-path "!ROOT_DIR!frontend\src-tauri\Cargo.toml"
)

cargo clippy --manifest-path "!ROOT_DIR!frontend\src-tauri\Cargo.toml" --all-targets -- -D warnings
if errorlevel 1 (
    echo [ERROR] Cargo Clippy reported warnings or errors! Please fix them before building.
    if not "%GITHUB_ACTIONS%" == "true" pause
    exit /b 1
)

REM 3. Run Tauri Build
echo [INFO] Running Pure Rust Tauri Build...
echo --------------------------------------------------------------------
cd /D "!ROOT_DIR!frontend"
call npm install || exit /b 1
call npm run tauri build || exit /b 1

if errorlevel 1 (
    echo.
    echo [ERROR] Tauri Build encountered an error!
    if not "%GITHUB_ACTIONS%" == "true" pause
    exit /b 1
)
echo [SUCCESS] Standalone Pure Rust executable built successfully.
echo.
cd /D "!ROOT_DIR!"

REM 4. Verification of output binary
set "RELEASE_EXE=!ROOT_DIR!frontend\src-tauri\target\release\frontend.exe"
if exist "%RELEASE_EXE%" (
    echo ====================================================================
    echo      FH6 HorizonTuner Standalone Executable Created Successfully
    echo ====================================================================
    echo  Distribution Executable Path:
    echo  %RELEASE_EXE%
    echo.
) else (
    echo [INFO] Bundle created. Check frontend/src-tauri/target/release/bundle/ for installer packages.
)

if not "%GITHUB_ACTIONS%" == "true" pause
exit /b 0
