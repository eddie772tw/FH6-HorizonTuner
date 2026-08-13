@echo off
setlocal

:: Create and repair the project-local Python environment.
set "ROOT_DIR=%~dp0"
set "VENV_DIR=%ROOT_DIR%.venv"
set "VENV_PY=%VENV_DIR%\Scripts\python.exe"
set "PY_EXE="

:: Prefer the Python launcher so all entry points select the same interpreter.
py -3.13 -c "import sys" >nul 2>nul
if not errorlevel 1 set "PY_EXE=py -3.13"
if not defined PY_EXE (
    py -3.14 -c "import sys" >nul 2>nul
    if not errorlevel 1 set "PY_EXE=py -3.14"
)
if not defined PY_EXE (
    where python >nul 2>nul
    if not errorlevel 1 set "PY_EXE=python"
)
if not defined PY_EXE (
    echo [ERROR] Python 3.13 or 3.14 is required but was not found.
    exit /b 1
)
%PY_EXE% -c "import sys; raise SystemExit(0 if sys.version_info[:2] in ((3, 13), (3, 14)) else 1)" >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Project requires Python 3.13 or 3.14.
    %PY_EXE% --version
    exit /b 1
)

:: An environment made by an old or unsupported interpreter must be rebuilt.
if exist "%VENV_PY%" (
    "%VENV_PY%" -c "import sys; raise SystemExit(0 if sys.version_info[:2] in ((3, 13), (3, 14)) else 1)" >nul 2>nul
    if errorlevel 1 (
        echo [WARNING] Existing .venv uses an unsupported Python version; rebuilding it.
        goto :full_rebuild
    )
) else (
    echo [INFO] Creating project virtual environment at "%VENV_DIR%" ...
    %PY_EXE% -m venv "%VENV_DIR%"
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
if exist "%VENV_DIR%" rmdir /S /Q "%VENV_DIR%"
if exist "%VENV_DIR%" (
    echo [ERROR] Could not remove the damaged .venv. Close processes using it and retry.
    exit /b 1
)
%PY_EXE% -m venv "%VENV_DIR%"
if errorlevel 1 goto :venv_error
call :install_dependencies clean
if errorlevel 1 goto :dependency_error
call :healthcheck
if errorlevel 1 goto :dependency_error
goto :success

:install_dependencies
echo [INFO] Installing project dependencies from requirements.txt ...
"%VENV_PY%" -m pip install --disable-pip-version-check --upgrade pip setuptools wheel
if errorlevel 1 exit /b 1
if /i "%~1" == "force" (
    "%VENV_PY%" -m pip install --disable-pip-version-check --no-cache-dir --upgrade --force-reinstall --requirement "%ROOT_DIR%requirements.txt"
) else (
    "%VENV_PY%" -m pip install --disable-pip-version-check --requirement "%ROOT_DIR%requirements.txt"
)
exit /b %errorlevel%

:healthcheck
echo [INFO] Verifying all required Python dependencies ...
"%VENV_PY%" -m pip check >nul
if errorlevel 1 exit /b 1
:: Keep this list in sync with every direct requirement in requirements.txt.
:: winsdk is intentionally imported through its real runtime module: pip may
:: build it from source, but a successful download alone is not sufficient.
"%VENV_PY%" -c "import fastapi, httpx, numpy, pydantic, pytest, pytest_asyncio, ruff, soundcard, uvicorn, websockets; import multipart; import winsdk.windows.media.control" >nul 2>nul
exit /b %errorlevel%

:venv_error
echo [ERROR] Failed to create the project virtual environment.
exit /b 1

:dependency_error
echo [ERROR] Python dependency repair failed. See the pip output above.
exit /b 1

:success
echo [SUCCESS] Project virtual environment is ready.
exit /b 0
