@echo off
setlocal enabledelayedexpansion
title FH6 Telemetry Tuning Tool (Pure Rust Tauri)

REM Check for Administrator Privileges
net session >nul 2>&1
if "!errorlevel!" neq "0" (
    echo [INFO] Requesting Administrator privileges to prevent process cleanup errors...
    powershell -Command "Start-Process '%~f0' -Verb RunAs" >nul 2>&1
    if "!errorlevel!" equ "0" (
        exit /b 0
    )
    echo [WARNING] Running without Administrator privileges. Process cleanup may be limited.
)

echo ====================================================================
echo      FH6 HorizonTuner - Development Launcher
echo ====================================================================
echo.

set "ROOT_DIR=%~dp0"
cd /D "!ROOT_DIR!"

REM 1. Check Node.js environment
where node >nul 2>nul
if "!errorlevel!" neq "0" (
    echo [ERROR] Node.js is not installed or not in PATH.
    echo Please install Node.js v18 or newer to run the frontend dev environment.
    pause
    exit /b 1
)

REM 2. Check Rust and Cargo environment
where cargo >nul 2>nul
if "!errorlevel!" neq "0" (
    echo [ERROR] Rust / Cargo toolchain is not installed or not in PATH.
    echo Please install Rust via https://rustup.rs/ to build the Pure Rust backend.
    pause
    exit /b 1
)

REM 3. Run Rust format check and auto-formatting
echo [INFO] Running Rust and Frontend format check...
cargo fmt --manifest-path "!ROOT_DIR!frontend\src-tauri\Cargo.toml" >nul 2>nul

REM 4. Terminate old running instances and release port 1420 (Gracefully)
echo [INFO] Cleaning up previous running instances...
taskkill /F /IM "frontend.exe" /T >nul 2>nul
taskkill /F /FI "WINDOWTITLE eq FH6 Telemetry*" /T >nul 2>nul

for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| find ":1420" ^| find "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>nul
)

REM 5. Configure Windows Firewall for UDP Telemetry
echo [INFO] Configuring Windows Firewall for UDP Port 8000...
netsh advfirewall firewall delete rule name="FH6_HorizonTuner_UDP_8000" >nul 2>&1
netsh advfirewall firewall add rule name="FH6_HorizonTuner_UDP_8000" dir=in action=allow protocol=UDP localport=8000 >nul 2>&1

echo [INFO] Launching Pure Rust Tauri Application in Dev Mode...
cd /D "!ROOT_DIR!frontend"
call npm run tauri dev

echo.
echo Dev environment closed.
pause
