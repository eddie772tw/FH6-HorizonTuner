@echo off
setlocal enabledelayedexpansion

echo ====================================================================
echo      FH6 HorizonTuner - Sidecar Release Bundler
echo ====================================================================
echo.

:: 1. Prepare the project-local virtual environment
set "VENV_DIR=%~dp0.venv"
set "PY_EXE=%VENV_DIR%\Scripts\python.exe"
set "UV_EXE=uv"

where.exe uv >nul 2>nul
if errorlevel 1 (
    echo [ERROR] uv was not found on PATH. Install uv and retry.
    if not "%GITHUB_ACTIONS%" == "true" pause
    exit /b 1
)

call "%~dp0setup_venv.bat"
if errorlevel 1 exit /b 1
"%UV_EXE%" pip install --python "%PY_EXE%" --upgrade "pyinstaller>=6.10,<7.0"
if errorlevel 1 exit /b 1

:: 1.5. Scan for unregistered directories (not ignored and not packaged)
echo [INFO] Scanning for unregistered resource directories...
echo --------------------------------------------------------------------
set "HAS_UNREGISTERED=false"

for /d %%D in ("%~dp0*") do (
    set "DIR_NAME=%%~nxD"
    set "IS_IGNORED=false"
    
    :: Check if directory is listed in .pkgdirignore
    if exist "%~dp0.pkgdirignore" (
        for /f "usebackq tokens=* eol=#" %%I in ("%~dp0.pkgdirignore") do (
            if /i "%%~nxD" == "%%I" set "IS_IGNORED=true"
        )
    )
    
    if "!IS_IGNORED!" == "false" (
        :: Check if it's already packaged in the root server-sidecar.spec
        findstr /I /C:"%%~nxD" "%~dp0server-sidecar.spec" >nul
        if errorlevel 1 (
            echo.
            echo [WARNING] Found directory '%%~nxD' that is neither ignored nor packaged in server-sidecar.spec.
            if "%GITHUB_ACTIONS%" == "true" (
                echo [ERROR] Unregistered directory '%%~nxD' found in CI. Terminating.
                exit /b 1
            )
            choice /C YN /T 10 /D N /M "Would you like to add '%%~nxD' to .pkgdirignore?"
            if !errorlevel! equ 1 (
                echo [INFO] Adding '%%~nxD' to .pkgdirignore...
                echo.>> "%~dp0.pkgdirignore"
                echo %%~nxD>> "%~dp0.pkgdirignore"
                echo [SUCCESS] Added '%%~nxD' to .pkgdirignore.
            ) else (
                echo.
                echo [IMPORTANT] Please add '%%~nxD' to packaging options or .pkgdirignore.
                echo [INFO] Building process will now terminate.
                pause
                exit /b 1
            )
        )
    )
)
echo [SUCCESS] No unregistered resource directories found.
echo.

:: 2. Build Python Backend Sidecar Executable with PyInstaller
echo [INFO] Preparing Discord Application ID for the embedded sidecar...
echo --------------------------------------------------------------------
call "%PY_EXE%" "%~dp0scripts\prepare_discord_application_id.py"
if errorlevel 1 goto :build_failure

echo [INFO] Building Python Backend Sidecar with PyInstaller...
echo --------------------------------------------------------------------
"%UV_EXE%" run --no-project --python "%PY_EXE%" python -m PyInstaller "%~dp0server-sidecar.spec" --clean
if errorlevel 1 (
    echo.
    echo [ERROR] PyInstaller Sidecar bundling encountered an error!
    goto :build_failure
)

set "TAURI_BIN_DIR=%~dp0frontend\src-tauri\bin"
if not exist "%TAURI_BIN_DIR%" mkdir "%TAURI_BIN_DIR%"

copy /Y "%~dp0dist\server-sidecar-x86_64-pc-windows-msvc.exe" "%TAURI_BIN_DIR%\server-sidecar-x86_64-pc-windows-msvc.exe"
if errorlevel 1 (
    echo [ERROR] Failed to copy Sidecar executable to Tauri bin directory.
    goto :build_failure
)
if not exist "%TAURI_BIN_DIR%\server-sidecar-x86_64-pc-windows-msvc.exe" (
    echo [ERROR] Embedded sidecar input is missing from the Tauri source directory.
    goto :build_failure
)
echo [SUCCESS] Python Backend Sidecar created and placed in Tauri bin directory.
echo.

:: 3. Build the shared frontend distribution once, then build both Tauri variants.
echo [INFO] Building shared frontend distribution...
echo --------------------------------------------------------------------
cd "%~dp0frontend"
:: Release builds must use the committed lockfile. Do not mutate dependencies during packaging.
call pnpm install --frozen-lockfile || goto :build_failure
call pnpm audit
if errorlevel 1 (
    echo [WARNING] pnpm audit could not complete or found vulnerabilities; continuing with the locked dependency set.
)
call pnpm run build || exit /b 1

echo [INFO] Building Full portable executable...
call pnpm run tauri build --no-bundle --config src-tauri/tauri.full.conf.json || exit /b 1
if not exist "%~dp0dist" mkdir "%~dp0dist"
copy /Y "%~dp0frontend\src-tauri\target\release\FH6-HorizonTuner.exe" "%~dp0dist\FH6-HorizonTuner.exe" || exit /b 1

echo [INFO] Building Lite portable executable...
call pnpm run tauri build --no-bundle --config src-tauri/tauri.lite.conf.json || exit /b 1
copy /Y "%~dp0frontend\src-tauri\target\release\FH6-HorizonTuner.exe" "%~dp0dist\FH6-HorizonTuner_lite.exe" || exit /b 1

if errorlevel 1 (
    echo.
    echo [ERROR] Tauri Build encountered an error!
    goto :build_failure
)
echo [SUCCESS] Tauri Frontend & Main Executable built successfully.
echo.
cd "%~dp0"

:: 4. Validate both preserved variant executables in root dist/.
if not exist "%~dp0dist\FH6-HorizonTuner.exe" (
    echo [ERROR] Release Build executable was not produced.
    goto :build_failure
)
if not exist "%~dp0dist\FH6-HorizonTuner_lite.exe" (
    echo [ERROR] Lite Release Build executable was not produced.
    if not "%GITHUB_ACTIONS%" == "true" pause
    exit /b 1
)

:: 5. Success screen
:: Clean up intermediate sidecar executable from dist directory
if exist "%~dp0dist\server-sidecar-x86_64-pc-windows-msvc.exe" (
    del /F /Q "%~dp0dist\server-sidecar-x86_64-pc-windows-msvc.exe" >nul 2>&1
)
call :cleanup_discord_application_id

echo ====================================================================
echo      FH6 HorizonTuner standalone bundle created successfully
echo ====================================================================
echo  Distribution Executable Path:
echo  %~dp0dist\FH6-HorizonTuner.exe
echo  Lite Distribution Executable Path:
echo  %~dp0dist\FH6-HorizonTuner_lite.exe
echo.
if not "%GITHUB_ACTIONS%" == "true" pause
exit /b 0

:build_failure
call :cleanup_discord_application_id
if not "%GITHUB_ACTIONS%" == "true" pause
exit /b 1

:cleanup_discord_application_id
if exist "%~dp0backend\discord_application_id.json" (
    del /F /Q "%~dp0backend\discord_application_id.json" >nul 2>&1
)
exit /b 0
