@echo off
setlocal
title FH6 HorizonTuner Lite

cd /D "%~dp0"
call "%~dp0setup_venv.bat"
if errorlevel 1 (
    pause
    exit /b 1
)

echo [INFO] Starting shared backend and Lite frontend...
start "FH6 Telemetry Backend" cmd /c "start_backend.bat"
start "FH6 HorizonTuner Lite" cmd /c "start_frontend_lite.bat"
echo Lite frontend started. You can close this window.
