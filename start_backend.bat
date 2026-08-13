@echo off
title FH6 Telemetry Backend
echo Starting FH6 Telemetry Backend...
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

cd /D "%~dp0backend"
"%UV_EXE%" run --no-project --python "%VENV_PY%" python update_car_db.py
if errorlevel 1 (
    echo [ERROR] Vehicle database update failed.
    pause
    exit /b 1
)
"%UV_EXE%" run --no-project --python "%VENV_PY%" python main.py
pause
