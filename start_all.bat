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

:: Terminate old instances to prevent backend port conflicts.
echo [INFO] Terminating old backend instances to prevent port conflicts...
taskkill /F /FI "WINDOWTITLE eq FH6 Telemetry Backend*" /T >nul 2>nul
for /f "tokens=5" %%a in ('netstat -aon ^| find ":8001" ^| find "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>nul
)

:: Use the committed lockfile. Auditing must not mutate frontend dependencies.
echo [INFO] Checking frontend dependencies...
cd frontend
call pnpm install --frozen-lockfile
if errorlevel 1 (
    echo [ERROR] Failed to install frontend dependencies.
    pause
    exit /b 1
)
echo [INFO] Auditing the locked frontend dependency set...
call pnpm audit >nul 2>nul
if errorlevel 1 echo [WARNING] pnpm audit found unresolved vulnerabilities. Please check manually.
cd ..

echo [INFO] Starting Backend and Frontend...
start "FH6 Telemetry Backend" cmd /c "start_backend.bat"
start "FH6 Telemetry Frontend" cmd /c "start_frontend.bat"
echo All services started! You can close this window.
