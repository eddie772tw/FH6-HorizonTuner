@echo off
setlocal enabledelayedexpansion

echo ====================================================================
echo      FH6 HorizonTuner - Standalone Release Bundler
echo ====================================================================
echo.

:: 1. Check and locate virtual environment and PyInstaller
set "VENV_DIR=%~dp0.venv"
set "PY_EXE=%VENV_DIR%\Scripts\python.exe"
set "PYINSTALLER_EXE=%VENV_DIR%\Scripts\pyinstaller.exe"

if not exist "%PYINSTALLER_EXE%" (
    where pyinstaller >nul 2>nul
    if !errorlevel! equ 0 (
        set "PYINSTALLER_EXE=pyinstaller"
    ) else (
        echo [INFO] PyInstaller not found in virtual environment, checking global Python...
        if exist "%PY_EXE%" (
            "%PY_EXE%" -m pip install pyinstaller
            if errorlevel 1 (
                echo [ERROR] Failed to install PyInstaller in virtual environment.
                if not "%GITHUB_ACTIONS%" == "true" pause
                exit /b 1
            )
        ) else (
            where python >nul 2>nul
            if !errorlevel! equ 0 (
                set "PY_EXE=python"
                "!PY_EXE!" -m pip install pyinstaller
                set "PYINSTALLER_EXE=pyinstaller"
            ) else (
                echo [ERROR] No valid Python virtual environment or global Python environment found.
                if not "%GITHUB_ACTIONS%" == "true" pause
                exit /b 1
            )
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
        :: Check if it's already packaged in this script by searching for its name
        findstr /I /C:"%%~nxD" "%~dp0build_release.bat" >nul
        if errorlevel 1 (
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
                echo [IMPORTANT] Please add '%%~nxD' to build_release.bat packaging options or .pkgdirignore.
                echo [INFO] Building process will now terminate.
                pause
                exit /b 1
            )
        )
    )
)
echo [SUCCESS] No unregistered resource directories found.
echo.

:: 2. Run Tauri Build
echo [INFO] Running Tauri Build...
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
echo [SUCCESS] Tauri Frontend built successfully.
echo.
cd "%~dp0"

:: 2.5. Build C++ DXGI Overlay Tool
echo [INFO] Building C++ DXGI Overlay Tool...
echo --------------------------------------------------------------------
if not exist "%~dp0tool\overlay\build" mkdir "%~dp0tool\overlay\build"
cd "%~dp0tool\overlay\build"
cmake .. -DCMAKE_BUILD_TYPE=Release || exit /b 1
cmake --build . --config Release || exit /b 1
cd "%~dp0"
echo [SUCCESS] C++ DXGI Overlay built successfully.
echo.

:: 3. Build Final Executable with PyInstaller
echo [INFO] Running PyInstaller to create final standalone executable...
echo --------------------------------------------------------------------
if not exist "%~dp0dist" mkdir "%~dp0dist"

"%PYINSTALLER_EXE%" ^
    --noconfirm ^
    --onefile ^
    --windowed ^
    --noupx ^
    --icon="%~dp0app.ico" ^
    --distpath "%~dp0dist" ^
    --name "FH6-HorizonTuner" ^
    --paths "%~dp0backend" ^
    --add-data "%~dp0frontend\src-tauri\target\release\frontend.exe;." ^
    --add-data "backend\car_database.json;." ^
    --add-data "backend\car_params\*;car_params" ^
    --add-data "lang\*;lang" ^
    "%~dp0backend\main.py"

echo --------------------------------------------------------------------

if errorlevel 1 (
    echo.
    echo [ERROR] PyInstaller bundling encountered an error!
    if not "%GITHUB_ACTIONS%" == "true" pause
    exit /b 1
)
echo [SUCCESS] Standalone executable created successfully.
echo.

:: 3.5. Copy Overlay binary to dist/tool
echo [INFO] Copying Overlay binaries to dist/tool...
set "OVERLAY_SRC="
if exist "%~dp0tool\overlay\build\bin\Release\HorizonTunerOverlay.exe" (
    set "OVERLAY_SRC=%~dp0tool\overlay\build\bin\Release\HorizonTunerOverlay.exe"
) else if exist "%~dp0tool\overlay\build\bin\HorizonTunerOverlay.exe" (
    set "OVERLAY_SRC=%~dp0tool\overlay\build\bin\HorizonTunerOverlay.exe"
)

if "%OVERLAY_SRC%" == "" (
    echo [ERROR] Could not find compiled HorizonTunerOverlay.exe!
    exit /b 1
)

if not exist "%~dp0dist\tool" mkdir "%~dp0dist\tool"
copy /y "%OVERLAY_SRC%" "%~dp0dist\tool\" || exit /b 1
echo [SUCCESS] Overlay binaries copied successfully to dist/tool.
echo.

:: 4. Success screen
echo ====================================================================
echo      FH6 HorizonTuner standalone bundle created successfully
echo ====================================================================
echo  Distribution Executable Path:
echo  %~dp0dist\FH6-HorizonTuner.exe
echo.
if not "%GITHUB_ACTIONS%" == "true" pause
exit /b 0
