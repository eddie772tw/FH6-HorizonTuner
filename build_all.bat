@echo off
setlocal
cd /D "%~dp0"
set "PY_EXE=%~dp0.venv\Scripts\python.exe"
if not exist "%PY_EXE%" goto :missing
if not exist "frontend\node_modules\.bin\tauri.cmd" goto :missing
call uv pip show --python "%PY_EXE%" pyinstaller
if errorlevel 1 goto :missing
call uv run --offline --no-project --python "%PY_EXE%" python scripts\validate_version_consistency.py
if errorlevel 1 exit /b 1

echo [BUILD] Shared frontend
call pnpm -C frontend run build
if errorlevel 1 exit /b 1
if /I "%FH6_RUN_PNPM_AUDIT%"=="1" call pnpm -C frontend audit --reporter append-only

echo [BUILD] Release Python sidecar
call uv run --offline --no-project --python "%PY_EXE%" python scripts\prepare_discord_application_id.py
if errorlevel 1 goto :failure
call uv run --offline --no-project --python "%PY_EXE%" python scripts\build_sidecar.py server-sidecar.spec --clean --noconfirm
if errorlevel 1 goto :failure
if not exist "frontend\src-tauri\bin" mkdir "frontend\src-tauri\bin"
copy /Y "dist\server-sidecar-x86_64-pc-windows-msvc.exe" "frontend\src-tauri\bin\server-sidecar-x86_64-pc-windows-msvc.exe" >nul
if errorlevel 1 goto :failure

cd /D "%~dp0frontend"
call :variant "src-tauri/tauri.full.conf.json" "%~dp0dist\FH6-HorizonTuner.exe"
if errorlevel 1 goto :failure
call :variant "src-tauri/tauri.lite.conf.json" "%~dp0dist\FH6-HorizonTuner_lite.exe"
if errorlevel 1 goto :failure
del /Q "%~dp0dist\server-sidecar-x86_64-pc-windows-msvc.exe"
call :cleanup
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
call :cleanup
echo [ERROR] Packaging failed. See the failed command above.
exit /b 1
:cleanup
if exist "%~dp0backend\discord_application_id.json" del /Q "%~dp0backend\discord_application_id.json"
exit /b 0
