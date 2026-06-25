@echo off
title FH6 Telemetry Tuning Tool
echo Starting both Backend and Frontend...

start "FH6 Telemetry Backend" cmd /c "start_backend.bat"
start "FH6 Telemetry Frontend" cmd /c "start_frontend.bat"

echo All services started! You can close this window.
