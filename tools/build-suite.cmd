@echo off
python "%~dp0build-suite.py" %*
exit /b %errorlevel%
