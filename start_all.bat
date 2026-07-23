@echo off
setlocal enabledelayedexpansion
title FH6 Telemetry Tuning Tool (Pure Rust Tauri)

echo ====================================================================
echo      FH6 HorizonTuner - Development Launcher
echo ====================================================================
echo.

cd /D "%~dp0"

:: 1. Check Node.js environment
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH.
    echo Please install Node.js (v18+) to run the frontend dev environment.
    pause
    exit /b 1
)

:: 2. Check Rust & Cargo environment
where cargo >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Rust / Cargo toolchain is not installed or not in PATH.
    echo Please install Rust via rustup (https://rustup.rs/) to build the Pure Rust backend.
    pause
    exit /b 1
)

:: 3. Run Rust format check and auto-formatting
echo [INFO] Running Rust & Frontend format check...
cargo fmt --manifest-path frontend/src-tauri/Cargo.toml >nul 2>nul

:: 4. Terminate old running instances to prevent port/window conflicts
echo [INFO] Cleaning up previous running instances...
taskkill /F /IM "frontend.exe" /T >nul 2>nul
taskkill /F /FI "WINDOWTITLE eq FH6 Telemetry*" /T >nul 2>nul

echo [INFO] Launching Pure Rust Tauri Application in Dev Mode...
cd frontend
call npm run tauri dev

echo Dev environment closed.
pause
