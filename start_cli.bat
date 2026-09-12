@echo off
setlocal
REM =========================================================================
REM FH6-HorizonTuner - Standalone Agent CLI Launcher
REM Launches the fh6-agent CLI environment (offline/online pure math & telemetry)
REM =========================================================================

cd /D "%~dp0"
title FH6 HorizonTuner Agent CLI

echo =========================================================================
echo   FH6-HorizonTuner Agent CLI Interactive Environment
echo =========================================================================
echo.

REM 1. Run initial diagnostic status
call "%~dp0fh6-agent.bat" status

echo.
echo [HINT] Available Quick Commands:
echo   fh6-agent solve chassis --weight 1450 --bias 52 --drive AWD --goal road --json
echo   fh6-agent solve gearing --max-rpm 8500 --peak-hp-rpm 7800 --top-speed 320 --gears 6 --json
echo   fh6-agent cars search "Civic" --limit 5 --json
echo   fh6-agent mcp-config --client all --json
echo   fh6-agent --help
echo.
echo -------------------------------------------------------------------------
echo Entering Agent CLI prompt. Type your commands below:
echo -------------------------------------------------------------------------
echo.

REM Keep command prompt interactive
cmd /k
