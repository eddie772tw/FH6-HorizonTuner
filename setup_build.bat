@echo off
setlocal
cd /D "%~dp0"
call "%~dp0setup_dev.bat"
if errorlevel 1 exit /b 1
uv pip install --python "%~dp0.venv\Scripts\python.exe" --requirement "%~dp0requirements-build.txt"
exit /b %errorlevel%
