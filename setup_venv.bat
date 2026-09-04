@echo off
setlocal

:: Create and repair the project-local Python environment through uv.
set "ROOT_DIR=%~dp0"
set "VENV_DIR=%ROOT_DIR%.venv"
set "VENV_PY=%VENV_DIR%\Scripts\python.exe"
set "UV_EXE=uv"
set "PYTHON_VERSION=3.13"

:: uv is the only interpreter resolver used by the project scripts.
where.exe uv >nul 2>nul
if errorlevel 1 (
    echo [ERROR] uv was not found on PATH. Install uv and retry.
    exit /b 1
)

:: An environment made by an old or unsupported interpreter must be rebuilt.
if exist "%VENV_PY%" (
    "%UV_EXE%" run --no-project --python "%VENV_PY%" python -c "import sys; raise SystemExit(0 if sys.version_info[:2] == (3, 13) else 1)" >nul 2>nul
    if errorlevel 1 (
        echo [WARNING] Existing .venv is not Python %PYTHON_VERSION%; rebuilding it with uv.
        goto :full_rebuild
    )
) else (
    echo [INFO] Creating project virtual environment at "%VENV_DIR%" ...
    "%UV_EXE%" venv --python %PYTHON_VERSION% --managed-python "%VENV_DIR%"
    if errorlevel 1 goto :venv_error
)

:: Fast path: a healthy environment needs no reinstall.
call :healthcheck
if not errorlevel 1 goto :success

:: First repair in place. This fixes stale, missing, or mismatched packages
:: without removing the environment itself.
echo [WARNING] Existing .venv failed health checks; repairing dependencies ...
call :install_dependencies force
if not errorlevel 1 (
    call :healthcheck
    if not errorlevel 1 goto :success
)

:: Last resort: remove only the project-local .venv and recreate it cleanly.
echo [WARNING] In-place repair failed; recreating the project .venv ...
:full_rebuild
echo [INFO] Recreating "%VENV_DIR%" with uv-managed Python %PYTHON_VERSION% ...
"%UV_EXE%" venv --python %PYTHON_VERSION% --managed-python --clear "%VENV_DIR%"
if errorlevel 1 goto :venv_error
call :install_dependencies clean
if errorlevel 1 goto :dependency_error
call :healthcheck
if errorlevel 1 goto :dependency_error
goto :success

:install_dependencies
echo [INFO] Installing project dependencies from requirements.txt ...
if /i "%~1" == "force" (
    "%UV_EXE%" pip install --python "%VENV_PY%" --no-cache --upgrade --reinstall --requirement "%ROOT_DIR%requirements.txt"
) else (
    "%UV_EXE%" pip install --python "%VENV_PY%" --requirement "%ROOT_DIR%requirements.txt"
)
exit /b %errorlevel%

:healthcheck
echo [INFO] Verifying all required Python dependencies ...
"%UV_EXE%" pip check --python "%VENV_PY%" >nul
if errorlevel 1 exit /b 1
:: Keep this list in sync with every direct requirement in requirements.txt.
:: winrt is intentionally imported through its real runtime module: uv may
:: install the distribution successfully, but a successful download alone is not sufficient.
"%UV_EXE%" run --no-project --python "%VENV_PY%" python -c "import fastapi, httpx, numpy, pydantic, pytest, pytest_asyncio, ruff, soundcard, uvicorn, websockets; import multipart; import winrt.windows.foundation; import winrt.windows.foundation.collections; import winrt.windows.media; import winrt.windows.media.control" >nul 2>nul
exit /b %errorlevel%

:venv_error
echo [ERROR] Failed to create the project virtual environment.
exit /b 1

:dependency_error
echo [ERROR] Python dependency repair failed. See the uv output above.
exit /b 1

:success
echo [SUCCESS] Project virtual environment is ready.
exit /b 0
