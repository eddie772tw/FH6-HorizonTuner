@echo off
setlocal
REM FH6-HorizonTuner Agent CLI Windows Launcher
REM Compatible with standalone binary dist/fh6-agent.exe and uv/Python environment.

set "SCRIPT_DIR=%~dp0"
set "BINARY_DIST=%SCRIPT_DIR%dist\fh6-agent.exe"
set "BINARY_ROOT=%SCRIPT_DIR%fh6-agent.exe"
set "VENV_PY=%SCRIPT_DIR%.venv\Scripts\python.exe"

REM 1. If standalone binary exists, invoke it directly
REM Source checkouts always run current code, never a stale dist executable.
if exist "%SCRIPT_DIR%backend\agent_cli.py" goto :source
if exist "%BINARY_ROOT%" goto :binary_root
if exist "%BINARY_DIST%" goto :binary_dist
goto :source

:binary_root
"%BINARY_ROOT%" %*
exit /b %errorlevel%

:binary_dist
"%BINARY_DIST%" %*
exit /b %errorlevel%

:source
cd /D "%SCRIPT_DIR%"
REM 2. Use the project uv / Python virtualenv
where.exe uv >nul 2>nul
if errorlevel 1 goto :environment_error
if not exist "%VENV_PY%" goto :environment_error
uv run --no-project --python "%VENV_PY%" -m backend.agent_cli %*
exit /b %errorlevel%

:environment_error
echo [ERROR] Project Python environment is unavailable. Run setup_venv.bat first.
exit /b 1
