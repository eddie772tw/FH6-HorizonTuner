@echo off
setlocal enabledelayedexpansion
title FH6 Telemetry Tuning Tool

cd /D "%~dp0"

echo [INFO] Terminating old backend instances to prevent port conflicts...
taskkill /F /FI "WINDOWTITLE eq FH6 Telemetry Backend*" /T >nul 2>nul
taskkill /F /IM backend.exe /T >nul 2>nul
for /f "tokens=5" %%a in ('netstat -aon ^| find ":8001" ^| find "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>nul
)
for /f "tokens=5" %%a in ('netstat -aon ^| find ":8000" ^| find "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>nul
)

echo [INFO] Starting Backend and Frontend...
start "FH6 Telemetry Backend" cmd /c "start_backend.bat"
start "FH6 Telemetry Frontend" cmd /c "start_frontend.bat"

echo All services started! You can close this window.
