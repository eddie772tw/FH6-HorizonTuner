@echo off
setlocal enabledelayedexpansion
title FH6 Telemetry Tuning Tool

cd /D "%~dp0"
set "UV_EXE=uv"
set "VENV_PY=%~dp0.venv\Scripts\python.exe"

where.exe uv >nul 2>nul
if errorlevel 1 (
    echo [ERROR] uv was not found on PATH. Install uv and retry.
    pause
    exit /b 1
)

call "%~dp0setup_venv.bat"
if errorlevel 1 (
    pause
    exit /b 1
)
set "VENV_DIR=%~dp0.venv"

:: Run Ruff if available.
if exist "%VENV_PY%" (
    echo [INFO] Running Ruff check ^& format...
    "%UV_EXE%" run --no-project --python "%VENV_PY%" ruff check . --fix
    "%UV_EXE%" run --no-project --python "%VENV_PY%" ruff format .
)

:: Auto-format the Tauri host, then verify the Rust format contract.
where.exe cargo >nul 2>nul
if errorlevel 1 (
    echo [WARNING] cargo was not found on PATH. Skipping Rust format checks.
) else (
    echo [INFO] Running cargo fmt auto-fix...
    cargo fmt --manifest-path "%~dp0frontend\src-tauri\Cargo.toml"
    if errorlevel 1 (
        echo [ERROR] cargo fmt auto-fix failed.
        pause
        exit /b 1
    )
    echo [INFO] Verifying Rust formatting...
    cargo fmt --manifest-path "%~dp0frontend\src-tauri\Cargo.toml" -- --check
    if errorlevel 1 (
        echo [ERROR] Rust formatting check failed after auto-fix.
        pause
        exit /b 1
    )
)

:: Terminate old instances to prevent backend port conflicts.
echo [INFO] Terminating old backend instances to prevent port conflicts...
taskkill /F /FI "WINDOWTITLE eq FH6 Telemetry Backend*" /T >nul 2>nul
for /f "tokens=5" %%a in ('netstat -aon ^| find ":8001" ^| find "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>nul
)

:: Clean up stale port files to prevent the frontend from latching onto a previous session.
if exist "%~dp0logs\web_port.txt" del /f /q "%~dp0logs\web_port.txt" >nul 2>nul
if exist "%~dp0backend\logs\web_port.txt" del /f /q "%~dp0backend\logs\web_port.txt" >nul 2>nul

:: Brief pause to ensure the Windows TCP stack completes socket teardown.
timeout /t 1 /nobreak >nul

:: Use the committed lockfile. Auditing is handled by CI and release builds.
echo [INFO] Checking frontend dependencies...
cd frontend
call pnpm install --frozen-lockfile
if errorlevel 1 (
    echo [ERROR] Failed to install frontend dependencies.
    pause
    exit /b 1
)
cd ..

echo [INFO] Launching Backend...
set "FH6_SKIP_VENV=1"
start "FH6 Telemetry Backend" cmd /c "start_backend.bat"

echo [INFO] Waiting for Backend to be ready on port 8001...
set "BACKEND_READY=0"
for /l %%i in (1, 1, 30) do (
    if "!BACKEND_READY!"=="0" (
        timeout /t 1 /nobreak >nul
        if exist "%~dp0backend\logs\web_port.txt" (
            set "BACKEND_READY=1"
        ) else if exist "%~dp0logs\web_port.txt" (
            set "BACKEND_READY=1"
        )
    )
)

if "!BACKEND_READY!"=="1" (
    set "ACTUAL_PORT=8001"
    if exist "%~dp0backend\logs\web_port.txt" set /p ACTUAL_PORT=<"%~dp0backend\logs\web_port.txt"
    if exist "%~dp0logs\web_port.txt" set /p ACTUAL_PORT=<"%~dp0logs\web_port.txt"
    echo [SUCCESS] Backend is listening and ready on port !ACTUAL_PORT!.
) else (
    echo [WARNING] Backend readiness timed out after 30s; proceeding with Frontend anyway.
)

echo [INFO] Launching Frontend...
start "FH6 Telemetry Frontend" cmd /c "start_frontend.bat"
echo All services started! You can close this window.
