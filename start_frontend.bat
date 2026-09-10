@echo off
title FH6 Telemetry Frontend
echo Starting FH6 Telemetry Frontend (Tauri Dev Server)...
cd /D "%~dp0frontend"
if errorlevel 1 exit /b 1
echo [INFO] The first launch may take several minutes to compile Rust dependencies.
call pnpm run tauri dev
set "FRONTEND_EXIT=%errorlevel%"
if not "%FRONTEND_EXIT%"=="0" echo [ERROR] Frontend exited with code %FRONTEND_EXIT%. See the output above.
pause
exit /b %FRONTEND_EXIT%
