@echo off
setlocal
REM FH6-HorizonTuner Agent CLI Windows Launcher
REM Compatible with standalone binary dist/fh6-agent.exe and uv/Python environment.

set "SCRIPT_DIR=%~dp0"
set "BINARY_DIST=%SCRIPT_DIR%dist\fh6-agent.exe"
set "BINARY_ROOT=%SCRIPT_DIR%fh6-agent.exe"
set "VENV_PY=%SCRIPT_DIR%.venv\Scripts\python.exe"

REM 1. If standalone binary exists, invoke it directly
if exist "%BINARY_ROOT%" (
    "%BINARY_ROOT%" %*
    exit /b %errorlevel%
)
if exist "%BINARY_DIST%" (
    "%BINARY_DIST%" %*
    exit /b %errorlevel%
)

REM 2. Fall back to project uv / Python virtualenv
where.exe uv >nul 2>nul
if not errorlevel 1 (
    if exist "%VENV_PY%" (
        uv run --no-project --python "%VENV_PY%" -m backend.agent_cli %*
        exit /b %errorlevel%
    )
)

REM 3. Fall back to standard python on PATH
python -m backend.agent_cli %*
exit /b %errorlevel%
