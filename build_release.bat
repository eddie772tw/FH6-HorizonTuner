@echo off
setlocal enabledelayedexpansion

echo ====================================================================
echo      FH6 HorizonTuner - Standalone Release Bundler
echo ====================================================================
echo.

echo [INFO] Running Cargo Build for Backend...
echo --------------------------------------------------------------------
cd "%~dp0backend"
cargo build --release
cd "%~dp0"

echo [INFO] Running Tauri Build...
echo --------------------------------------------------------------------
cd "%~dp0frontend"
call npm install
call npm run tauri build
cd "%~dp0"

echo [INFO] Assembling standalone bundle...
echo --------------------------------------------------------------------
if not exist "%~dp0dist" mkdir "%~dp0dist"

copy /y "%~dp0backend\target\release\backend.exe" "%~dp0dist\backend.exe"
copy /y "%~dp0frontend\src-tauri\target\release\frontend.exe" "%~dp0dist\FH6-HorizonTuner.exe"
copy /y "%~dp0backend\car_database.json" "%~dp0dist\car_database.json"
copy /y "%~dp0backend\analysis_worker.py" "%~dp0dist\analysis_worker.py"
xcopy /s /y /i "%~dp0backend\car_params" "%~dp0dist\car_params"
xcopy /s /y /i "%~dp0lang" "%~dp0dist\lang"

echo --------------------------------------------------------------------
echo [SUCCESS] Standalone bundle created successfully.
echo.

echo ====================================================================
echo      FH6 HorizonTuner standalone bundle created successfully
echo ====================================================================
