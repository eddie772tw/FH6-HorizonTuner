@echo off
cd /D "%~dp0frontend"
call pnpm run tauri dev --config src-tauri/tauri.lite.conf.json
