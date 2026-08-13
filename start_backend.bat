@echo off
title FH6 Telemetry Backend
echo Starting FH6 Telemetry Backend...
cd /D "%~dp0backend"
"%~dp0.venv\Scripts\python.exe" update_car_db.py
"%~dp0.venv\Scripts\python.exe" main.py
pause
