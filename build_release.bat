@echo off
setlocal enabledelayedexpansion

echo ====================================================================
echo      FH6 HorizonTuner - Standalone Release Bundler
echo ====================================================================
echo.

cd /D "%~dp0"

:: 1. Scan for unregistered directories (not ignored and not packaged)
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
        :: For Pure Rust architecture, check if directory is registered in Cargo/Tauri resources
        if /i not "%%~nxD" == "frontend" (
            echo.
            echo [WARNING] Found directory '%%~nxD' that is neither ignored nor packaged.
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

:: 2. Run Rust & Frontend Lint/Format Check
echo [INFO] Verifying code formatting and linting...
echo --------------------------------------------------------------------
cargo fmt --manifest-path frontend/src-tauri/Cargo.toml -- --check
if errorlevel 1 (
    echo [WARNING] Cargo formatting check reported issues. Auto-formatting...
    cargo fmt --manifest-path frontend/src-tauri/Cargo.toml
)

:: 3. Run Tauri Build
echo [INFO] Running Pure Rust Tauri Build...
echo --------------------------------------------------------------------
cd "%~dp0frontend"
call npm install || exit /b 1
call npm run tauri build || exit /b 1

if errorlevel 1 (
    echo.
    echo [ERROR] Tauri Build encountered an error!
    if not "%GITHUB_ACTIONS%" == "true" pause
    exit /b 1
)
echo [SUCCESS] Standalone Pure Rust executable built successfully.
echo.
cd "%~dp0"

:: 4. Verification of output binary
set "RELEASE_EXE=%~dp0frontend\src-tauri\target\release\frontend.exe"
if exist "%RELEASE_EXE%" (
    echo ====================================================================
    echo      FH6 HorizonTuner Standalone Executable Created Successfully
    echo ====================================================================
    echo  Distribution Executable Path:
    echo  %RELEASE_EXE%
    echo.
) else (
    echo [INFO] Bundle created. Check frontend/src-tauri/target/release/bundle/ for installer packages.
)

if not "%GITHUB_ACTIONS%" == "true" pause
exit /b 0
