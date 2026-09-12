@echo off
setlocal enabledelayedexpansion
REM =========================================================================
REM FH6-HorizonTuner - Backend + Agent CLI Launcher
REM Launches the FastAPI/UDP backend service, waits for readiness, and opens
REM the fh6-agent CLI environment.
REM =========================================================================

cd /D "%~dp0"
title FH6 HorizonTuner Backend + Agent CLI

echo =========================================================================
echo   FH6-HorizonTuner Backend + Agent CLI Environment
echo =========================================================================
echo.

REM 1. Check if backend is already running
set "PORT_FILE=%~dp0logs\web_port.txt"
if not exist "%PORT_FILE%" set "PORT_FILE=%~dp0backend\logs\web_port.txt"

set "BACKEND_ALREADY_RUNNING=0"
if exist "%PORT_FILE%" (
    set /p CURR_PORT=<"%PORT_FILE%"
    for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| find ":!CURR_PORT!" ^| find "LISTENING"') do (
        set "BACKEND_ALREADY_RUNNING=1"
    )
)

if "%BACKEND_ALREADY_RUNNING%"=="1" (
    echo [INFO] Detected running HorizonTuner backend on port !CURR_PORT!.
) else (
    echo [INFO] Starting Backend in background...
    set "FH6_SKIP_VENV=1"
    start "FH6 Telemetry Backend" cmd /c "%~dp0start_backend.bat"

    echo [INFO] Waiting for Backend to bind HTTP port...
    set "READY=0"
    for /l %%i in (1, 1, 20) do (
        if "!READY!"=="0" (
            timeout /t 1 /nobreak >nul
            if exist "%~dp0backend\logs\web_port.txt" set "READY=1"
            if exist "%~dp0logs\web_port.txt" set "READY=1"
        )
    )

    if "!READY!"=="1" (
        set "ACTUAL_PORT=8001"
        if exist "%~dp0backend\logs\web_port.txt" set /p ACTUAL_PORT=<"%~dp0backend\logs\web_port.txt"
        if exist "%~dp0logs\web_port.txt" set /p ACTUAL_PORT=<"%~dp0logs\web_port.txt"
        echo [SUCCESS] Backend ready on port !ACTUAL_PORT!.
    ) else (
        echo [WARNING] Backend startup wait timed out; CLI will operate with fallback.
    )
)

echo.
echo =========================================================================
echo   Live Connection Status
echo =========================================================================
call "%~dp0fh6-agent.bat" status

echo.
echo [HINT] Live Agent Commands:
echo   fh6-agent telemetry snapshot --json
echo   fh6-agent telemetry snapshot --category tires --json
echo   fh6-agent telemetry diagnose --symptom understeer_entry --json
echo   fh6-agent solve full --car-id 302 --save base_road --json
echo   fh6-agent mcp-config --client all --json
echo   fh6-agent --help
echo.
echo -------------------------------------------------------------------------
echo Backend + Agent CLI environment ready. Enter commands below:
echo -------------------------------------------------------------------------
echo.

cmd /k
