@echo off
setlocal
REM Rust CLI: distributed binary or Cargo incremental source build.

set "SCRIPT_DIR=%~dp0"
set "BINARY_DIST=%SCRIPT_DIR%dist\fh6-agent.exe"
set "BINARY_ROOT=%SCRIPT_DIR%fh6-agent.exe"

cd /D "%SCRIPT_DIR%"
if exist "%SCRIPT_DIR%backend-rust\Cargo.toml" goto :source
if exist "%BINARY_ROOT%" goto :binary_root
if exist "%BINARY_DIST%" goto :binary_dist
goto :missing
:source
where.exe cargo >nul 2>nul
if errorlevel 1 goto :missing
cargo run --quiet --locked --manifest-path "%SCRIPT_DIR%backend-rust\Cargo.toml" --bin fh6-agent -- %*
exit /b %errorlevel%
:binary_root
"%BINARY_ROOT%" %*
exit /b %errorlevel%
:binary_dist
"%BINARY_DIST%" %*
exit /b %errorlevel%
:missing
echo [ERROR] Rust or fh6-agent.exe was not found. Run setup_dev.bat first.
exit /b 1
