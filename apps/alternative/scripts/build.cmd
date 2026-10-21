@echo off
rem Development/build entry only; excluded from runtime packages.
where py >nul 2>nul
if errorlevel 1 (
  python "%~dp0build.py" %*
) else (
  py -3 "%~dp0build.py" %*
)
exit /b %errorlevel%
