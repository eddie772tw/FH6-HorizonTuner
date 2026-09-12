@echo off
setlocal
cd /D "%~dp0"
call "%~dp0setup_venv.bat"
if errorlevel 1 exit /b 1
call pnpm -C frontend install --frozen-lockfile --reporter append-only
exit /b %errorlevel%
