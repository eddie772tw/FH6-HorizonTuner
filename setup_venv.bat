@echo off
setlocal
cd /D "%~dp0"
set "VENV_PY=%~dp0.venv\Scripts\python.exe"
where.exe uv >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Install uv and run setup_venv.bat again.
    exit /b 1
)
if exist "%VENV_PY%" goto :verify
uv venv --python 3.13 --managed-python "%~dp0.venv"
if errorlevel 1 exit /b 1
:verify
uv run --offline --no-project --python "%VENV_PY%" python "%~dp0scripts\verify_python_environment.py" --version-only
if errorlevel 1 (
    echo [ERROR] Existing .venv is unusable. Move it aside and rerun setup_venv.bat.
    exit /b 1
)
uv pip install --python "%VENV_PY%" --requirement "%~dp0requirements.txt"
if errorlevel 1 exit /b 1
uv pip check --python "%VENV_PY%"
exit /b %errorlevel%
