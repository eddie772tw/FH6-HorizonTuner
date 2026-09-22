@echo off
setlocal
cd /D "%~dp0"
call "%~dp0setup_dev.bat"
if errorlevel 1 exit /b 1
echo [READY] Rust and frontend dependencies are ready. Run build_all.bat.
exit /b 0
