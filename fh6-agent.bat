@echo off
setlocal
REM FH6-HorizonTuner Agent CLI Windows Launcher
REM Compatible with standalone binary dist/fh6-agent.exe and uv/Python environment.

set "SCRIPT_DIR=%~dp0"
set "BINARY_DIST=%SCRIPT_DIR%dist\fh6-agent.exe"
set "BINARY_ROOT=%SCRIPT_DIR%fh6-agent.exe"
set "VENV_PY=%SCRIPT_DIR%.venv\Scripts\python.exe"
set "UV_EXE=uv"

cd /D "%SCRIPT_DIR%"
if exist "%BINARY_ROOT%" goto :binary_root
if exist "%BINARY_DIST%" goto :binary_dist
where.exe uv >nul 2>nul
if errorlevel 1 goto :missing
if not exist "%VENV_PY%" goto :missing
"%UV_EXE%" run --offline --no-project --python "%VENV_PY%" python -m backend.agent_cli %*
exit /b %errorlevel%
:binary_root
"%BINARY_ROOT%" %*
exit /b %errorlevel%
:binary_dist
"%BINARY_DIST%" %*
exit /b %errorlevel%
:missing
echo [ERROR] No supported FH6 agent runtime was found. Run setup_dev.bat first.
exit /b 1
