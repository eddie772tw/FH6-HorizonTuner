@echo off
title FH6 Telemetry Backend
echo Starting FH6 Telemetry Backend...
cd backend
call ..\.venv\Scripts\activate.bat
python main.py
pause
