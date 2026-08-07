@echo off
setlocal enabledelayedexpansion

echo ====================================================================
echo      FH6 HorizonTuner - Sidecar Release Bundler
echo ====================================================================
echo.

:: 1. Check and locate virtual environment and PyInstaller
set "VENV_DIR=%~dp0.venv"
set "PY_EXE=%VENV_DIR%\Scripts\python.exe"
set "PYINSTALLER_EXE=%VENV_DIR%\Scripts\pyinstaller.exe"

if exist "%PY_EXE%" (
    if not exist "%PYINSTALLER_EXE%" (
        echo [INFO] PyInstaller not found in virtual environment, installing...
        "%PY_EXE%" -m pip install pyinstaller
        if errorlevel 1 (
            echo [ERROR] Failed to install PyInstaller in virtual environment.
            if not "%GITHUB_ACTIONS%" == "true" pause
            exit /b 1
        )
    )
    set "RUN_PYINSTALLER="%PY_EXE%" -m PyInstaller"
) else (
    where pyinstaller >nul 2>nul
    if !errorlevel! equ 0 (
        set "RUN_PYINSTALLER=pyinstaller"
    ) else (
        where python >nul 2>nul
        if !errorlevel! equ 0 (
            python -m pip install pyinstaller
            set "RUN_PYINSTALLER=python -m PyInstaller"
        ) else (
            echo [ERROR] No valid Python virtual environment or global Python environment found.
            if not "%GITHUB_ACTIONS%" == "true" pause
            exit /b 1
        )
    )
)

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
        :: Check if it's already packaged in backend/server-sidecar.spec
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
echo [INFO] Building Python Backend Sidecar with PyInstaller...
echo --------------------------------------------------------------------
%RUN_PYINSTALLER% "%~dp0server-sidecar.spec" --clean
if errorlevel 1 (
    echo.
    echo [ERROR] PyInstaller Sidecar bundling encountered an error!
    if not "%GITHUB_ACTIONS%" == "true" pause
    exit /b 1
)

set "TAURI_BIN_DIR=%~dp0frontend\src-tauri\bin"
if not exist "%TAURI_BIN_DIR%" mkdir "%TAURI_BIN_DIR%"

copy /Y "%~dp0dist\server-sidecar-x86_64-pc-windows-msvc.exe" "%TAURI_BIN_DIR%\server-sidecar-x86_64-pc-windows-msvc.exe"
if errorlevel 1 (
    echo [ERROR] Failed to copy Sidecar executable to Tauri bin directory.
    if not "%GITHUB_ACTIONS%" == "true" pause
    exit /b 1
)
echo [SUCCESS] Python Backend Sidecar created and placed in Tauri bin directory.
echo.

:: 3. Run Tauri Build
echo [INFO] Running Tauri Build (Packaging Single Standalone Bundle)...
echo --------------------------------------------------------------------
cd "%~dp0frontend"
call pnpm install || exit /b 1
call pnpm audit --fix update || exit /b 1
call pnpm audit
if errorlevel 1 (
    echo.
    echo [ERROR] pnpm audit found unresolved vulnerabilities. Please fix them before building.
    if not "%GITHUB_ACTIONS%" == "true" pause
    exit /b 1
)
call pnpm run tauri build || exit /b 1

if errorlevel 1 (
    echo.
    echo [ERROR] Tauri Build encountered an error!
    if not "%GITHUB_ACTIONS%" == "true" pause
    exit /b 1
)
echo [SUCCESS] Tauri Frontend & Main Executable built successfully.
echo.
cd "%~dp0"

:: 4. Copy final executable to root dist/ directory for 100% upgrade backward compatibility
if not exist "%~dp0dist" mkdir "%~dp0dist"
if exist "%~dp0frontend\src-tauri\target\release\FH6-HorizonTuner.exe" (
    copy /Y "%~dp0frontend\src-tauri\target\release\FH6-HorizonTuner.exe" "%~dp0dist\FH6-HorizonTuner.exe"
)

:: 5. Success screen
echo ====================================================================
echo      FH6 HorizonTuner standalone bundle created successfully
echo ====================================================================
echo  Distribution Executable Path:
echo  %~dp0dist\FH6-HorizonTuner.exe
echo.
if not "%GITHUB_ACTIONS%" == "true" pause
exit /b 0
