@echo off
setlocal
cd /D "%~dp0"
call cargo fetch --locked --manifest-path backend-rust\Cargo.toml
if errorlevel 1 exit /b 1
call pnpm -C frontend install --frozen-lockfile --reporter append-only
exit /b %errorlevel%
