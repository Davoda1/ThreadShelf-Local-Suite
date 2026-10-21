@echo off
rem Source build/development convenience only; never a packaged app launcher.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0run.ps1" %*
exit /b %errorlevel%
