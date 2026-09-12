@echo off
setlocal
cd /D "%~dp0frontend"
if not exist "node_modules\.bin\tauri.cmd" (
    echo [ERROR] Run setup_dev.bat first.
    exit /b 1
)
call pnpm exec tauri dev --config src-tauri/tauri.lite.conf.json
exit /b %errorlevel%
