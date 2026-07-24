@echo off
title FH6 Telemetry Backend
echo Starting FH6 Telemetry Backend...
cd /D "%~dp0"
if exist ".venv\Scripts\activate.bat" (
    call .venv\Scripts\activate.bat
)
python -m backend.update_car_db
python -m backend.main
pause

