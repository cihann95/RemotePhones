@echo off
REM Internal launcher called by START.vbs
REM This ensures ELECTRON_RUN_AS_NODE is unset in the process

set ELECTRON_RUN_AS_NODE=
set PHONE_FARM_TOOLS=%~dp0..\tools

cd /d "%~dp0"
"%~dp0node_modules\electron\dist\electron.exe" .
