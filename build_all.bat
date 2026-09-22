@echo off
setlocal
cd /D "%~dp0"
where cargo >nul 2>nul
if errorlevel 1 goto :missing
if not exist "frontend\node_modules\.bin\tauri.cmd" goto :missing

echo [BUILD] Shared frontend
call pnpm -C frontend run build
if errorlevel 1 exit /b 1
if /I "%FH6_RUN_PNPM_AUDIT%"=="1" call pnpm -C frontend audit --reporter append-only

echo [BUILD] Release Rust sidecar
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\build_backend.ps1
if errorlevel 1 goto :failure

cd /D "%~dp0frontend"
call :variant "src-tauri/tauri.full.conf.json" "%~dp0dist\FH6-HorizonTuner.exe"
if errorlevel 1 goto :failure
call :variant "src-tauri/tauri.lite.conf.json" "%~dp0dist\FH6-HorizonTuner_lite.exe"
if errorlevel 1 goto :failure
del /Q "%~dp0dist\server-sidecar-x86_64-pc-windows-msvc.exe"

echo [SUCCESS] dist\FH6-HorizonTuner.exe and dist\FH6-HorizonTuner_lite.exe
exit /b 0

:variant
echo [BUILD] %~1
call pnpm exec tauri build --no-bundle --config "%~1"
if errorlevel 1 exit /b 1
copy /Y "%~dp0frontend\src-tauri\target\release\FH6-HorizonTuner.exe" "%~2" >nul
exit /b %errorlevel%

:missing
echo [ERROR] Run setup_build.bat before packaging.
exit /b 1
:failure

echo [ERROR] Packaging failed. See the failed command above.
exit /b 1
